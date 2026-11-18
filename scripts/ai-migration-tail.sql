-- ---------------------------------------------------------------- bot brain
-- Maximum a bot will pay for the open lot, in lakhs. Deterministic per (session, team, player).
create function public._bot_value(p_session uuid, p_team public.auction_teams, p_lot public.auction_lots,
                                  p_st public.room_settings, p_persona text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p public.players;
  v_r public.player_ratings;
  v_overall numeric;
  v_fair numeric;
  v_need numeric := 1;
  v_pers numeric := 1;
  v_form numeric;
  v_noise numeric;
  v_amp numeric;
  v_cnt int;
  v_target int;
  v_slots int;
  v_cap numeric;
  v_val numeric;
begin
  select * into v_p from public.players where id = p_lot.player_id;
  if p_team.squad_count >= p_st.squad_max then return 0; end if;
  if v_p.is_overseas and p_team.overseas_count >= p_st.overseas_max then return 0; end if;

  select * into v_r from public.player_ratings where player_id = v_p.id;
  v_overall := coalesce(v_r.overall, 45);
  v_form := 0.9 + 0.2 * coalesce(v_r.form, 50) / 100.0;
  -- Price curve: ~Rs 0.9 cr at rating 50, ~4 cr at 70, ~12 cr at 85, ~25 cr at 95.
  v_fair := least(2800, 20 * exp((v_overall - 30) / 13.5));

  -- Team need: how many of this role the squad already has against a 25-man shape.
  select count(*) into v_cnt
  from public.team_squads sq join public.players pl on pl.id = sq.player_id
  where sq.session_id = p_session and sq.franchise_id = p_team.franchise_id and pl.role = v_p.role;
  v_target := case v_p.role when 'WK' then 2 when 'BAT' then 6 when 'AR' then 5 else 8 end;
  v_need := case
    when v_cnt < v_target - 1 then 1.25
    when v_cnt < v_target then 1.1
    when v_cnt = v_target then 0.85
    else 0.6 end;
  if v_p.role = 'WK' and v_cnt >= 3 then v_need := 0.3; end if;

  v_pers := case p_persona
    when 'aggressive' then 1.15
    when 'value' then case when v_overall >= 80 then 0.8 else 0.95 end
    when 'star' then case when v_overall >= 80 then 1.25 else 0.85 end
    when 'youth' then case when not v_p.is_capped then 1.25 else 0.95 end
    else 1 end;

  v_amp := case p_st.ai_difficulty when 'easy' then 0.25 when 'hard' then 0.05 else 0.12 end;
  v_noise := 1 + v_amp * (2 * public._bot_hash(p_session::text || p_team.franchise_id || v_p.id::text) - 1);

  v_val := v_fair * v_need * v_pers * v_form * v_noise * case when p_lot.round > 1 then 0.8 else 1 end;
  if v_need >= 1.1 and v_overall >= 40 then
    v_val := greatest(v_val, p_lot.base_price_lakh);
  end if;

  -- Never outspend: share of purse per open slot, with a star allowance, and the engine reserve.
  v_slots := greatest(1, p_st.squad_max - p_team.squad_count);
  v_cap := least(p_team.purse_remaining_lakh * 0.5,
                 (p_team.purse_remaining_lakh::numeric / v_slots) * (1 + greatest(0, v_overall - 50) / 6.0));
  v_val := least(v_val, v_cap, public._max_bid(p_session, p_team, p_st), p_team.purse_remaining_lakh);
  return greatest(0, floor(v_val)::int);
end;
$$;

-- Plans the next bot reaction a human-like moment after the table changes.
create function public._schedule_bots(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.auction_sessions;
  v_at timestamptz;
begin
  select * into v_s from public.auction_sessions where id = p_session_id;
  if not exists (select 1 from public.auction_teams t join public.profiles p on p.id = t.user_id
                 where t.session_id = p_session_id and p.is_bot) then
    return;
  end if;
  v_at := clock_timestamp() + make_interval(secs => 0.7 + random() * 1.5);
  if v_s.bid_deadline is not null then
    v_at := least(v_at, v_s.bid_deadline - interval '900 milliseconds');
    v_at := greatest(v_at, clock_timestamp() + interval '300 milliseconds');
  end if;
  update public.auction_sessions set next_bot_at = v_at where id = p_session_id;
end;
$$;

-- One bot reaction: weak bots pass, one eager bot raises the bid. Caller holds the session lock.
create function public._bot_act(p_session_id uuid)
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
  v_team public.auction_teams;
  v_next int;
  v_val int;
  v_f text;
  v_persona text;
  v_score float8;
  v_best_score float8 := -1;
  v_best_team public.auction_teams;
  v_remaining int;
begin
  select * into v_s from public.auction_sessions where id = p_session_id;
  update public.auction_sessions set next_bot_at = null where id = p_session_id;
  if v_s.status <> 'live' or v_s.phase <> 'bidding' or v_s.current_lot_id is null then return; end if;
  select * into v_room from public.rooms where id = v_s.room_id;
  select * into v_st from public.room_settings where room_id = v_s.room_id;
  select * into v_lot from public.auction_lots where id = v_s.current_lot_id;
  v_next := public._next_bid(v_st.increments, v_lot.base_price_lakh, v_s.current_bid_lakh);

  for v_f in
    select t.franchise_id from public.auction_teams t join public.profiles p on p.id = t.user_id
    where t.session_id = p_session_id and p.is_bot and t.franchise_id is distinct from v_s.current_bidder
  loop
    select * into v_team from public.auction_teams where session_id = p_session_id and franchise_id = v_f;
    select m.bot_persona into v_persona from public.room_members m where m.room_id = v_s.room_id and m.user_id = v_team.user_id;
    v_val := public._bot_value(p_session_id, v_team, v_lot, v_st, v_persona);
    if v_val < v_next then
      insert into public.lot_passes (lot_id, franchise_id) values (v_lot.id, v_f) on conflict do nothing;
    else
      -- Bigger headroom and a little luck decide which interested bot raises first.
      v_score := (v_val - v_next)::float8 / greatest(v_next, 1) + random();
      if v_score > v_best_score then v_best_score := v_score; v_best_team := v_team; end if;
    end if;
  end loop;

  if v_best_team.franchise_id is not null then
    insert into public.bids (session_id, lot_id, franchise_id, user_id, amount_lakh, idempotency_key)
    values (p_session_id, v_lot.id, v_best_team.franchise_id, v_best_team.user_id, v_next, 'bot-' || gen_random_uuid()::text);
    delete from public.lot_passes where lot_id = v_lot.id and franchise_id = v_best_team.franchise_id;
    update public.auction_sessions set
      current_bid_lakh = v_next,
      current_bidder = v_best_team.franchise_id,
      bid_count = bid_count + 1,
      bid_deadline = case when v_room.auctioneer_type = 'system' or bid_deadline is not null
        then clock_timestamp() + make_interval(secs => public._lot_timer(v_s, v_st)) end
    where id = p_session_id;
    update public.auction_teams set bids_placed = bids_placed + 1
    where session_id = p_session_id and franchise_id = v_best_team.franchise_id;
    perform public._schedule_bots(p_session_id);
    perform public._emit(v_s.room_id, 'bid_accepted', jsonb_build_object(
      'bid', jsonb_build_object('lot_id', v_lot.id, 'franchise_id', v_best_team.franchise_id,
                                'amount_lakh', v_next, 'created_at', clock_timestamp(), 'is_bot', true),
      'state', public._session_state(p_session_id)));
    return;
  end if;

  -- Nobody left to raise: if every other franchise has passed, shorten the clock like pass_lot does.
  select count(*) into v_remaining from public.auction_teams t
  where t.session_id = p_session_id and t.franchise_id is distinct from v_s.current_bidder
    and not exists (select 1 from public.lot_passes lp where lp.lot_id = v_lot.id and lp.franchise_id = t.franchise_id);
  if v_remaining = 0 and v_room.auctioneer_type = 'system' and v_s.bid_deadline is not null then
    update public.auction_sessions set bid_deadline = least(bid_deadline, clock_timestamp() + interval '4 seconds')
    where id = p_session_id;
  end if;
  perform public._emit(v_s.room_id, 'bots_passed', jsonb_build_object('state', public._session_state(p_session_id)));
end;
$$;

create or replace function public._tick(p_session_id uuid)
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
  if v_s.phase = 'bidding' and v_s.next_bot_at is not null and v_s.next_bot_at <= v_now then
    perform public._bot_act(p_session_id);
    return true;
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------- seating bots
create function public._make_bot(p_room_id uuid, p_franchise text, p_persona text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_persona text := coalesce(p_persona, (array['aggressive', 'value', 'star', 'youth', 'balanced'])[1 + floor(random() * 5)::int]);
  v_label text;
begin
  select id || ' AI' into v_label from public.franchises where id = p_franchise;
  insert into public.profiles (id, display_name, is_bot, is_guest) values (v_id, v_label, true, false);
  insert into public.room_members (room_id, user_id, franchise_id, is_ready, bot_persona)
  values (p_room_id, v_id, p_franchise, true, v_persona);
  return v_id;
end;
$$;

-- Seats bots on free franchises until p_target seats are taken.
create function public._seat_bots(p_room_id uuid, p_target int, p_persona text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_have int;
  v_f text;
  v_added int := 0;
begin
  select count(*) into v_have from public.room_members where room_id = p_room_id;
  while v_have < p_target loop
    select f.id into v_f from public.franchises f
    where not exists (select 1 from public.room_members m where m.room_id = p_room_id and m.franchise_id = f.id)
    order by random() limit 1;
    exit when v_f is null;
    perform public._make_bot(p_room_id, v_f, p_persona);
    v_have := v_have + 1;
    v_added := v_added + 1;
  end loop;
  return v_added;
end;
$$;

create function public.add_ai_owner(p_room_id uuid, p_franchise text default null, p_persona text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms := public._require_host(p_room_id);
  v_f text := p_franchise;
begin
  if v_room.status <> 'lobby' then
    perform public._fail('AUCTION_STARTED', 'AI owners can only be added in the lobby.');
  end if;
  if (select count(*) from public.room_members where room_id = p_room_id) >= v_room.max_participants then
    perform public._fail('ROOM_FULL', 'This room is full.');
  end if;
  if v_f is null then
    select f.id into v_f from public.franchises f
    where not exists (select 1 from public.room_members m where m.room_id = p_room_id and m.franchise_id = f.id)
    order by random() limit 1;
  end if;
  if v_f is null or exists (select 1 from public.room_members where room_id = p_room_id and franchise_id = v_f) then
    perform public._fail('FRANCHISE_TAKEN', 'That franchise already has an owner.');
  end if;
  perform public._make_bot(p_room_id, v_f, p_persona);
  perform public._emit(p_room_id, 'participant_joined', jsonb_build_object('franchise_id', v_f, 'is_bot', true));
  return jsonb_build_object('ok', true, 'franchise_id', v_f);
exception
  when check_violation then
    perform public._fail('INVALID_SETTINGS', 'Unknown AI personality.');
    return null;
end;
$$;

create function public.fill_with_ai(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms := public._require_host(p_room_id);
  v_added int;
begin
  if v_room.status <> 'lobby' then
    perform public._fail('AUCTION_STARTED', 'AI owners can only be added in the lobby.');
  end if;
  v_added := public._seat_bots(p_room_id, v_room.max_participants);
  perform public._emit(p_room_id, 'participant_joined', jsonb_build_object('is_bot', true, 'count', v_added));
  return jsonb_build_object('ok', true, 'added', v_added);
end;
$$;

create function public.set_ai_options(p_room_id uuid, p_difficulty text default null, p_autofill_sec int default null, p_clear_autofill boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms := public._require_host(p_room_id);
begin
  if v_room.status <> 'lobby' then
    perform public._fail('AUCTION_STARTED', 'Locked once the auction starts.');
  end if;
  update public.room_settings set
    ai_difficulty = coalesce(p_difficulty, ai_difficulty),
    ai_autofill_sec = case when p_clear_autofill then null else coalesce(p_autofill_sec, ai_autofill_sec) end,
    ai_autofill_at = case when p_clear_autofill then null
      when p_autofill_sec is not null then clock_timestamp() + make_interval(secs => p_autofill_sec)
      else ai_autofill_at end
  where room_id = p_room_id;
  perform public._emit(p_room_id, 'settings_updated', '{}'::jsonb);
  return jsonb_build_object('ok', true);
exception when check_violation then
  perform public._fail('INVALID_SETTINGS', 'Option out of range.');
  return null;
end;
$$;

-- Seats bots, gives franchise-less humans a random free one, readies everyone and starts.
create function public._fill_and_start(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_u uuid;
  v_f text;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.status <> 'lobby' then return null; end if;
  for v_u in select user_id from public.room_members where room_id = p_room_id and franchise_id is null loop
    select f.id into v_f from public.franchises f
    where not exists (select 1 from public.room_members m where m.room_id = p_room_id and m.franchise_id = f.id)
    order by random() limit 1;
    update public.room_members set franchise_id = v_f where room_id = p_room_id and user_id = v_u;
  end loop;
  perform public._seat_bots(p_room_id, v_room.max_participants);
  update public.room_members set is_ready = true where room_id = p_room_id;
  update public.room_settings set ai_autofill_at = null where room_id = p_room_id;
  return public._start_core(p_room_id);
end;
$$;

create or replace function public.start_auction(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms := public._require_host(p_room_id);
begin
  if v_room.status = 'lobby' and exists (
    select 1 from public.room_members where room_id = p_room_id and not is_ready and user_id <> v_room.host_id) then
    perform public._fail('NOT_READY', 'Everyone must be marked ready before starting.');
  end if;
  return public._start_core(p_room_id);
end;
$$;

create function public.create_solo_room(
  p_franchise text default null,
  p_ai_count int default 7,
  p_difficulty text default 'normal',
  p_timer_sec int default 20,
  p_pool_limit int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := public._uid();
  v_created jsonb;
  v_room_id uuid;
  v_f text := p_franchise;
begin
  if p_ai_count not between 3 and 9 or p_difficulty not in ('easy', 'normal', 'hard')
     or p_timer_sec not between 5 and 60 or (p_pool_limit is not null and p_pool_limit not between 20 and 1000) then
    perform public._fail('INVALID_SETTINGS', 'Solo options are not valid.');
  end if;
  if v_f is not null and not exists (select 1 from public.franchises where id = v_f) then
    perform public._fail('INVALID_FRANCHISE', 'Unknown franchise.');
  end if;
  v_created := public.create_room('Solo vs AI', 'private', 10, 'system', null, 'You against AI franchise owners.',
    jsonb_build_object('bid_timer_sec', p_timer_sec)
    || case when p_pool_limit is not null then jsonb_build_object('pool_limit', p_pool_limit) else '{}'::jsonb end);
  v_room_id := (v_created ->> 'room_id')::uuid;
  if v_f is null then
    select id into v_f from public.franchises order by random() limit 1;
  end if;
  update public.room_settings set ai_difficulty = p_difficulty where room_id = v_room_id;
  update public.room_members set franchise_id = v_f, is_ready = true where room_id = v_room_id and user_id = v_uid;
  perform public._seat_bots(v_room_id, 1 + p_ai_count);
  perform public._start_core(v_room_id);
  return jsonb_build_object('ok', true, 'room_id', v_room_id, 'code', v_created ->> 'code');
end;
$$;

-- ---------------------------------------------------------------- backstop clock
create or replace function public._tick_all()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select r.id from public.rooms r join public.room_settings s on s.room_id = r.id
    where r.status = 'lobby' and s.ai_autofill_at is not null and s.ai_autofill_at <= clock_timestamp()
      and exists (select 1 from public.room_members m join public.profiles p on p.id = m.user_id
                  where m.room_id = r.id and not p.is_bot)
  loop
    begin
      perform public._fill_and_start(v_id);
    exception when others then
      update public.room_settings set ai_autofill_at = null where room_id = v_id;
    end;
  end loop;

  for v_id in
    select id from public.auction_sessions
    where status = 'live'
      and ((phase = 'bidding' and (bid_deadline <= clock_timestamp() or next_bot_at <= clock_timestamp()))
        or (phase in ('intro', 'result') and next_at <= clock_timestamp()))
  loop
    perform 1 from public.auction_sessions where id = v_id for update skip locked;
    if found then
      perform public._tick(v_id);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- members json + privileges
create or replace function public._members_json(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', m.user_id,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'is_guest', p.is_guest,
    'is_bot', p.is_bot,
    'bot_persona', m.bot_persona,
    'franchise_id', m.franchise_id,
    'is_ready', m.is_ready,
    'joined_at', m.joined_at,
    'last_seen_at', m.last_seen_at
  ) order by m.joined_at), '[]'::jsonb)
  from public.room_members m
  join public.profiles p on p.id = m.user_id
  where m.room_id = p_room_id;
$$;

revoke execute on function
  public._bot_value(uuid, public.auction_teams, public.auction_lots, public.room_settings, text),
  public._schedule_bots(uuid), public._bot_act(uuid), public._make_bot(uuid, text, text),
  public._seat_bots(uuid, int, text), public._fill_and_start(uuid), public._start_core(uuid),
  public._bot_hash(text)
  from public, anon, authenticated;
revoke execute on function public.add_ai_owner(uuid, text, text), public.fill_with_ai(uuid),
  public.set_ai_options(uuid, text, int, boolean), public.create_solo_room(text, int, text, int, int),
  public.start_auction(uuid), public.place_bid(uuid, uuid, int, text), public.leave_room(uuid), public.find_match()
  from public, anon;
grant execute on function public.add_ai_owner(uuid, text, text), public.fill_with_ai(uuid),
  public.set_ai_options(uuid, text, int, boolean), public.create_solo_room(text, int, text, int, int),
  public.start_auction(uuid), public.place_bid(uuid, uuid, int, text), public.leave_room(uuid), public.find_match()
  to authenticated;
