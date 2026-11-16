-- Internal helpers (names starting with "_" or "handle_") must never be callable by API roles,
-- and nothing at all is callable by anonymous visitors.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname like '\_%' or r.proname like 'handle\_%' then
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
  end loop;
end;
$$;

-- Backstop clock: closes expired lots even if every browser is gone.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('auctionarena-tick', '5 seconds', $$select public._tick_all()$$);

create function public._housekeeping()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
  update public.rooms set status = 'closed' where status = 'lobby' and created_at < now() - interval '3 days';
$$;
revoke execute on function public._housekeeping() from public, anon, authenticated;

select cron.schedule('auctionarena-housekeeping', '17 3 * * *', $$select public._housekeeping()$$);
