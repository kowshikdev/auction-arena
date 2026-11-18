-- Live scouting news, bot targets and AI strategy (LLM layer).
create table public.player_news (
  player_id uuid primary key references public.players (id) on delete cascade,
  summary text not null default '',
  sources jsonb not null default '[]'::jsonb,
  form_adjust int not null default 0 check (form_adjust between -15 and 15),
  available boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.player_news enable row level security;
create policy player_news_read on public.player_news for select to authenticated, anon using (true);

-- Targets are private to the engine: RLS on, no policies.
create table public.bot_targets (
  session_id uuid not null references public.auction_sessions (id) on delete cascade,
  franchise_id text not null references public.franchises (id),
  player_ids uuid[] not null default '{}',
  primary key (session_id, franchise_id)
);
alter table public.bot_targets enable row level security;

alter table public.auction_teams add column ai_strategy text;

create table public.ai_usage (
  id bigint generated always as identity primary key,
  kind text not null,
  model text,
  prompt_tokens int,
  completion_tokens int,
  searches int not null default 0,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ai_usage enable row level security;

create or replace function public._bot_value(p_session uuid, p_team public.auction_teams, p_lot public.auction_lots,
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
  v_news public.player_news;
begin
  select * into v_p from public.players where id = p_lot.player_id;
  if p_team.squad_count >= p_st.squad_max then return 0; end if;
  if v_p.is_overseas and p_team.overseas_count >= p_st.overseas_max then return 0; end if;

  select * into v_r from public.player_ratings where player_id = v_p.id;
  select * into v_news from public.player_news where player_id = v_p.id;
  if found and not v_news.available then return 0; end if;
  v_overall := coalesce(v_r.overall, 45);
  v_form := 0.9 + 0.2 * greatest(0, least(100, coalesce(v_r.form, 50) + coalesce(v_news.form_adjust, 0))) / 100.0;
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
  if exists (select 1 from public.bot_targets bt where bt.session_id = p_session and bt.franchise_id = p_team.franchise_id and v_p.id = any(bt.player_ids)) then
    v_val := v_val * 1.15;
  end if;
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

create or replace function public._bot_act(p_session_id uuid)
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
    if v_next >= 300 and v_s.bid_count >= 2 and random() < 0.2 then
      perform public._emit(v_s.room_id, 'chat_message', jsonb_build_object(
        'user_id', v_best_team.user_id,
        'display_name', (select display_name from public.profiles where id = v_best_team.user_id),
        'franchise_id', v_best_team.franchise_id,
        'body', (array['Not letting this one go.', 'We need this player. Bidding on.', 'Still good value for us.',
                       'Your move.', 'This one fits our squad perfectly.'])[1 + floor(random() * 5)::int]));
    end if;
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

create function public.admin_save_player_news(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  perform public._require_admin();
  insert into public.player_news (player_id, summary, sources, form_adjust, available, updated_at)
  select (r ->> 'player_id')::uuid, left(coalesce(r ->> 'summary', ''), 400), coalesce(r -> 'sources', '[]'::jsonb),
         greatest(-15, least(15, coalesce((r ->> 'form_adjust')::int, 0))), coalesce((r ->> 'available')::boolean, true), now()
  from jsonb_array_elements(p_rows) r
  on conflict (player_id) do update set summary = excluded.summary, sources = excluded.sources,
    form_adjust = excluded.form_adjust, available = excluded.available, updated_at = now();
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'saved', v_n);
end;
$$;

create function public.log_ai_usage(p_kind text, p_model text, p_prompt int, p_completion int, p_searches int, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._uid();
  insert into public.ai_usage (kind, model, prompt_tokens, completion_tokens, searches, ok)
  values (left(p_kind, 30), left(p_model, 60), p_prompt, p_completion, coalesce(p_searches, 0), coalesce(p_ok, true));
end;
$$;

-- Team strategies written by the server after an auction starts. Only bot teams, only once.
create function public.save_ai_strategy(p_room_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_s public.auction_sessions;
  v_item jsonb;
  v_team public.auction_teams;
  v_saved int := 0;
begin
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    perform public._fail('NOT_MEMBER', 'You are not in this room.');
  end if;
  select * into v_s from public.auction_sessions where room_id = p_room_id;
  if not found then return jsonb_build_object('ok', true, 'saved', 0); end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select t.* into v_team from public.auction_teams t join public.profiles p on p.id = t.user_id
    where t.session_id = v_s.id and t.franchise_id = v_item ->> 'franchise_id' and p.is_bot and t.ai_strategy is null;
    continue when not found;
    update public.auction_teams set ai_strategy = left(coalesce(v_item ->> 'strategy', ''), 500)
    where session_id = v_s.id and franchise_id = v_team.franchise_id;
    insert into public.bot_targets (session_id, franchise_id, player_ids)
    select v_s.id, v_team.franchise_id, coalesce(array(
      select x::uuid from jsonb_array_elements_text(coalesce(v_item -> 'targets', '[]'::jsonb)) x
      where exists (select 1 from public.players where id = x::uuid) limit 8), '{}')
    on conflict (session_id, franchise_id) do update set player_ids = excluded.player_ids;
    if coalesce(v_item ->> 'line', '') <> '' then
      perform public._emit(p_room_id, 'chat_message', jsonb_build_object(
        'user_id', v_team.user_id,
        'display_name', (select display_name from public.profiles where id = v_team.user_id),
        'franchise_id', v_team.franchise_id,
        'body', left(v_item ->> 'line', 280)));
    end if;
    v_saved := v_saved + 1;
  end loop;
  return jsonb_build_object('ok', true, 'saved', v_saved);
end;
$$;

revoke execute on function public.admin_save_player_news(jsonb), public.log_ai_usage(text, text, int, int, int, boolean),
  public.save_ai_strategy(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_player_news(jsonb), public.log_ai_usage(text, text, int, int, int, boolean),
  public.save_ai_strategy(uuid, jsonb) to authenticated;
