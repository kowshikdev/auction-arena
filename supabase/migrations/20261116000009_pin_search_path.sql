-- Pin search_path on the remaining helper functions (Supabase security advisor 0011).
alter function public._fail(text, text) set search_path = public;
alter function public._uid() set search_path = public;
alter function public._default_increments() set search_path = public;
alter function public._valid_increments(jsonb) set search_path = public;
alter function public._gen_code() set search_path = public;
alter function public._next_bid(jsonb, int, int) set search_path = public;
alter function public._lot_timer(public.auction_sessions, public.room_settings) set search_path = public;
