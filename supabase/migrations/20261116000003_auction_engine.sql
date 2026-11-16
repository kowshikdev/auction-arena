-- Authoritative auction engine.
--
-- Concurrency model: every state change first takes `select ... for update` on the
-- room's auction_sessions row, so bids, timer expiry and auctioneer actions for one
-- room run strictly one at a time. Time is read with clock_timestamp() AFTER the lock
-- is held (now() is frozen at transaction start and would let a bid that waited on
-- the lock sneak in after the deadline).
--
-- No server process holds a countdown. The deadline is a timestamp in the session row;
-- tick() closes a lot only when the database clock has passed it. Clients (and a
-- pg_cron sweep) merely ask the server to check.

create function public._next_bid(p_increments jsonb, p_base int, p_current int)
returns int
language plpgsql
immutable
as $$
declare
  v_item jsonb;
begin
  if p_current is null then
    return p_base;
  end if;
  for v_item in select * from jsonb_array_elements(p_increments) loop
    if (v_item ->> 'upto') is null or p_current < (v_item ->> 'upto')::int then
      return p_current + (v_item ->> 'step')::int;
    end if;
  end loop;
  return p_current + 25;
end;
$$;

-- Highest bid a team may place: it must keep enough purse to fill its remaining
-- minimum-squad slots at the cheapest base price still in the pool.
create function public._max_bid(p_session_id uuid, p_team public.auction_teams, p_settings public.room_settings)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_min_base int;
  v_reserve_slots int;
begin
  select coalesce(min(base_price_lakh), 30) into v_min_base
  from public.auction_lots where session_id = p_session_id and status = 'pending';
  v_reserve_slots := greatest(0, p_settings.squad_min - p_team.squad_count - 1);
  return greatest(0, p_team.purse_remaining_lakh - v_reserve_slots * v_min_base);
end;
$$;

create function public._lot_timer(p_session public.auction_sessions, p_settings public.room_settings)
returns int
language sql
immutable
as $$
  select case
    when p_settings.format = 'accelerated' then least(p_settings.bid_timer_sec, 10)
    when p_session.round > 1 then greatest(5, p_settings.bid_timer_sec / 2)
    else p_settings.bid_timer_sec
  end;
$$;

create function public._session_state(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'phase', s.phase,
    'round', s.round,
    'current_lot_id', s.current_lot_id,
    'current_bid_lakh', s.current_bid_lakh,
    'current_bidder', s.current_bidder,
    'bid_count', s.bid_count,
    'bid_deadline', s.bid_deadline,
    'next_at', s.next_at,
    'paused_remaining_ms', s.paused_remaining_ms,
    'lots_total', s.lots_total,
    'lots_done', s.lots_done,
    'timer_sec', public._lot_timer(s, st),
    'next_bid_lakh', case when l.id is not null
      then public._next_bid(st.increments, l.base_price_lakh, s.current_bid_lakh) end,
    'passes', coalesce((select jsonb_agg(p.franchise_id) from public.lot_passes p where p.lot_id = s.current_lot_id), '[]'::jsonb),
    'server_now', clock_timestamp()
  )
  from public.auction_sessions s
  join public.room_settings st on st.room_id = s.room_id
  left join public.auction_lots l on l.id = s.current_lot_id
  where s.id = p_session_id;
$$;

create function public._lot_json(p_lot_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', l.id, 'player_id', l.player_id, 'lot_order', l.lot_order, 'auction_set', l.auction_set,
    'base_price_lakh', l.base_price_lakh, 'status', l.status, 'round', l.round,
    'sold_to', l.sold_to, 'sold_price_lakh', l.sold_price_lakh
  )
  from public.auction_lots l where l.id = p_lot_id;
$$;

