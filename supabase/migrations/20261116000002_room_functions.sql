-- Room and lobby functions. Every function identifies the caller with auth.uid(),
-- so they are safe whether called from a Route Handler or directly over PostgREST.
-- Failures raise P0001 with message = machine code and detail = human text.

create function public._fail(p_code text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception '%', p_code using detail = p_message, errcode = 'P0001';
end;
$$;

create function public._uid()
returns uuid
language plpgsql
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform public._fail('UNAUTHENTICATED', 'Sign in to continue.');
  end if;
  return v_uid;
end;
$$;

create function public._rate_limit(p_action text, p_max int, p_window_sec int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_now timestamptz := clock_timestamp();
  v_hits int;
begin
  insert into public.rate_limits as r (user_id, action, window_start, hits)
  values (v_uid, p_action, v_now, 1)
  on conflict (user_id, action) do update set
    hits = case when r.window_start < v_now - make_interval(secs => p_window_sec) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < v_now - make_interval(secs => p_window_sec) then v_now else r.window_start end
  returning r.hits into v_hits;
  if v_hits > p_max then
    perform public._fail('RATE_LIMITED', 'Too many requests. Slow down a little.');
  end if;
end;
$$;

-- Append an event to the room's ordered history and broadcast it to the room channel.
-- Updating rooms.event_seq takes the room row lock, so sequence numbers never collide.
create function public._emit(p_room_id uuid, p_type text, p_payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
begin
  update public.rooms set event_seq = event_seq + 1 where id = p_room_id
  returning event_seq into v_seq;

  insert into public.auction_events (room_id, seq, type, actor_id, payload)
  values (p_room_id, v_seq, p_type, auth.uid(), p_payload);

  perform realtime.send(
    p_payload || jsonb_build_object(
      'seq', v_seq, 'type', p_type, 'room_id', p_room_id, 'ts', clock_timestamp()
    ),
    p_type,
    'room:' || p_room_id::text,
    true
  );
  return v_seq;
end;
$$;

create function public._default_increments()
returns jsonb
language sql
immutable
as $$
  select '[{"upto":100,"step":5},{"upto":200,"step":10},{"upto":500,"step":20},{"upto":null,"step":25}]'::jsonb;
$$;

create function public._valid_increments(p jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_item jsonb;
  v_prev int := 0;
  v_n int;
  v_i int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  v_n := jsonb_array_length(p);
  if v_n < 1 or v_n > 8 then return false; end if;
  for v_item in select * from jsonb_array_elements(p) loop
    v_i := v_i + 1;
    if coalesce((v_item ->> 'step')::int, 0) < 1 or (v_item ->> 'step')::int > 1000 then return false; end if;
    if v_i < v_n then
      if (v_item ->> 'upto') is null or (v_item ->> 'upto')::int <= v_prev then return false; end if;
      v_prev := (v_item ->> 'upto')::int;
    elsif (v_item ->> 'upto') is not null then
      return false;  -- last band must be open ended
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create function public._gen_code()
returns text
language plpgsql
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Apply a whitelisted settings patch. Range checks are enforced by table constraints.
create function public._apply_settings(p_room_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_patch is null or p_patch = '{}'::jsonb then return; end if;
  if p_patch ? 'increments' and not public._valid_increments(p_patch -> 'increments') then
    perform public._fail('INVALID_SETTINGS', 'Bid increment table is not valid.');
  end if;
  update public.room_settings s set
    purse_lakh = coalesce((p_patch ->> 'purse_lakh')::int, s.purse_lakh),
    squad_max = coalesce((p_patch ->> 'squad_max')::int, s.squad_max),
    squad_min = coalesce((p_patch ->> 'squad_min')::int, s.squad_min),
    overseas_max = coalesce((p_patch ->> 'overseas_max')::int, s.overseas_max),
    bid_timer_sec = coalesce((p_patch ->> 'bid_timer_sec')::int, s.bid_timer_sec),
    format = coalesce(p_patch ->> 'format', s.format),
    increments = coalesce(p_patch -> 'increments', s.increments),
    retention_mode = coalesce(p_patch ->> 'retention_mode', s.retention_mode),
    inactive_retained_in_pool = coalesce((p_patch ->> 'inactive_retained_in_pool')::boolean, s.inactive_retained_in_pool),
    unsold_reround = coalesce((p_patch ->> 'unsold_reround')::boolean, s.unsold_reround),
    pool_limit = case when p_patch ? 'pool_limit' then (p_patch ->> 'pool_limit')::int else s.pool_limit end
  where s.room_id = p_room_id;
exception
  when check_violation or invalid_text_representation or numeric_value_out_of_range then
    perform public._fail('INVALID_SETTINGS', 'One or more auction settings are out of range.');
end;
$$;

create function public._members_json(p_room_id uuid)
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
    'franchise_id', m.franchise_id,
    'is_ready', m.is_ready,
    'joined_at', m.joined_at,
    'last_seen_at', m.last_seen_at
  ) order by m.joined_at), '[]'::jsonb)
  from public.room_members m
  join public.profiles p on p.id = m.user_id
  where m.room_id = p_room_id;
$$;

-- ---------------------------------------------------------------- profile
create function public.update_profile(p_display_name text, p_avatar_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_name text := trim(coalesce(p_display_name, ''));
begin
  if char_length(v_name) < 2 or char_length(v_name) > 32 then
    perform public._fail('INVALID_NAME', 'Display name must be 2 to 32 characters.');
  end if;
  update public.profiles set display_name = v_name, avatar_url = nullif(trim(coalesce(p_avatar_url, '')), '')
  where id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- create / join / leave
create function public.create_room(
  p_name text,
  p_visibility text default 'private',
  p_max_participants int default 10,
  p_auctioneer_type text default 'system',
  p_password text default null,
  p_description text default null,
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := public._uid();
  v_room public.rooms;
  v_season public.seasons;
  v_password text := nullif(coalesce(p_password, ''), '');
  v_token text;
begin
  perform public._rate_limit('create_room', 5, 60);

  select * into v_season from public.seasons where is_active;
  if not found then
    perform public._fail('NO_SEASON', 'No active season has been configured yet.');
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 or char_length(trim(p_name)) > 60 then
    perform public._fail('INVALID_NAME', 'Room name must be 1 to 60 characters.');
  end if;
  if p_visibility not in ('public', 'private') or p_auctioneer_type not in ('system', 'human')
     or p_max_participants not between 4 and 10 then
    perform public._fail('INVALID_SETTINGS', 'Room options are not valid.');
  end if;

  insert into public.rooms (code, name, description, visibility, has_password, host_id,
                            auctioneer_type, auctioneer_id, max_participants, season_id)
  values (public._gen_code(), trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
          p_visibility, v_password is not null, v_uid, p_auctioneer_type,
          case when p_auctioneer_type = 'human' then v_uid end, p_max_participants, v_season.id)
  returning * into v_room;

  v_token := encode(gen_random_bytes(18), 'hex');
  insert into public.room_secrets (room_id, password_hash, invite_token)
  values (v_room.id, case when v_password is not null then crypt(v_password, gen_salt('bf')) end, v_token);

  insert into public.room_settings (room_id, increments) values (v_room.id, public._default_increments());
  perform public._apply_settings(v_room.id, v_season.default_rules);
  perform public._apply_settings(v_room.id, p_settings);

  insert into public.room_members (room_id, user_id) values (v_room.id, v_uid);
  perform public._emit(v_room.id, 'room_created', jsonb_build_object('user_id', v_uid));

  return jsonb_build_object('ok', true, 'room_id', v_room.id, 'code', v_room.code, 'invite_token', v_token);
end;
$$;

-- Public, non-secret summary used by the join screen before the user is a member.
create function public.room_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_room public.rooms;
begin
  select * into v_room from public.rooms where code = upper(trim(coalesce(p_code, '')));
  if not found or v_room.status = 'closed' then
    perform public._fail('ROOM_NOT_FOUND', 'No room exists with that code.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'room_id', v_room.id,
    'code', v_room.code,
    'name', v_room.name,
    'description', v_room.description,
    'visibility', v_room.visibility,
    'has_password', v_room.has_password,
    'status', v_room.status,
    'auctioneer_type', v_room.auctioneer_type,
    'max_participants', v_room.max_participants,
    'member_count', (select count(*) from public.room_members where room_id = v_room.id),
    'host_name', (select display_name from public.profiles where id = v_room.host_id),
    'is_member', exists (select 1 from public.room_members where room_id = v_room.id and user_id = v_uid)
  );
end;
$$;

create function public.join_room(p_code text, p_password text default null, p_invite_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := public._uid();
  v_room public.rooms;
  v_secret public.room_secrets;
  v_count int;
begin
  perform public._rate_limit('join_room', 15, 60);

  -- Lock the room row so two people cannot both take the last seat.
  select * into v_room from public.rooms
  where code = upper(trim(coalesce(p_code, ''))) for update;
  if not found or v_room.status = 'closed' then
    perform public._fail('ROOM_NOT_FOUND', 'No room exists with that code.');
  end if;

  -- Rejoining is always allowed: a refresh or reconnect keeps the seat and franchise.
  if exists (select 1 from public.room_members where room_id = v_room.id and user_id = v_uid) then
    update public.room_members set last_seen_at = clock_timestamp()
    where room_id = v_room.id and user_id = v_uid;
    return jsonb_build_object('ok', true, 'room_id', v_room.id, 'code', v_room.code, 'status', v_room.status, 'rejoined', true);
  end if;

  if v_room.status <> 'lobby' then
    perform public._fail('AUCTION_STARTED', 'This auction has already started. Late entry is not allowed.');
  end if;

  select count(*) into v_count from public.room_members where room_id = v_room.id;
  if v_count >= v_room.max_participants then
    perform public._fail('ROOM_FULL', 'This room is full.');
  end if;

  select * into v_secret from public.room_secrets where room_id = v_room.id;
  if v_room.has_password and coalesce(p_invite_token, '') <> v_secret.invite_token then
    if p_password is null or p_password = '' then
      perform public._fail('PASSWORD_REQUIRED', 'This room needs a password.');
    end if;
    if crypt(p_password, v_secret.password_hash) <> v_secret.password_hash then
      perform public._fail('WRONG_PASSWORD', 'That password is not correct.');
    end if;
  end if;

  insert into public.room_members (room_id, user_id) values (v_room.id, v_uid);
  perform public._emit(v_room.id, 'participant_joined', jsonb_build_object('user_id', v_uid));

  return jsonb_build_object('ok', true, 'room_id', v_room.id, 'code', v_room.code, 'status', v_room.status, 'rejoined', false);
end;
$$;

create function public.leave_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_room public.rooms;
  v_next uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    perform public._fail('NOT_MEMBER', 'You are not in this room.');
  end if;
  if v_room.status in ('live', 'paused') then
    perform public._fail('AUCTION_LIVE', 'You cannot give up your franchise while the auction is running.');
  end if;
  if v_room.status = 'completed' then
    return jsonb_build_object('ok', true);  -- keep membership so history stays visible
  end if;

  delete from public.room_members where room_id = p_room_id and user_id = v_uid;

  select user_id into v_next from public.room_members where room_id = p_room_id order by joined_at limit 1;
  if v_next is null then
    update public.rooms set status = 'closed' where id = p_room_id;
    return jsonb_build_object('ok', true, 'closed', true);
  end if;

  if v_room.host_id = v_uid then
    update public.rooms set host_id = v_next where id = p_room_id;
  end if;
  if v_room.auctioneer_id = v_uid then
    update public.rooms set auctioneer_id = case when host_id = v_uid then v_next else host_id end
    where id = p_room_id;
  end if;

  perform public._emit(p_room_id, 'participant_left', jsonb_build_object('user_id', v_uid));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- lobby actions
create function public.select_franchise(p_room_id uuid, p_franchise_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_status text;
begin
  perform public._rate_limit('lobby_action', 40, 20);
  select status into v_status from public.rooms where id = p_room_id;
  if v_status is null or not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    perform public._fail('NOT_MEMBER', 'You are not in this room.');
  end if;
  if v_status <> 'lobby' then
    perform public._fail('AUCTION_STARTED', 'Franchises are locked once the auction starts.');
  end if;
  if p_franchise_id is not null and not exists (select 1 from public.franchises where id = p_franchise_id) then
    perform public._fail('INVALID_FRANCHISE', 'Unknown franchise.');
  end if;

  begin
    -- The unique (room_id, franchise_id) constraint is the real guard against duplicates.
    update public.room_members set franchise_id = p_franchise_id, is_ready = false
    where room_id = p_room_id and user_id = v_uid;
  exception when unique_violation then
    perform public._fail('FRANCHISE_TAKEN', 'Another participant already picked that franchise.');
  end;

  perform public._emit(p_room_id, 'franchise_selected',
    jsonb_build_object('user_id', v_uid, 'franchise_id', p_franchise_id));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.set_ready(p_room_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_room public.rooms;
  v_member public.room_members;
begin
  perform public._rate_limit('lobby_action', 40, 20);
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_member from public.room_members where room_id = p_room_id and user_id = v_uid;
  if v_room.id is null or v_member.user_id is null then
    perform public._fail('NOT_MEMBER', 'You are not in this room.');
  end if;
  if v_room.status <> 'lobby' then
    perform public._fail('AUCTION_STARTED', 'The auction has already started.');
  end if;
  if p_ready and v_member.franchise_id is null
     and not (v_room.auctioneer_type = 'human' and v_room.auctioneer_id = v_uid) then
    perform public._fail('NO_FRANCHISE', 'Pick a franchise before marking yourself ready.');
  end if;

  update public.room_members set is_ready = coalesce(p_ready, false)
  where room_id = p_room_id and user_id = v_uid;
  perform public._emit(p_room_id, 'participant_ready',
    jsonb_build_object('user_id', v_uid, 'is_ready', coalesce(p_ready, false)));
  return jsonb_build_object('ok', true);
end;
$$;

create function public._require_host(p_room_id uuid, p_lock boolean default true)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_room public.rooms;
begin
  if p_lock then
    select * into v_room from public.rooms where id = p_room_id for update;
  else
    select * into v_room from public.rooms where id = p_room_id;
  end if;
  if not found then
    perform public._fail('ROOM_NOT_FOUND', 'Room not found.');
  end if;
  if v_room.host_id <> v_uid then
    perform public._fail('NOT_HOST', 'Only the host can do that.');
  end if;
  return v_room;
end;
$$;

create function public.update_room(p_room_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.rooms := public._require_host(p_room_id);
  v_count int;
  v_password text;
begin
  perform public._rate_limit('lobby_action', 40, 20);
  if v_room.status <> 'lobby' then
    perform public._fail('AUCTION_STARTED', 'Settings are locked once the auction starts.');
  end if;

  if p_patch ? 'max_participants' then
    select count(*) into v_count from public.room_members where room_id = p_room_id;
    if (p_patch ->> 'max_participants')::int < v_count or (p_patch ->> 'max_participants')::int not between 4 and 10 then
      perform public._fail('INVALID_SETTINGS', 'Maximum participants must be 4 to 10 and not below the current count.');
    end if;
  end if;
  if p_patch ? 'name' and char_length(trim(coalesce(p_patch ->> 'name', ''))) not between 1 and 60 then
    perform public._fail('INVALID_NAME', 'Room name must be 1 to 60 characters.');
  end if;
  if p_patch ? 'visibility' and (p_patch ->> 'visibility') not in ('public', 'private') then
    perform public._fail('INVALID_SETTINGS', 'Visibility must be public or private.');
  end if;

  update public.rooms set
    name = coalesce(trim(p_patch ->> 'name'), name),
    description = case when p_patch ? 'description' then nullif(left(trim(coalesce(p_patch ->> 'description', '')), 280), '') else description end,
    visibility = coalesce(p_patch ->> 'visibility', visibility),
    max_participants = coalesce((p_patch ->> 'max_participants')::int, max_participants)
  where id = p_room_id;

  if p_patch ? 'password' then
    v_password := nullif(coalesce(p_patch ->> 'password', ''), '');
    update public.room_secrets
      set password_hash = case when v_password is not null then crypt(v_password, gen_salt('bf')) end
      where room_id = p_room_id;
    update public.rooms set has_password = v_password is not null where id = p_room_id;
  end if;

  if p_patch ? 'settings' then
    perform public._apply_settings(p_room_id, p_patch -> 'settings');
  end if;

  perform public._emit(p_room_id, 'room_updated', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create function public.kick_member(p_room_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms := public._require_host(p_room_id);
begin
  if v_room.status <> 'lobby' then
    perform public._fail('AUCTION_STARTED', 'Participants cannot be removed once the auction starts.');
  end if;
  if p_user_id = v_room.host_id then
    perform public._fail('INVALID_TARGET', 'The host cannot remove themselves. Leave the room instead.');
  end if;
  delete from public.room_members where room_id = p_room_id and user_id = p_user_id;
  if not found then
    perform public._fail('NOT_MEMBER', 'That user is not in the room.');
  end if;
  if v_room.auctioneer_id = p_user_id then
    update public.rooms set auctioneer_id = host_id where id = p_room_id;
  end if;
  perform public._emit(p_room_id, 'participant_removed', jsonb_build_object('user_id', p_user_id));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.transfer_host(p_room_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms := public._require_host(p_room_id);
begin
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = p_user_id) then
    perform public._fail('NOT_MEMBER', 'That user is not in the room.');
  end if;
  update public.rooms set host_id = p_user_id where id = p_room_id;
  perform public._emit(p_room_id, 'host_changed', jsonb_build_object('user_id', p_user_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- Any member can take over as host once the current host has been silent for 45 seconds.
create function public.claim_host(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_room public.rooms;
  v_seen timestamptz;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    perform public._fail('NOT_MEMBER', 'You are not in this room.');
  end if;
  select last_seen_at into v_seen from public.room_members
  where room_id = p_room_id and user_id = v_room.host_id;
  if v_seen is not null and v_seen > clock_timestamp() - interval '45 seconds' then
    perform public._fail('HOST_ONLINE', 'The host is still connected.');
  end if;
  update public.rooms set host_id = v_uid where id = p_room_id;
  perform public._emit(p_room_id, 'host_changed', jsonb_build_object('user_id', v_uid));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.heartbeat(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.room_members set last_seen_at = clock_timestamp()
  where room_id = p_room_id and user_id = public._uid();
  return jsonb_build_object('ok', found, 'server_now', clock_timestamp());
end;
$$;

-- ---------------------------------------------------------------- discovery
create function public.list_public_rooms()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(r order by r ->> 'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'room_id', r.id,
      'code', r.code,
      'name', r.name,
      'description', r.description,
      'status', r.status,
      'has_password', r.has_password,
      'auctioneer_type', r.auctioneer_type,
      'max_participants', r.max_participants,
      'member_count', (select count(*) from public.room_members m where m.room_id = r.id),
      'host_name', (select display_name from public.profiles p where p.id = r.host_id),
      'purse_lakh', s.purse_lakh,
      'bid_timer_sec', s.bid_timer_sec,
      'format', s.format,
      'created_at', r.created_at
    ) as r
    from public.rooms r
    join public.room_settings s on s.room_id = r.id
    where r.visibility = 'public' and r.status in ('lobby', 'live', 'paused')
      and r.created_at > now() - interval '2 days'
    order by r.created_at desc
    limit 60
  ) q;
$$;

-- Random matchmaking: join the fullest open public lobby, or open a new one.
create function public.find_match()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := public._uid();
  v_room public.rooms;
  v_candidate record;
  v_franchise text;
  v_created jsonb;
begin
  perform public._rate_limit('find_match', 6, 60);

  -- Already waiting in a lobby? Send the user back there.
  select r.* into v_room from public.rooms r
  join public.room_members m on m.room_id = r.id and m.user_id = v_uid
  where r.status = 'lobby' and r.visibility = 'public'
  order by m.joined_at desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'room_id', v_room.id, 'code', v_room.code, 'created', false);
  end if;

  for v_candidate in
    select r.id from public.rooms r
    where r.visibility = 'public' and r.status = 'lobby' and not r.has_password
      and r.created_at > now() - interval '6 hours'
      and (select count(*) from public.room_members m where m.room_id = r.id) < r.max_participants
    order by (select count(*) from public.room_members m where m.room_id = r.id) desc, r.created_at
    limit 5
  loop
    select * into v_room from public.rooms where id = v_candidate.id for update skip locked;
    continue when not found or v_room.status <> 'lobby';
    continue when (select count(*) from public.room_members where room_id = v_room.id) >= v_room.max_participants;

    select f.id into v_franchise from public.franchises f
    where not exists (select 1 from public.room_members m where m.room_id = v_room.id and m.franchise_id = f.id)
    order by random() limit 1;

    insert into public.room_members (room_id, user_id, franchise_id) values (v_room.id, v_uid, v_franchise);
    perform public._emit(v_room.id, 'participant_joined', jsonb_build_object('user_id', v_uid));
    return jsonb_build_object('ok', true, 'room_id', v_room.id, 'code', v_room.code, 'created', false);
  end loop;

  v_created := public.create_room('Quick Match', 'public', 10, 'system', null,
                                  'Open matchmaking room. Auction starts when four owners are ready.');
  select id into v_franchise from public.franchises order by random() limit 1;
  update public.room_members set franchise_id = v_franchise
  where room_id = (v_created ->> 'room_id')::uuid and user_id = v_uid;
  return jsonb_build_object('ok', true, 'room_id', v_created -> 'room_id', 'code', v_created -> 'code', 'created', true);
end;
$$;

create function public.send_chat(p_room_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_body text := trim(coalesce(p_body, ''));
  v_member public.room_members;
begin
  perform public._rate_limit('chat', 8, 10);
  select * into v_member from public.room_members where room_id = p_room_id and user_id = v_uid;
  if not found then
    perform public._fail('NOT_MEMBER', 'You are not in this room.');
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 300 then
    perform public._fail('INVALID_MESSAGE', 'Messages must be 1 to 300 characters.');
  end if;
  perform public._emit(p_room_id, 'chat_message', jsonb_build_object(
    'user_id', v_uid,
    'display_name', (select display_name from public.profiles where id = v_uid),
    'franchise_id', v_member.franchise_id,
    'body', v_body
  ));
  return jsonb_build_object('ok', true);
end;
$$;
