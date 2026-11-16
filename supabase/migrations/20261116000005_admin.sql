-- Administration: player catalogue, seasons, rooms and reports.
-- Every function checks profiles.is_admin on the server.

create function public._require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
begin
  if not exists (select 1 from public.profiles where id = v_uid and is_admin) then
    perform public._fail('NOT_ADMIN', 'Administrator access is required.');
  end if;
  return v_uid;
end;
$$;

-- Bootstrap: the first registered (non-guest) account may claim admin while none exists.
create function public.claim_admin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
begin
  perform pg_advisory_xact_lock(hashtext('auctionarena_claim_admin'));
  if exists (select 1 from public.profiles where is_admin) then
    perform public._fail('ADMIN_EXISTS', 'An administrator already exists. Ask them to grant access.');
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_guest) then
    perform public._fail('GUEST_NOT_ALLOWED', 'Create an account before claiming admin access.');
  end if;
  update public.profiles set is_admin = true where id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_set_admin(p_user_id uuid, p_is_admin boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_admin();
begin
  if p_user_id = v_uid and not p_is_admin then
    perform public._fail('INVALID_TARGET', 'You cannot remove your own admin access.');
  end if;
  update public.profiles set is_admin = p_is_admin where id = p_user_id and not is_guest;
  return jsonb_build_object('ok', found);
end;
$$;

-- Recompute auction sets for a season: marquee sets first, then capped and uncapped
-- groups by role, eight players per set, ordered like a real auction list.
create function public._rebuild_sets(p_season_id text)
returns void
language sql
security definer
set search_path = public
as $$
  with categorised as (
    select ps.player_id, ps.base_price_lakh, p.full_name,
      case
        when ps.is_marquee then 'M'
        else (case when p.is_capped then '' else 'U' end) ||
             (case p.role
                when 'BAT' then 'BA' when 'AR' then 'AL' when 'WK' then 'WK'
                else case when coalesce(p.bowling_style, '') ilike '%spin%' then 'SP' else 'FA' end
              end)
      end as cat
    from public.player_seasons ps
    join public.players p on p.id = ps.player_id
    where ps.season_id = p_season_id
  ),
  numbered as (
    select *, (row_number() over (partition by cat order by base_price_lakh desc, full_name) - 1) / 8 + 1 as n
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

-- Upsert players for a season from a JSON array of rows (CSV import and seed share this).
-- Row keys: name, team, country, role, capped, base_lakh, marquee, bowling, batting,
--           retained, retention_lakh, last_price_lakh, photo_url, active.
create function public._import_players(p_season_id text, p_rows jsonb)
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

    if char_length(v_name) < 2 or v_country = '' or v_role not in ('BAT', 'BWL', 'AR', 'WK')
       or coalesce((v_row ->> 'base_lakh')::int, 0) < 1
       or (v_team is not null and not exists (select 1 from public.franchises where id = v_team)) then
      perform public._fail('INVALID_ROW', format('Row %s (%s) is not valid.', v_line, coalesce(nullif(v_name, ''), '?')));
    end if;

    v_slug := trim(both '-' from lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')));

    insert into public.players as p (slug, full_name, country, role, batting_style, bowling_style,
                                     is_overseas, is_capped, photo_url, is_active)
    values (v_slug, v_name, v_country, v_role,
            nullif(trim(coalesce(v_row ->> 'batting', '')), ''),
            nullif(trim(coalesce(v_row ->> 'bowling', '')), ''),
            lower(v_country) <> 'india',
            upper(coalesce(v_row ->> 'capped', 'Y')) in ('Y', 'YES', 'TRUE', '1'),
            nullif(trim(coalesce(v_row ->> 'photo_url', '')), ''),
            upper(coalesce(v_row ->> 'active', 'Y')) in ('Y', 'YES', 'TRUE', '1'))
    on conflict (slug) do update set
      full_name = excluded.full_name, country = excluded.country, role = excluded.role,
      batting_style = coalesce(excluded.batting_style, p.batting_style),
      bowling_style = coalesce(excluded.bowling_style, p.bowling_style),
      is_overseas = excluded.is_overseas, is_capped = excluded.is_capped,
      photo_url = coalesce(excluded.photo_url, p.photo_url),
      is_active = excluded.is_active, updated_at = now()
    returning p.id into v_player_id;

    insert into public.player_seasons as ps (season_id, player_id, base_price_lakh, auction_set, is_marquee,
                                             franchise_id, is_retained, retention_price_lakh, last_price_lakh)
    values (p_season_id, v_player_id, (v_row ->> 'base_lakh')::int, 'TBD',
            upper(coalesce(v_row ->> 'marquee', '')) in ('Y', 'YES', 'TRUE', '1'),
            v_team,
            upper(coalesce(v_row ->> 'retained', '')) in ('Y', 'YES', 'TRUE', '1'),
            nullif(v_row ->> 'retention_lakh', '')::int,
            nullif(v_row ->> 'last_price_lakh', '')::int)
    on conflict (season_id, player_id) do update set
      base_price_lakh = excluded.base_price_lakh, is_marquee = excluded.is_marquee,
      franchise_id = excluded.franchise_id, is_retained = excluded.is_retained,
      retention_price_lakh = coalesce(excluded.retention_price_lakh, ps.retention_price_lakh),
      last_price_lakh = coalesce(excluded.last_price_lakh, ps.last_price_lakh);

    v_count := v_count + 1;
  end loop;

  perform public._rebuild_sets(p_season_id);
  return v_count;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    perform public._fail('INVALID_ROW', format('Row %s has a value that is not a number.', v_line));
    return 0;
end;
$$;

create function public.admin_import_players(p_season_id text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform public._require_admin();
  if jsonb_array_length(p_rows) > 2000 then
    perform public._fail('INVALID_REQUEST', 'Import at most 2000 rows at a time.');
  end if;
  v_count := public._import_players(p_season_id, p_rows);
  return jsonb_build_object('ok', true, 'imported', v_count);
end;
$$;

-- Edit one player's season record: team, retention, price, set membership, availability.
create function public.admin_update_player(p_season_id text, p_player_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_patch ? 'franchise_id' and (p_patch ->> 'franchise_id') is not null
     and not exists (select 1 from public.franchises where id = p_patch ->> 'franchise_id') then
    perform public._fail('INVALID_FRANCHISE', 'Unknown franchise.');
  end if;
  if p_patch ? 'role' and (p_patch ->> 'role') not in ('BAT', 'BWL', 'AR', 'WK') then
    perform public._fail('INVALID_ROW', 'Role must be BAT, BWL, AR or WK.');
  end if;

  update public.players p set
    full_name = coalesce(nullif(trim(p_patch ->> 'full_name'), ''), p.full_name),
    country = coalesce(nullif(trim(p_patch ->> 'country'), ''), p.country),
    is_overseas = case when p_patch ? 'country' then lower(trim(p_patch ->> 'country')) <> 'india' else p.is_overseas end,
    role = coalesce(p_patch ->> 'role', p.role),
    is_capped = coalesce((p_patch ->> 'is_capped')::boolean, p.is_capped),
    batting_style = case when p_patch ? 'batting_style' then nullif(trim(p_patch ->> 'batting_style'), '') else p.batting_style end,
    bowling_style = case when p_patch ? 'bowling_style' then nullif(trim(p_patch ->> 'bowling_style'), '') else p.bowling_style end,
    photo_url = case when p_patch ? 'photo_url' then nullif(trim(p_patch ->> 'photo_url'), '') else p.photo_url end,
    stats = case when p_patch ? 'stats' and jsonb_typeof(p_patch -> 'stats') = 'object' then p_patch -> 'stats' else p.stats end,
    is_active = coalesce((p_patch ->> 'is_active')::boolean, p.is_active),
    updated_at = now()
  where p.id = p_player_id;
  if not found then
    perform public._fail('NOT_FOUND', 'Player not found.');
  end if;

  update public.player_seasons ps set
    base_price_lakh = coalesce((p_patch ->> 'base_price_lakh')::int, ps.base_price_lakh),
    is_marquee = coalesce((p_patch ->> 'is_marquee')::boolean, ps.is_marquee),
    franchise_id = case when p_patch ? 'franchise_id' then p_patch ->> 'franchise_id' else ps.franchise_id end,
    is_retained = coalesce((p_patch ->> 'is_retained')::boolean, ps.is_retained),
    retention_price_lakh = case when p_patch ? 'retention_price_lakh' then (p_patch ->> 'retention_price_lakh')::int else ps.retention_price_lakh end,
    is_available = coalesce((p_patch ->> 'is_available')::boolean, ps.is_available)
  where ps.season_id = p_season_id and ps.player_id = p_player_id;

  perform public._rebuild_sets(p_season_id);
  return jsonb_build_object('ok', true);
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation then
    perform public._fail('INVALID_ROW', 'One of the values is not valid.');
    return null;
end;
$$;

create function public.admin_delete_player(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  -- Players that already appeared in an auction are kept for history and only deactivated.
  if exists (select 1 from public.auction_lots where player_id = p_player_id) then
    update public.players set is_active = false, updated_at = now() where id = p_player_id;
    return jsonb_build_object('ok', true, 'deactivated', true);
  end if;
  delete from public.players where id = p_player_id;
  return jsonb_build_object('ok', true, 'deleted', found);
end;
$$;

create function public.admin_save_season(p_id text, p_name text, p_year int, p_default_rules jsonb, p_activate boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_id !~ '^[a-z0-9-]{3,40}$' or char_length(trim(coalesce(p_name, ''))) < 2 or p_year not between 2008 and 2100 then
    perform public._fail('INVALID_REQUEST', 'Season id, name or year is not valid.');
  end if;
  if p_default_rules ? 'increments' and not public._valid_increments(p_default_rules -> 'increments') then
    perform public._fail('INVALID_SETTINGS', 'Bid increment table is not valid.');
  end if;
  insert into public.seasons (id, name, year, default_rules)
  values (p_id, trim(p_name), p_year, coalesce(p_default_rules, '{}'::jsonb))
  on conflict (id) do update set name = excluded.name, year = excluded.year, default_rules = excluded.default_rules;
  if p_activate then
    update public.seasons set is_active = false where is_active and id <> p_id;
    update public.seasons set is_active = true where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_update_franchise(p_id text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update public.franchises f set
    name = coalesce(nullif(trim(p_patch ->> 'name'), ''), f.name),
    city = coalesce(nullif(trim(p_patch ->> 'city'), ''), f.city),
    color_primary = coalesce(nullif(trim(p_patch ->> 'color_primary'), ''), f.color_primary),
    color_secondary = coalesce(nullif(trim(p_patch ->> 'color_secondary'), ''), f.color_secondary),
    logo_path = coalesce(nullif(trim(p_patch ->> 'logo_path'), ''), f.logo_path)
  where f.id = p_id;
  return jsonb_build_object('ok', found);
end;
$$;

create function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'ok', true,
    'counts', jsonb_build_object(
      'users', (select count(*) from public.profiles),
      'guests', (select count(*) from public.profiles where is_guest),
      'players', (select count(*) from public.players where is_active),
      'rooms_open', (select count(*) from public.rooms where status in ('lobby', 'live', 'paused')),
      'auctions_completed', (select count(*) from public.rooms where status = 'completed'),
      'reports_open', (select count(*) from public.reports where status = 'open')
    ),
    'rooms', coalesce((
      select jsonb_agg(x.r order by x.created_at desc) from (
        select r.created_at, jsonb_build_object(
          'room_id', r.id, 'code', r.code, 'name', r.name, 'status', r.status, 'visibility', r.visibility,
          'created_at', r.created_at,
          'host_name', (select display_name from public.profiles p where p.id = r.host_id),
          'member_count', (select count(*) from public.room_members m where m.room_id = r.id)
        ) as r
        from public.rooms r where r.status <> 'closed' order by r.created_at desc limit 100
      ) x), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(x.r order by x.created_at desc) from (
        select rp.created_at, jsonb_build_object(
          'id', rp.id, 'message', rp.message, 'status', rp.status, 'created_at', rp.created_at,
          'room_code', (select code from public.rooms r where r.id = rp.room_id),
          'reporter', (select display_name from public.profiles p where p.id = rp.reporter_id)
        ) as r
        from public.reports rp order by rp.created_at desc limit 100
      ) x), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(jsonb_build_object('user_id', id, 'display_name', display_name))
                        from public.profiles where is_admin), '[]'::jsonb)
  );
end;
$$;

-- Force-close a problem room. A running auction is ended; a lobby is shut.
create function public.admin_close_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.auction_sessions;
  v_status text;
begin
  perform public._require_admin();
  select * into v_s from public.auction_sessions where room_id = p_room_id for update;
  select status into v_status from public.rooms where id = p_room_id;
  if v_status is null then
    perform public._fail('ROOM_NOT_FOUND', 'Room not found.');
  end if;
  if v_s.id is not null and v_s.status <> 'completed' then
    perform public._complete_auction(v_s.id);
  elsif v_status = 'lobby' then
    update public.rooms set status = 'closed' where id = p_room_id;
    perform public._emit(p_room_id, 'room_closed', '{}'::jsonb);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.submit_report(p_message text, p_room_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
begin
  perform public._rate_limit('report', 3, 300);
  if char_length(trim(coalesce(p_message, ''))) not between 3 and 1000 then
    perform public._fail('INVALID_MESSAGE', 'Describe the issue in 3 to 1000 characters.');
  end if;
  insert into public.reports (reporter_id, room_id, message) values (v_uid, p_room_id, trim(p_message));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_resolve_report(p_report_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update public.reports set status = 'resolved' where id = p_report_id;
  return jsonb_build_object('ok', found);
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.claim_admin(),
  public.admin_set_admin(uuid, boolean),
  public.admin_import_players(text, jsonb),
  public.admin_update_player(text, uuid, jsonb),
  public.admin_delete_player(uuid),
  public.admin_save_season(text, text, int, jsonb, boolean),
  public.admin_update_franchise(text, jsonb),
  public.admin_overview(),
  public.admin_close_room(uuid),
  public.submit_report(text, uuid),
  public.admin_resolve_report(bigint)
to authenticated;
