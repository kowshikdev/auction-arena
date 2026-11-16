-- Rate limits become tunable without redeploying functions: a row here overrides the
-- default passed by the calling function.
create table public.rate_limit_rules (
  action text primary key,
  max_hits int not null check (max_hits > 0),
  window_sec int not null check (window_sec > 0)
);
alter table public.rate_limit_rules enable row level security;

insert into public.rate_limit_rules (action, max_hits, window_sec) values
  ('create_room', 12, 60);

create or replace function public._rate_limit(p_action text, p_max int, p_window_sec int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_now timestamptz := clock_timestamp();
  v_max int := p_max;
  v_window int := p_window_sec;
  v_hits int;
begin
  select max_hits, window_sec into v_max, v_window from public.rate_limit_rules where action = p_action;
  if not found then
    v_max := p_max;
    v_window := p_window_sec;
  end if;

  insert into public.rate_limits as r (user_id, action, window_start, hits)
  values (v_uid, p_action, v_now, 1)
  on conflict (user_id, action) do update set
    hits = case when r.window_start < v_now - make_interval(secs => v_window) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < v_now - make_interval(secs => v_window) then v_now else r.window_start end
  returning r.hits into v_hits;
  if v_hits > v_max then
    perform public._fail('RATE_LIMITED', 'Too many requests. Slow down a little.');
  end if;
end;
$$;
revoke execute on function public._rate_limit(text, int, int) from public, anon, authenticated;
