-- Season-level franchise data (purse and slots ahead of the auction), retained squads at
-- auction start, richer player import, and non-binding passes.

create table public.season_franchises (
  season_id text not null references public.seasons (id) on delete cascade,
  franchise_id text not null references public.franchises (id),
  purse_lakh int not null check (purse_lakh >= 0),
  slots int not null check (slots between 0 and 30),
  overseas_slots int not null check (overseas_slots between 0 and 30),
  primary key (season_id, franchise_id)
);
alter table public.season_franchises enable row level security;
create policy season_franchises_read on public.season_franchises for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- import
-- Adds row keys: available (Y/N, default Y) and stats (JSON object or JSON text).
create or replace function public._import_players(p_season_id text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_name text;
  v_slug text;
  v_role text;
  v_team text;
  v_country text;
  v_stats jsonb;
  v_player_id uuid;
  v_count int := 0;
  v_line int := 0;
begin
  if not exists (select 1 from public.seasons where id = p_season_id) then
    perform public._fail('NO_SEASON', 'Unknown season.');
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    perform public._fail('INVALID_REQUEST', 'Rows must be an array.');
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_line := v_line + 1;
    v_name := trim(coalesce(v_row ->> 'name', ''));
    v_role := upper(trim(coalesce(v_row ->> 'role', '')));
    v_team := nullif(upper(trim(coalesce(v_row ->> 'team', ''))), '');
    v_country := trim(coalesce(v_row ->> 'country', ''));
    v_role := case v_role
      when 'BATTER' then 'BAT' when 'BATSMAN' then 'BAT' when 'BOWLER' then 'BWL'
      when 'ALL-ROUNDER' then 'AR' when 'ALLROUNDER' then 'AR' when 'WICKETKEEPER' then 'WK'
      else v_role end;
    v_stats := case jsonb_typeof(v_row -> 'stats')
      when 'object' then v_row -> 'stats'
      when 'string' then case when nullif(trim(v_row ->> 'stats'), '') is null then null else (v_row ->> 'stats')::jsonb end
      else null end;
    if v_stats is not null and jsonb_typeof(v_stats) <> 'object' then
      v_stats := null;
    end if;

    if char_length(v_name) < 2 or v_country = '' or v_role not in ('BAT', 'BWL', 'AR', 'WK')
       or coalesce((v_row ->> 'base_lakh')::int, 0) < 1
       or (v_team is not null and not exists (select 1 from public.franchises where id = v_team)) then
      perform public._fail('INVALID_ROW', format('Row %s (%s) is not valid.', v_line, coalesce(nullif(v_name, ''), '?')));
    end if;

    v_slug := trim(both '-' from lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')));

    insert into public.players as p (slug, full_name, country, role, batting_style, bowling_style,
                                     is_overseas, is_capped, photo_url, stats, is_active)
    values (v_slug, v_name, v_country, v_role,
            nullif(trim(coalesce(v_row ->> 'batting', '')), ''),
            nullif(trim(coalesce(v_row ->> 'bowling', '')), ''),
            lower(v_country) <> 'india',
            upper(coalesce(v_row ->> 'capped', 'Y')) in ('Y', 'YES', 'TRUE', '1'),
            nullif(trim(coalesce(v_row ->> 'photo_url', '')), ''),
            coalesce(v_stats, '{}'::jsonb),
            upper(coalesce(v_row ->> 'active', 'Y')) in ('Y', 'YES', 'TRUE', '1'))
    on conflict (slug) do update set
      full_name = excluded.full_name, country = excluded.country, role = excluded.role,
      batting_style = coalesce(excluded.batting_style, p.batting_style),
      bowling_style = coalesce(excluded.bowling_style, p.bowling_style),
      is_overseas = excluded.is_overseas, is_capped = excluded.is_capped,
      photo_url = coalesce(excluded.photo_url, p.photo_url),
      stats = case when excluded.stats = '{}'::jsonb then p.stats else excluded.stats end,
      is_active = excluded.is_active, updated_at = now()
    returning p.id into v_player_id;

    insert into public.player_seasons as ps (season_id, player_id, base_price_lakh, auction_set, is_marquee,
                                             franchise_id, is_retained, retention_price_lakh, last_price_lakh, is_available)
    values (p_season_id, v_player_id, (v_row ->> 'base_lakh')::int, 'TBD',
            upper(coalesce(v_row ->> 'marquee', '')) in ('Y', 'YES', 'TRUE', '1'),
            v_team,
            upper(coalesce(v_row ->> 'retained', '')) in ('Y', 'YES', 'TRUE', '1'),
            nullif(v_row ->> 'retention_lakh', '')::int,
            nullif(v_row ->> 'last_price_lakh', '')::int,
            upper(coalesce(nullif(v_row ->> 'available', ''), 'Y')) in ('Y', 'YES', 'TRUE', '1'))
    on conflict (season_id, player_id) do update set
      base_price_lakh = excluded.base_price_lakh, is_marquee = excluded.is_marquee,
      franchise_id = excluded.franchise_id, is_retained = excluded.is_retained,
      retention_price_lakh = coalesce(excluded.retention_price_lakh, ps.retention_price_lakh),
      last_price_lakh = coalesce(excluded.last_price_lakh, ps.last_price_lakh),
      is_available = excluded.is_available;

    v_count := v_count + 1;
  end loop;

  perform public._rebuild_sets(p_season_id);
  return v_count;
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    perform public._fail('INVALID_ROW', format('Row %s has a value that is not valid.', v_line));
    return 0;
end;
$$;

-- Sets are numbered over the auction pool first, so released and unsold players fill
-- set 1, 2, ... and retained or unavailable players only come after them.
create or replace function public._rebuild_sets(p_season_id text)
returns void
language sql
security definer
set search_path = public
as $$
  with categorised as (
    select ps.player_id, ps.base_price_lakh, p.full_name,
      (ps.is_retained or not ps.is_available) as held,
      case
        when ps.is_marquee then 'M'
        else (case when p.is_capped then '' else 'U' end) ||
             (case p.role
                when 'BAT' then 'BA' when 'AR' then 'AL' when 'WK' then 'WK'
                else case
                  when coalesce(p.bowling_style, '') ~* '(fast|medium|pace|seam)' then 'FA'
                  when coalesce(p.bowling_style, '') ~* '(spin|slow|orthodox|chinaman|wrist)' then 'SP'
                  else 'FA' end
              end)
      end as cat
    from public.player_seasons ps
    join public.players p on p.id = ps.player_id
    where ps.season_id = p_season_id
  ),
  numbered as (
    select *, (row_number() over (partition by cat order by held, base_price_lakh desc, full_name) - 1) / 8 + 1 as n
    from categorised
  )
  update public.player_seasons ps set
    auction_set = numbered.cat || numbered.n,
    set_order = case
      when numbered.cat = 'M' then numbered.n
      else numbered.n * 100 + case numbered.cat
        when 'BA' then 1 when 'AL' then 2 when 'WK' then 3 when 'FA' then 4 when 'SP' then 5
        when 'UBA' then 6 when 'UAL' then 7 when 'UWK' then 8 when 'UFA' then 9 else 10 end
    end
  from numbered
  where ps.season_id = p_season_id and ps.player_id = numbered.player_id;
$$;

-- ---------------------------------------------------------------- start
create or replace function public.start_auction(p_room_id uuid)
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

  if v_st.retention_mode = 'season' then
    -- Retained players of franchises playing in this room start in their squads.
    insert into public.team_squads (session_id, player_id, franchise_id, price_lakh, is_retained)
    select v_session_id, ps.player_id, ps.franchise_id, coalesce(ps.retention_price_lakh, 0), true
    from public.player_seasons ps
    join public.players p on p.id = ps.player_id and p.is_active
    join public.auction_teams t on t.session_id = v_session_id and t.franchise_id = ps.franchise_id
    where ps.season_id = v_room.season_id and ps.is_retained;

    update public.auction_teams t set
      squad_count = r.cnt,
      overseas_count = r.overseas,
      purse_remaining_lakh = case
        when exists (select 1 from public.season_franchises sf where sf.season_id = v_room.season_id and sf.franchise_id = t.franchise_id)
          then t.purse_remaining_lakh
        else t.purse_remaining_lakh - r.spent end
    from (
      select sq.franchise_id, sum(sq.price_lakh)::int as spent, count(*)::int as cnt,
             count(*) filter (where p.is_overseas)::int as overseas
      from public.team_squads sq join public.players p on p.id = sq.player_id
      where sq.session_id = v_session_id
      group by sq.franchise_id
    ) r
    where t.session_id = v_session_id and t.franchise_id = r.franchise_id;

    -- The season's purse remaining (after retentions and trades) replaces the room purse.
    update public.auction_teams t set
      purse_initial_lakh = sf.purse_lakh,
      purse_remaining_lakh = sf.purse_lakh
    from public.season_franchises sf
    where t.session_id = v_session_id and sf.season_id = v_room.season_id and sf.franchise_id = t.franchise_id;
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
    return null;
end;
$$;

-- ---------------------------------------------------------------- bidding
-- Passing is no longer final: a franchise that passed may bid again while the lot is open.
create or replace function public.place_bid(p_room_id uuid, p_lot_id uuid, p_amount_lakh int, p_idempotency_key text)
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

  select * into v_s from public.auction_sessions where room_id = p_room_id for update;
  if not found then
    perform public._fail('NOT_RUNNING', 'The auction has not started.');
  end if;
  v_now := clock_timestamp();

  if exists (select 1 from public.bids where session_id = v_s.id and idempotency_key = p_idempotency_key and user_id = v_uid) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'state', public._session_state(v_s.id));
  end if;

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
  if v_s.current_lot_id is distinct from p_lot_id then
    perform public._fail('STALE_LOT', 'That player is no longer up for bidding.');
  end if;
  if v_s.bid_deadline is not null and v_now >= v_s.bid_deadline then
    perform public._fail('BIDDING_CLOSED', 'Time is up for this player.');
  end if;
  if v_s.current_bidder = v_team.franchise_id then
    perform public._fail('ALREADY_HIGHEST', 'You already hold the highest bid.');
  end if;

  select * into v_st from public.room_settings where room_id = p_room_id;
  select * into v_lot from public.auction_lots where id = p_lot_id;
  select * into v_player from public.players where id = v_lot.player_id;

  v_expected := public._next_bid(v_st.increments, v_lot.base_price_lakh, v_s.current_bid_lakh);
  if p_amount_lakh is distinct from v_expected then
    perform public._fail('STALE_BID', 'The bid has moved on. Check the new amount and bid again.');
  end if;

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

  insert into public.bids (session_id, lot_id, franchise_id, user_id, amount_lakh, idempotency_key)
  values (v_s.id, p_lot_id, v_team.franchise_id, v_uid, p_amount_lakh, p_idempotency_key);
  -- Back in the bidding.
  delete from public.lot_passes where lot_id = p_lot_id and franchise_id = v_team.franchise_id;

  select * into v_room from public.rooms where id = p_room_id;
  v_timer := public._lot_timer(v_s, v_st);
  update public.auction_sessions set
    current_bid_lakh = p_amount_lakh,
    current_bidder = v_team.franchise_id,
    bid_count = bid_count + 1,
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

-- Pass = "not bidding for now". When every other franchise has passed, the system
-- auctioneer cuts the clock to a few seconds instead of closing at once, so anyone can
-- still change their mind.
create or replace function public.pass_lot(p_room_id uuid, p_lot_id uuid)
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

  select count(*) into v_remaining from public.auction_teams t
  where t.session_id = v_s.id
    and t.franchise_id is distinct from v_s.current_bidder
    and not exists (select 1 from public.lot_passes p where p.lot_id = p_lot_id and p.franchise_id = t.franchise_id);

  select * into v_room from public.rooms where id = p_room_id;
  if v_remaining = 0 and v_room.auctioneer_type = 'system' and v_s.bid_deadline is not null then
    update public.auction_sessions
    set bid_deadline = least(bid_deadline, clock_timestamp() + interval '4 seconds')
    where id = v_s.id;
  end if;

  perform public._emit(p_room_id, 'franchise_passed', jsonb_build_object(
    'franchise_id', v_team.franchise_id, 'lot_id', p_lot_id,
    'state', public._session_state(v_s.id)
  ));
  return jsonb_build_object('ok', true, 'state', public._session_state(v_s.id));
end;
$$;

-- ---------------------------------------------------------------- admin
create function public.admin_save_season_franchise(
  p_season_id text, p_franchise_id text, p_purse_lakh int, p_slots int, p_overseas_slots int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  insert into public.season_franchises (season_id, franchise_id, purse_lakh, slots, overseas_slots)
  values (p_season_id, p_franchise_id, p_purse_lakh, p_slots, p_overseas_slots)
  on conflict (season_id, franchise_id) do update set
    purse_lakh = excluded.purse_lakh, slots = excluded.slots, overseas_slots = excluded.overseas_slots;
  return jsonb_build_object('ok', true);
exception
  when check_violation or foreign_key_violation then
    perform public._fail('INVALID_SETTINGS', 'Purse or slot values are not valid.');
    return null;
end;
$$;

revoke execute on function public.admin_save_season_franchise(text, text, int, int, int) from public, anon;
grant execute on function public.admin_save_season_franchise(text, text, int, int, int) to authenticated;
revoke execute on function public._import_players(text, jsonb), public._rebuild_sets(text) from public, anon, authenticated;
revoke execute on function public.start_auction(uuid), public.place_bid(uuid, uuid, int, text), public.pass_lot(uuid, uuid) from public, anon;
grant execute on function public.start_auction(uuid), public.place_bid(uuid, uuid, int, text), public.pass_lot(uuid, uuid) to authenticated;
