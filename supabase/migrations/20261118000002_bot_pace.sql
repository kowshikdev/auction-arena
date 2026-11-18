-- Faster bot replies so bidding wars feel live.
create or replace function public._schedule_bots(p_session_id uuid)
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
