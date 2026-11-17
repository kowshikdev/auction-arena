-- Admin overview: live activity and today / last-7-days numbers (India time).
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_week timestamptz := v_today - interval '6 days';
begin
  perform public._require_admin();
  return jsonb_build_object(
    'ok', true,
    'counts', jsonb_build_object(
      'online_now', (select count(distinct user_id) from public.room_members where last_seen_at > now() - interval '60 seconds'),
      'rooms_live', (select count(*) from public.rooms where status in ('live', 'paused')),
      'rooms_waiting', (select count(*) from public.rooms where status = 'lobby'),
      'rooms_today', (select count(*) from public.rooms where created_at >= v_today),
      'auctions_today', (select count(*) from public.rooms where status = 'completed' and completed_at >= v_today),
      'bids_today', (select count(*) from public.bids where created_at >= v_today),
      'signups_today', (select count(*) from public.profiles where created_at >= v_today and not is_guest),
      'guests_today', (select count(*) from public.profiles where created_at >= v_today and is_guest),
      'rooms_7d', (select count(*) from public.rooms where created_at >= v_week),
      'auctions_7d', (select count(*) from public.rooms where status = 'completed' and completed_at >= v_week),
      'users', (select count(*) from public.profiles where not is_guest),
      'guests', (select count(*) from public.profiles where is_guest),
      'auctions_completed', (select count(*) from public.rooms where status = 'completed'),
      'players', (select count(*) from public.players where is_active),
      'reports_open', (select count(*) from public.reports where status = 'open')
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'rooms', d.rooms, 'auctions', d.auctions, 'people', d.people) order by d.day)
      from (
        select g.day::date as day,
          (select count(*) from public.rooms r where r.created_at >= g.day and r.created_at < g.day + interval '1 day') as rooms,
          (select count(*) from public.rooms r where r.status = 'completed' and r.completed_at >= g.day and r.completed_at < g.day + interval '1 day') as auctions,
          (select count(*) from public.profiles p where p.created_at >= g.day and p.created_at < g.day + interval '1 day') as people
        from generate_series(v_week, v_today, interval '1 day') as g(day)
      ) d
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(x.r order by x.sort desc) from (
        select (case when r.status in ('live', 'paused') then 2 when r.status = 'lobby' then 1 else 0 end)::text || r.created_at::text as sort,
          jsonb_build_object(
          'room_id', r.id, 'code', r.code, 'name', r.name, 'status', r.status, 'visibility', r.visibility,
          'created_at', r.created_at,
          'host_name', (select display_name from public.profiles p where p.id = r.host_id),
          'member_count', (select count(*) from public.room_members m where m.room_id = r.id),
          'online', (select count(*) from public.room_members m where m.room_id = r.id and m.last_seen_at > now() - interval '60 seconds')
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
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
