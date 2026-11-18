-- Host (or human auctioneer) can move the auction along without waiting for clocks.
-- Bidding: skipping passes on the player (unsold, any standing bid is dropped); p_sell closes the lot
-- to the highest bidder instead.
-- Result pause or intro: presents the next player immediately.
create function public.host_skip_lot(p_room_id uuid, p_sell boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_room public.rooms;
  v_s public.auction_sessions;
  v_sold boolean;
begin
  perform public._rate_limit('host_skip', 20, 10);
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    perform public._fail('ROOM_NOT_FOUND', 'Room not found.');
  end if;
  if v_room.host_id <> v_uid and not (v_room.auctioneer_type = 'human' and v_room.auctioneer_id = v_uid) then
    perform public._fail('NOT_HOST', 'Only the host can do that.');
  end if;
  select * into v_s from public.auction_sessions where room_id = p_room_id for update;
  if not found or v_s.status = 'completed' then
    perform public._fail('NOT_RUNNING', 'The auction is not running.');
  end if;
  if v_s.status = 'paused' then
    perform public._fail('PAUSED', 'The auction is paused.');
  end if;

  if v_s.phase = 'bidding' then
    if not p_sell and v_s.current_bidder is not null then
      update public.bids set is_void = true where lot_id = v_s.current_lot_id;
      update public.auction_sessions set current_bidder = null, current_bid_lakh = null where id = v_s.id;
    end if;
    select current_bidder is not null into v_sold from public.auction_sessions where id = v_s.id;
    perform public._close_lot(v_s.id);
    if v_room.auctioneer_type = 'system' then
      update public.auction_sessions set next_at = clock_timestamp() + interval '1500 milliseconds'
      where id = v_s.id and phase = 'result';
    end if;
    return jsonb_build_object('ok', true, 'sold', v_sold, 'state', public._session_state(v_s.id));
  end if;

  if v_s.phase in ('intro', 'result') and v_room.auctioneer_type = 'system' then
    perform public._present_next(v_s.id);
    return jsonb_build_object('ok', true, 'state', public._session_state(v_s.id));
  end if;

  perform public._fail('NOTHING_TO_SKIP', 'There is nothing to skip right now.');
  return null;
end;
$$;

revoke execute on function public.host_skip_lot(uuid, boolean) from public, anon;
grant execute on function public.host_skip_lot(uuid, boolean) to authenticated;
