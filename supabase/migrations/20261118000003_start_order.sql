create or replace function public._start_core(p_room_id uuid, p_require_ready boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_st public.room_settings;
  v_session_id uuid;
  v_owners int;
  v_lots int;
  v_auctioneer uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
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
  if p_require_ready and exists (select 1 from public.room_members
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

create or replace function public.start_auction(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms := public._require_host(p_room_id);
begin
  return public._start_core(p_room_id, true);
end;
$$;

drop function public._start_core(uuid);

revoke execute on function public._start_core(uuid, boolean) from public, anon, authenticated;
