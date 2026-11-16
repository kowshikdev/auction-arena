-- Function privileges: nothing is callable unless granted below.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function
  public.is_room_member(uuid),
  public.is_session_member(uuid),
  public.update_profile(text, text),
  public.create_room(text, text, int, text, text, text, jsonb),
  public.room_preview(text),
  public.join_room(text, text, text),
  public.leave_room(uuid),
  public.select_franchise(uuid, text),
  public.set_ready(uuid, boolean),
  public.update_room(uuid, jsonb),
  public.kick_member(uuid, uuid),
  public.transfer_host(uuid, uuid),
  public.claim_host(uuid),
  public.heartbeat(uuid),
  public.list_public_rooms(),
  public.find_match(),
  public.send_chat(uuid, text),
  public.start_auction(uuid),
  public.place_bid(uuid, uuid, int, text),
  public.pass_lot(uuid, uuid),
  public.tick(uuid),
  public.auctioneer_action(uuid, text, jsonb),
  public.set_auctioneer(uuid, text, uuid),
  public.get_room_state(text),
  public.get_events_since(uuid, bigint),
  public.my_auctions()
to authenticated;

-- ---------------------------------------------------------------- reference data
insert into public.franchises (id, name, city, color_primary, color_secondary, logo_path, sort_order) values
  ('CSK',  'Chennai Super Kings',         'Chennai',    '#F9CD05', '#1D418C', '/logos/csk.png',  1),
  ('MI',   'Mumbai Indians',              'Mumbai',     '#1E6FD9', '#D1AB3E', '/logos/mi.png',   2),
  ('RCB',  'Royal Challengers Bengaluru', 'Bengaluru',  '#E0222B', '#D4AF37', '/logos/rcb.png',  3),
  ('KKR',  'Kolkata Knight Riders',       'Kolkata',    '#6A3FA0', '#F2C028', '/logos/kkr.png',  4),
  ('SRH',  'Sunrisers Hyderabad',         'Hyderabad',  '#FF822A', '#1A1A1A', '/logos/srh.png',  5),
  ('RR',   'Rajasthan Royals',            'Jaipur',     '#EA1A85', '#254AA5', '/logos/rr.png',   6),
  ('DC',   'Delhi Capitals',              'Delhi',      '#2561AE', '#EF1B23', '/logos/dc.png',   7),
  ('PBKS', 'Punjab Kings',                'Mullanpur',  '#ED1B24', '#C0C0C0', '/logos/pbks.png', 8),
  ('GT',   'Gujarat Titans',              'Ahmedabad',  '#6FB7E0', '#B7985A', '/logos/gt.png',   9),
  ('LSG',  'Lucknow Super Giants',        'Lucknow',    '#3F8CFF', '#F28B00', '/logos/lsg.png', 10);

insert into public.seasons (id, name, year, is_active, default_rules) values
  ('ipl-2027', 'IPL 2027 Auction', 2027, true, '{"purse_lakh": 12500, "squad_max": 25, "squad_min": 18, "overseas_max": 8}'::jsonb);