create function public._team_json(p_session_id uuid, p_franchise_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(t) from public.auction_teams t
  where t.session_id = p_session_id and t.franchise_id = p_franchise_id;
$$;

-- ---------------------------------------------------------------- lifecycle internals
create function public._complete_auction(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  update public.auction_lots set status = 'unsold', closed_at = clock_timestamp()
  where session_id = p_session_id and status = 'active';
  update public.auction_sessions set
    status = 'completed', phase = 'done', current_lot_id = null, current_bid_lakh = null,
    current_bidder = null, bid_deadline = null, next_at = null, paused_remaining_ms = null,
    completed_at = clock_timestamp()
  where id = p_session_id
  returning room_id into v_room_id;
  update public.rooms set status = 'completed', completed_at = clock_timestamp() where id = v_room_id;
  perform public._emit(v_room_id, 'auction_completed',
    jsonb_build_object('state', public._session_state(p_session_id)));
end;
$$;

create function public._present_next(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.auction_sessions;
  v_room public.rooms;
  v_st public.room_settings;
  v_lot public.auction_lots;
  v_timer int;
begin
  select * into v_s from public.auction_sessions where id = p_session_id;
  select * into v_room from public.rooms where id = v_s.room_id;
  select * into v_st from public.room_settings where room_id = v_s.room_id;

  -- Nobody can take another player: finish.
  if not exists (select 1 from public.auction_teams
                 where session_id = p_session_id and squad_count < v_st.squad_max) then
    perform public._complete_auction(p_session_id);
    return;
  end if;

  select * into v_lot from public.auction_lots
  where session_id = p_session_id and status = 'pending'
  order by lot_order limit 1;

  if not found then
    -- Main list exhausted. Optionally bring unsold players back once (accelerated round).
    if v_st.unsold_reround and v_s.round = 1
       and exists (select 1 from public.auction_lots where session_id = p_session_id and status = 'unsold') then
      update public.auction_lots set status = 'pending', round = 2, closed_at = null
      where session_id = p_session_id and status = 'unsold';
      get diagnostics v_timer = row_count;
      update public.auction_sessions set round = 2, lots_total = lots_total + v_timer where id = p_session_id;
      perform public._emit(v_s.room_id, 'round_started', jsonb_build_object('round', 2));
      perform public._present_next(p_session_id);
      return;
    end if;
    perform public._complete_auction(p_session_id);
    return;
  end if;

  update public.auction_lots set status = 'active' where id = v_lot.id;
  select * into v_s from public.auction_sessions where id = p_session_id;
  v_timer := public._lot_timer(v_s, v_st);

  update public.auction_sessions set
    phase = 'bidding',
    current_lot_id = v_lot.id,
    current_bid_lakh = null,
    current_bidder = null,
    bid_count = 0,
    -- System auctioneer: clock starts at once. Human auctioneer: open until they start a countdown.
    bid_deadline = case when v_room.auctioneer_type = 'system'
      then clock_timestamp() + make_interval(secs => v_timer) end,
    next_at = null,
    paused_remaining_ms = null
  where id = p_session_id;

  perform public._emit(v_s.room_id, 'player_presented', jsonb_build_object(
    'lot', public._lot_json(v_lot.id),
    'state', public._session_state(p_session_id)
  ));
end;
$$;

-- Close the open lot: sold to the highest bidder, or unsold when nobody bid.
create function public._close_lot(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.auction_sessions;
  v_room public.rooms;
  v_st public.room_settings;
  v_lot public.auction_lots;
  v_player public.players;
  v_next_at timestamptz;
begin
  select * into v_s from public.auction_sessions where id = p_session_id;
  if v_s.phase <> 'bidding' or v_s.current_lot_id is null then
    return;
  end if;
  select * into v_room from public.rooms where id = v_s.room_id;
  select * into v_st from public.room_settings where room_id = v_s.room_id;
  select * into v_lot from public.auction_lots where id = v_s.current_lot_id;
  select * into v_player from public.players where id = v_lot.player_id;

  if v_room.auctioneer_type = 'system' then
    v_next_at := clock_timestamp() + make_interval(secs => v_st.result_pause_sec);
  end if;

  if v_s.current_bidder is not null then
    update public.auction_lots set
      status = 'sold', sold_to = v_s.current_bidder, sold_price_lakh = v_s.current_bid_lakh,
      closed_at = clock_timestamp()
    where id = v_lot.id;

    -- Primary key (session_id, player_id) makes a double sale impossible.
    insert into public.team_squads (session_id, player_id, franchise_id, price_lakh)
    values (p_session_id, v_lot.player_id, v_s.current_bidder, v_s.current_bid_lakh);

    -- The purse check constraint (>= 0) is the last line of defence against overspending.
    update public.auction_teams set
      purse_remaining_lakh = purse_remaining_lakh - v_s.current_bid_lakh,
      squad_count = squad_count + 1,
      overseas_count = overseas_count + case when v_player.is_overseas then 1 else 0 end
    where session_id = p_session_id and franchise_id = v_s.current_bidder;

    update public.auction_sessions set
      phase = 'result', bid_deadline = null, next_at = v_next_at, lots_done = lots_done + 1
    where id = p_session_id;

    perform public._emit(v_s.room_id, 'player_sold', jsonb_build_object(
      'lot', public._lot_json(v_lot.id),
      'team', public._team_json(p_session_id, v_s.current_bidder),
      'state', public._session_state(p_session_id)
    ));
  else
    update public.auction_lots set status = 'unsold', closed_at = clock_timestamp() where id = v_lot.id;
    update public.auction_sessions set
      phase = 'result', bid_deadline = null, next_at = v_next_at, lots_done = lots_done + 1
    where id = p_session_id;

    perform public._emit(v_s.room_id, 'player_unsold', jsonb_build_object(
      'lot', public._lot_json(v_lot.id),
      'state', public._session_state(p_session_id)
    ));
  end if;
end;
$$;

-- Advance whatever clock has run out. Caller must hold the session row lock.
create function public._tick(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.auction_sessions;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_s from public.auction_sessions where id = p_session_id;
  if v_s.status <> 'live' then
    return false;
  end if;
  if v_s.phase = 'bidding' and v_s.bid_deadline is not null and v_s.bid_deadline <= v_now then
    perform public._close_lot(p_session_id);
    return true;
  end if;
  if v_s.phase in ('intro', 'result') and v_s.next_at is not null and v_s.next_at <= v_now then
    perform public._present_next(p_session_id);
    return true;
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------- start
create function public.start_auction(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms := public._require_host(p_room_id);
  v_st public.room_settings;
  v_session_id uuid;
  v_owners int;
  v_lots int;
  v_auctioneer uuid;
begin
  if v_room.status <> 'lobby' then
    perform public._fail('AUCTION_STARTED', 'This auction has already started.');
  end if;
  select * into v_st from public.room_settings where room_id = p_room_id;

  v_auctioneer := case when v_room.auctioneer_type = 'human' then coalesce(v_room.auctioneer_id, v_room.host_id) end;
  if v_auctioneer is not null
     and not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_auctioneer) then
    v_auctioneer := v_room.host_id;
  end if;

  select count(*) into v_owners from public.room_members
  where room_id = p_room_id and franchise_id is not null;
  if v_owners < v_st.min_participants then
    perform public._fail('NOT_ENOUGH_PLAYERS',
      format('At least %s franchise owners are needed to start. Currently %s.', v_st.min_participants, v_owners));
  end if;
  if exists (select 1 from public.room_members
             where room_id = p_room_id and franchise_id is null
               and user_id is distinct from v_auctioneer) then
    perform public._fail('MEMBER_WITHOUT_FRANCHISE', 'Every participant must pick a franchise (or be removed) before starting.');
  end if;
  if exists (select 1 from public.room_members
             where room_id = p_room_id and not is_ready and user_id <> v_room.host_id) then
    perform public._fail('NOT_READY', 'Everyone must be marked ready before starting.');
  end if;

  insert into public.auction_sessions (room_id, status, phase)
  values (p_room_id, 'live', case when v_room.auctioneer_type = 'system' then 'intro' else 'idle' end)
  returning id into v_session_id;

  insert into public.auction_teams (session_id, franchise_id, user_id, purse_initial_lakh, purse_remaining_lakh)
  select v_session_id, m.franchise_id, m.user_id, v_st.purse_lakh, v_st.purse_lakh
  from public.room_members m
  where m.room_id = p_room_id and m.franchise_id is not null;

  -- Retentions: players flagged as retained by a franchise that is playing in this room
  -- go straight to that squad and their retention price comes off the purse.
  if v_st.retention_mode = 'season' then
    insert into public.team_squads (session_id, player_id, franchise_id, price_lakh, is_retained)
    select v_session_id, ps.player_id, ps.franchise_id, coalesce(ps.retention_price_lakh, ps.last_price_lakh, ps.base_price_lakh), true
    from public.player_seasons ps
    join public.players p on p.id = ps.player_id and p.is_active
    join public.auction_teams t on t.session_id = v_session_id and t.franchise_id = ps.franchise_id
    where ps.season_id = v_room.season_id and ps.is_retained and ps.is_available;

    update public.auction_teams t set
      purse_remaining_lakh = t.purse_remaining_lakh - r.spent,
      squad_count = r.cnt,
      overseas_count = r.overseas
    from (
      select sq.franchise_id, sum(sq.price_lakh)::int as spent, count(*)::int as cnt,
             count(*) filter (where p.is_overseas)::int as overseas
      from public.team_squads sq join public.players p on p.id = sq.player_id
      where sq.session_id = v_session_id
      group by sq.franchise_id
    ) r
    where t.session_id = v_session_id and t.franchise_id = r.franchise_id;
  end if;

  insert into public.auction_lots (session_id, player_id, lot_order, auction_set, base_price_lakh)
  select v_session_id, q.player_id, row_number() over (order by q.set_order, q.rnd), q.auction_set, q.base_price_lakh
  from (
    select ps.player_id, ps.set_order, ps.auction_set, ps.base_price_lakh, random() as rnd
    from public.player_seasons ps
    join public.players p on p.id = ps.player_id and p.is_active
    where ps.season_id = v_room.season_id and ps.is_available
      and not exists (select 1 from public.team_squads sq where sq.session_id = v_session_id and sq.player_id = ps.player_id)
      and (v_st.retention_mode = 'none' or not ps.is_retained or v_st.inactive_retained_in_pool)
    order by ps.set_order, rnd
    limit coalesce(v_st.pool_limit, 100000)
  ) q;
  get diagnostics v_lots = row_count;
  if v_lots = 0 then
    perform public._fail('NO_PLAYERS', 'The player catalogue for this season is empty.');
  end if;

  update public.auction_sessions set
    lots_total = v_lots,
    next_at = case when v_room.auctioneer_type = 'system' then clock_timestamp() + interval '8 seconds' end
  where id = v_session_id;
  update public.rooms set status = 'live', started_at = clock_timestamp(), auctioneer_id = v_auctioneer
  where id = p_room_id;

  perform public._emit(p_room_id, 'auction_started',
    jsonb_build_object('state', public._session_state(v_session_id)));
  return jsonb_build_object('ok', true, 'session_id', v_session_id, 'lots', v_lots);
exception
  when check_violation then
    perform public._fail('RETENTION_OVER_PURSE', 'Retained players cost more than the purse for at least one franchise.');
end;
$$;

-- ---------------------------------------------------------------- bidding
create function public.place_bid(p_room_id uuid, p_lot_id uuid, p_amount_lakh int, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_s public.auction_sessions;
  v_room public.rooms;
  v_st public.room_settings;
  v_team public.auction_teams;
  v_lot public.auction_lots;
  v_player public.players;
  v_now timestamptz;
  v_expected int;
  v_max int;
  v_timer int;
begin
  perform public._rate_limit('bid', 30, 10);
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 80 then
    perform public._fail('INVALID_REQUEST', 'Missing idempotency key.');
  end if;

  -- 1. Serialise everything for this room.
  select * into v_s from public.auction_sessions where room_id = p_room_id for update;
  if not found then
    perform public._fail('NOT_RUNNING', 'The auction has not started.');
  end if;
  v_now := clock_timestamp();

  -- 2. Duplicate request (double click, retry): report the earlier outcome, change nothing.
  if exists (select 1 from public.bids where session_id = v_s.id and idempotency_key = p_idempotency_key and user_id = v_uid) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'state', public._session_state(v_s.id));
  end if;

  -- 3. Caller must own a franchise in this auction.
  select * into v_team from public.auction_teams where session_id = v_s.id and user_id = v_uid;
  if not found then
    perform public._fail('NOT_OWNER', 'You do not control a franchise in this auction.');
  end if;

  if v_s.status = 'paused' then
    perform public._fail('PAUSED', 'The auction is paused.');
  end if;
  if v_s.status <> 'live' or v_s.phase <> 'bidding' then
    perform public._fail('BIDDING_CLOSED', 'Bidding is not open right now.');
  end if;

  -- 4. Stale client: bidding on a lot that is no longer on the table.
  if v_s.current_lot_id is distinct from p_lot_id then
    perform public._fail('STALE_LOT', 'That player is no longer up for bidding.');
  end if;

  -- 5. The clock has run out, even if nobody has processed the close yet.
  if v_s.bid_deadline is not null and v_now >= v_s.bid_deadline then
    perform public._fail('BIDDING_CLOSED', 'Time is up for this player.');
  end if;

  if v_s.current_bidder = v_team.franchise_id then
    perform public._fail('ALREADY_HIGHEST', 'You already hold the highest bid.');
  end if;
  if exists (select 1 from public.lot_passes where lot_id = p_lot_id and franchise_id = v_team.franchise_id) then
    perform public._fail('PASSED', 'You passed on this player.');
  end if;

  select * into v_st from public.room_settings where room_id = p_room_id;
  select * into v_lot from public.auction_lots where id = p_lot_id;
  select * into v_player from public.players where id = v_lot.player_id;

  -- 6. The only acceptable amount is the next step. Anything else means the client
  --    acted on an old bid (someone else got in first) or tampered with the amount.
  v_expected := public._next_bid(v_st.increments, v_lot.base_price_lakh, v_s.current_bid_lakh);
  if p_amount_lakh is distinct from v_expected then
    perform public._fail('STALE_BID', 'The bid has moved on. Check the new amount and bid again.');
  end if;

  -- 7. Squad and purse constraints.
  if v_team.squad_count >= v_st.squad_max then
    perform public._fail('SQUAD_FULL', 'Your squad is full.');
  end if;
  if v_player.is_overseas and v_team.overseas_count >= v_st.overseas_max then
    perform public._fail('OVERSEAS_LIMIT', 'You have reached the overseas player limit.');
  end if;
  v_max := public._max_bid(v_s.id, v_team, v_st);
  if p_amount_lakh > v_team.purse_remaining_lakh then
    perform public._fail('INSUFFICIENT_PURSE', 'You do not have enough purse left for this bid.');
  end if;
  if p_amount_lakh > v_max then
    perform public._fail('PURSE_RESERVE', 'This bid would leave too little purse to fill your minimum squad.');
  end if;

  -- 8. Record and broadcast.
  insert into public.bids (session_id, lot_id, franchise_id, user_id, amount_lakh, idempotency_key)
  values (v_s.id, p_lot_id, v_team.franchise_id, v_uid, p_amount_lakh, p_idempotency_key);

  select * into v_room from public.rooms where id = p_room_id;
  v_timer := public._lot_timer(v_s, v_st);
  update public.auction_sessions set
    current_bid_lakh = p_amount_lakh,
    current_bidder = v_team.franchise_id,
    bid_count = bid_count + 1,
    -- A valid bid resets the countdown. With a human auctioneer it only resets a countdown they started.
    bid_deadline = case
      when v_room.auctioneer_type = 'system' or bid_deadline is not null
        then clock_timestamp() + make_interval(secs => v_timer)
      end
  where id = v_s.id;
  update public.auction_teams set bids_placed = bids_placed + 1
  where session_id = v_s.id and franchise_id = v_team.franchise_id;

  perform public._emit(p_room_id, 'bid_accepted', jsonb_build_object(
    'bid', jsonb_build_object('lot_id', p_lot_id, 'franchise_id', v_team.franchise_id,
                              'amount_lakh', p_amount_lakh, 'created_at', clock_timestamp()),
    'state', public._session_state(v_s.id)
  ));
  return jsonb_build_object('ok', true, 'state', public._session_state(v_s.id));
end;
$$;

-- Stop bidding on the current player. When every other franchise has passed,
-- the system auctioneer closes the lot at once instead of waiting for the clock.
create function public.pass_lot(p_room_id uuid, p_lot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_s public.auction_sessions;
  v_room public.rooms;
  v_team public.auction_teams;
  v_remaining int;
begin
  perform public._rate_limit('bid', 30, 10);
  select * into v_s from public.auction_sessions where room_id = p_room_id for update;
  if not found or v_s.status <> 'live' or v_s.phase <> 'bidding' then
    perform public._fail('BIDDING_CLOSED', 'Bidding is not open right now.');
  end if;
  if v_s.current_lot_id is distinct from p_lot_id then
    perform public._fail('STALE_LOT', 'That player is no longer up for bidding.');
  end if;
  select * into v_team from public.auction_teams where session_id = v_s.id and user_id = v_uid;
  if not found then
    perform public._fail('NOT_OWNER', 'You do not control a franchise in this auction.');
  end if;
  if v_s.current_bidder = v_team.franchise_id then
    perform public._fail('ALREADY_HIGHEST', 'You hold the highest bid and cannot pass.');
  end if;

  insert into public.lot_passes (lot_id, franchise_id) values (p_lot_id, v_team.franchise_id)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  perform public._emit(p_room_id, 'franchise_passed', jsonb_build_object(
    'franchise_id', v_team.franchise_id, 'lot_id', p_lot_id,
    'state', public._session_state(v_s.id)
  ));

  select count(*) into v_remaining from public.auction_teams t
  where t.session_id = v_s.id
    and t.franchise_id is distinct from v_s.current_bidder
    and not exists (select 1 from public.lot_passes p where p.lot_id = p_lot_id and p.franchise_id = t.franchise_id);

  select * into v_room from public.rooms where id = p_room_id;
  if v_remaining = 0 and v_room.auctioneer_type = 'system' then
    perform public._close_lot(v_s.id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Any member may ask the server to check the clock. The server decides; the caller's
-- own countdown is irrelevant.
create function public.tick(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_s public.auction_sessions;
  v_acted boolean;
begin
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    perform public._fail('NOT_MEMBER', 'You are not in this room.');
  end if;
  select * into v_s from public.auction_sessions where room_id = p_room_id for update;
  if not found then
    return jsonb_build_object('ok', true, 'acted', false);
  end if;
  v_acted := public._tick(v_s.id);
  return jsonb_build_object('ok', true, 'acted', v_acted, 'state', public._session_state(v_s.id));
end;
$$;

-- Backstop for rooms where no browser asked: run by pg_cron every few seconds.
create function public._tick_all()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.auction_sessions
    where status = 'live'
      and ((phase = 'bidding' and bid_deadline <= clock_timestamp())
        or (phase in ('intro', 'result') and next_at <= clock_timestamp()))
  loop
    perform 1 from public.auction_sessions where id = v_id for update skip locked;
    if found then
      perform public._tick(v_id);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- auctioneer / host control
create function public.auctioneer_action(p_room_id uuid, p_action text, p_arg jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_s public.auction_sessions;
  v_room public.rooms;
  v_st public.room_settings;
  v_is_host boolean;
  v_is_auctioneer boolean;
  v_now timestamptz;
  v_bid public.bids;
  v_prev public.bids;
  v_secs int;
begin
  perform public._rate_limit('auctioneer', 30, 10);
  select * into v_s from public.auction_sessions where room_id = p_room_id for update;
  if not found then
    perform public._fail('NOT_RUNNING', 'The auction has not started.');
  end if;
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_st from public.room_settings where room_id = p_room_id;
  v_now := clock_timestamp();
  v_is_host := v_room.host_id = v_uid;
  v_is_auctioneer := v_room.auctioneer_type = 'human' and v_room.auctioneer_id = v_uid;

  if v_s.status = 'completed' then
    perform public._fail('COMPLETED', 'This auction is finished.');
  end if;

  if p_action in ('pause', 'resume', 'end_auction') then
    if not (v_is_host or v_is_auctioneer) then
      perform public._fail('NOT_ALLOWED', 'Only the host or auctioneer can do that.');
    end if;
  elsif not v_is_auctioneer then
    perform public._fail('NOT_AUCTIONEER', 'Only the human auctioneer can do that.');
  end if;

  if p_action = 'pause' then
    if v_s.status <> 'live' then
      perform public._fail('NOT_RUNNING', 'The auction is not running.');
    end if;
    -- Freeze whichever clock was running and remember how much was left on it.
    update public.auction_sessions set
      status = 'paused',
      paused_remaining_ms = case
        when bid_deadline is not null then greatest(1000, (extract(epoch from (bid_deadline - v_now)) * 1000)::int)
        when next_at is not null then greatest(1000, (extract(epoch from (next_at - v_now)) * 1000)::int)
      end,
      bid_deadline = null,
      next_at = null
    where id = v_s.id;
    update public.rooms set status = 'paused' where id = p_room_id;
    perform public._emit(p_room_id, 'auction_paused', jsonb_build_object(
      'reason', left(coalesce(p_arg ->> 'reason', ''), 120), 'state', public._session_state(v_s.id)));

  elsif p_action = 'resume' then
    if v_s.status <> 'paused' then
      perform public._fail('NOT_PAUSED', 'The auction is not paused.');
    end if;
    update public.auction_sessions set
      status = 'live',
      bid_deadline = case when phase = 'bidding' and paused_remaining_ms is not null
        then v_now + make_interval(secs => paused_remaining_ms / 1000.0) end,
      next_at = case when phase in ('intro', 'result') and paused_remaining_ms is not null
        then v_now + make_interval(secs => paused_remaining_ms / 1000.0) end,
      paused_remaining_ms = null
    where id = v_s.id;
    update public.rooms set status = 'live' where id = p_room_id;
    perform public._emit(p_room_id, 'auction_resumed',
      jsonb_build_object('state', public._session_state(v_s.id)));

  elsif p_action = 'end_auction' then
    perform public._complete_auction(v_s.id);

  elsif v_s.status <> 'live' then
    perform public._fail('PAUSED', 'Resume the auction first.');

  elsif p_action = 'present_next' then
    if v_s.phase = 'bidding' then
      perform public._fail('LOT_OPEN', 'Declare the current player sold or unsold first.');
    end if;
    perform public._present_next(v_s.id);

  elsif p_action = 'sold' then
    if v_s.phase <> 'bidding' or v_s.current_bidder is null then
      perform public._fail('NO_BIDS', 'There is no bid to accept.');
    end if;
    perform public._close_lot(v_s.id);

  elsif p_action = 'unsold' then
    if v_s.phase <> 'bidding' then
      perform public._fail('BIDDING_CLOSED', 'No player is open for bidding.');
    end if;
    if v_s.current_bidder is not null then
      perform public._fail('HAS_BIDS', 'This player has a bid. Undo it first, or declare sold.');
    end if;
    perform public._close_lot(v_s.id);

  elsif p_action = 'skip' then
    if v_s.phase <> 'bidding' or v_s.current_bidder is not null then
      perform public._fail('HAS_BIDS', 'Only a player with no bids can be withdrawn.');
    end if;
    update public.auction_lots set status = 'withdrawn', closed_at = v_now where id = v_s.current_lot_id;
    update public.auction_sessions set phase = 'result', bid_deadline = null, lots_done = lots_done + 1
    where id = v_s.id;
    perform public._emit(p_room_id, 'player_withdrawn', jsonb_build_object(
      'lot', public._lot_json(v_s.current_lot_id), 'state', public._session_state(v_s.id)));

  elsif p_action = 'start_countdown' then
    if v_s.phase <> 'bidding' then
      perform public._fail('BIDDING_CLOSED', 'No player is open for bidding.');
    end if;
    v_secs := least(120, greatest(3, coalesce((p_arg ->> 'seconds')::int, public._lot_timer(v_s, v_st))));
    update public.auction_sessions set bid_deadline = v_now + make_interval(secs => v_secs) where id = v_s.id;
    perform public._emit(p_room_id, 'countdown_updated',
      jsonb_build_object('state', public._session_state(v_s.id)));

  elsif p_action = 'stop_countdown' then
    update public.auction_sessions set bid_deadline = null where id = v_s.id and phase = 'bidding';
    perform public._emit(p_room_id, 'countdown_updated',
      jsonb_build_object('state', public._session_state(v_s.id)));

  elsif p_action = 'undo_bid' then
    -- Auction correction: void the latest bid and restore the one before it.
    if v_s.phase <> 'bidding' then
      perform public._fail('BIDDING_CLOSED', 'No player is open for bidding.');
    end if;
    select * into v_bid from public.bids
    where lot_id = v_s.current_lot_id and not is_void order by created_at desc limit 1;
    if not found then
      perform public._fail('NO_BIDS', 'There is no bid to undo.');
    end if;
    update public.bids set is_void = true where id = v_bid.id;
    select * into v_prev from public.bids
    where lot_id = v_s.current_lot_id and not is_void order by created_at desc limit 1;
    update public.auction_sessions set
      current_bid_lakh = v_prev.amount_lakh,
      current_bidder = v_prev.franchise_id,
      bid_count = greatest(0, bid_count - 1)
    where id = v_s.id;
    perform public._emit(p_room_id, 'bid_voided', jsonb_build_object(
      'franchise_id', v_bid.franchise_id, 'amount_lakh', v_bid.amount_lakh,
      'state', public._session_state(v_s.id)));

  else
    perform public._fail('INVALID_ACTION', 'Unknown auctioneer action.');
  end if;

  return jsonb_build_object('ok', true, 'state', public._session_state(v_s.id));
end;
$$;

-- Host appoints an auctioneer, or switches between human and system, at any time.
create function public.set_auctioneer(p_room_id uuid, p_type text, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms := public._require_host(p_room_id, false);
  v_s public.auction_sessions;
  v_st public.room_settings;
  v_user uuid;
  v_now timestamptz;
begin
  if p_type not in ('system', 'human') then
    perform public._fail('INVALID_SETTINGS', 'Auctioneer must be system or human.');
  end if;
  v_user := case when p_type = 'human' then coalesce(p_user_id, v_room.host_id) end;
  if v_user is not null
     and not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_user) then
    perform public._fail('NOT_MEMBER', 'The auctioneer must be in the room.');
  end if;
  if v_room.status = 'completed' then
    perform public._fail('COMPLETED', 'This auction is finished.');
  end if;

  -- Lock order is always session first, then room.
  select * into v_s from public.auction_sessions where room_id = p_room_id for update;
  update public.rooms set auctioneer_type = p_type, auctioneer_id = v_user where id = p_room_id;

  if v_s.id is not null and v_s.status = 'live' then
    select * into v_st from public.room_settings where room_id = p_room_id;
    v_now := clock_timestamp();
    if p_type = 'system' then
      -- Hand the clocks to the system so the auction keeps moving.
      update public.auction_sessions set
        phase = case when phase = 'idle' then 'intro' else phase end,
        next_at = case when phase in ('idle', 'intro', 'result')
          then coalesce(next_at, v_now + interval '4 seconds') end,
        bid_deadline = case when phase = 'bidding'
          then coalesce(bid_deadline, v_now + make_interval(secs => public._lot_timer(v_s, v_st))) end
      where id = v_s.id;
    else
      update public.auction_sessions set
        phase = case when phase = 'intro' then 'idle' else phase end,
        next_at = null
      where id = v_s.id;
    end if;
  end if;

  perform public._emit(p_room_id, 'auctioneer_changed', jsonb_build_object(
    'auctioneer_type', p_type, 'auctioneer_id', v_user,
    'state', case when v_s.id is not null then public._session_state(v_s.id) end));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- snapshot
-- The single authoritative read. Used on page load, refresh, reconnect and whenever
-- a client notices a gap in event sequence numbers.
create function public.get_room_state(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_room public.rooms;
  v_s public.auction_sessions;
  v_member public.room_members;
  v_result jsonb;
begin
  select * into v_room from public.rooms where code = upper(trim(coalesce(p_code, '')));
  if not found or v_room.status = 'closed' then
    perform public._fail('ROOM_NOT_FOUND', 'No room exists with that code.');
  end if;
  select * into v_member from public.room_members where room_id = v_room.id and user_id = v_uid;
  if not found then
    perform public._fail('NOT_MEMBER', 'You are not in this room.');
  end if;
  update public.room_members set last_seen_at = clock_timestamp()
  where room_id = v_room.id and user_id = v_uid;

  select * into v_s from public.auction_sessions where room_id = v_room.id;

  v_result := jsonb_build_object(
    'ok', true,
    'server_now', clock_timestamp(),
    'seq', v_room.event_seq,
    'room', to_jsonb(v_room) - 'event_seq',
    'settings', (select to_jsonb(st) - 'room_id' from public.room_settings st where st.room_id = v_room.id),
    'invite_token', (select invite_token from public.room_secrets where room_id = v_room.id),
    'members', public._members_json(v_room.id),
    'me', jsonb_build_object(
      'user_id', v_uid,
      'franchise_id', v_member.franchise_id,
      'is_host', v_room.host_id = v_uid,
      'is_auctioneer', v_room.auctioneer_type = 'human' and v_room.auctioneer_id = v_uid
    ),
    'chat', coalesce((
      select jsonb_agg(c.payload || jsonb_build_object('seq', c.seq, 'ts', c.created_at) order by c.seq)
      from (
        select e.seq, e.payload, e.created_at from public.auction_events e
        where e.room_id = v_room.id and e.type = 'chat_message'
        order by e.seq desc limit 50
      ) c
    ), '[]'::jsonb)
  );

  if v_s.id is not null then
    v_result := v_result || jsonb_build_object(
      'session', public._session_state(v_s.id),
      'teams', coalesce((select jsonb_agg(to_jsonb(t) order by t.franchise_id)
                         from public.auction_teams t where t.session_id = v_s.id), '[]'::jsonb),
      'lots', coalesce((select jsonb_agg(public._lot_json(l.id) order by l.lot_order)
                        from public.auction_lots l where l.session_id = v_s.id), '[]'::jsonb),
      'squads', coalesce((select jsonb_agg(jsonb_build_object(
                          'player_id', q.player_id, 'franchise_id', q.franchise_id,
                          'price_lakh', q.price_lakh, 'is_retained', q.is_retained,
                          'acquired_at', q.acquired_at) order by q.acquired_at)
                        from public.team_squads q where q.session_id = v_s.id), '[]'::jsonb),
      'bids', coalesce((select jsonb_agg(jsonb_build_object(
                          'lot_id', b.lot_id, 'franchise_id', b.franchise_id,
                          'amount_lakh', b.amount_lakh, 'created_at', b.created_at) order by b.created_at)
                        from public.bids b
                        where b.lot_id = v_s.current_lot_id and not b.is_void), '[]'::jsonb)
    );
  else
    v_result := v_result || jsonb_build_object(
      'session', null, 'teams', '[]'::jsonb, 'lots', '[]'::jsonb, 'squads', '[]'::jsonb, 'bids', '[]'::jsonb);
  end if;
  return v_result;
end;
$$;

-- Events after a given sequence number, for clients that missed a few broadcasts.
create function public.get_events_since(p_room_id uuid, p_after_seq bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_room_member(p_room_id) then
    perform public._fail('NOT_MEMBER', 'You are not in this room.');
  end if;
  return coalesce((
    select jsonb_agg(e.payload || jsonb_build_object('seq', e.seq, 'type', e.type, 'room_id', e.room_id, 'ts', e.created_at) order by e.seq)
    from (
      select * from public.auction_events
      where room_id = p_room_id and seq > p_after_seq order by seq limit 200
    ) e
  ), '[]'::jsonb);
end;
$$;

-- Completed (and running) auctions the caller took part in.
create function public.my_auctions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(q.r order by q.created_at desc), '[]'::jsonb)
  from (
    select r.created_at, jsonb_build_object(
      'room_id', r.id, 'code', r.code, 'name', r.name, 'status', r.status,
      'created_at', r.created_at, 'completed_at', r.completed_at,
      'franchise_id', m.franchise_id,
      'member_count', (select count(*) from public.room_members x where x.room_id = r.id),
      'squad_count', t.squad_count,
      'spent_lakh', t.purse_initial_lakh - t.purse_remaining_lakh
    ) as r
    from public.room_members m
    join public.rooms r on r.id = m.room_id and r.status <> 'closed'
    left join public.auction_sessions s on s.room_id = r.id
    left join public.auction_teams t on t.session_id = s.id and t.user_id = m.user_id
    where m.user_id = (select auth.uid())
    order by r.created_at desc
    limit 50
  ) q;
$$;
