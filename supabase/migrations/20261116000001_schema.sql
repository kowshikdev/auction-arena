-- AuctionArena core schema.
-- All money is stored as integer lakhs (1 crore = 100 lakh) to avoid float errors.
-- Clients never write these tables directly: RLS allows reads only, and every
-- mutation goes through SECURITY DEFINER functions (see later migrations).

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar_url text,
  is_admin boolean not null default false,
  is_guest boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- catalogue
create table public.franchises (
  id text primary key,                 -- 'CSK', 'MI', ...
  name text not null,
  city text not null,
  color_primary text not null,
  color_secondary text not null,
  logo_path text not null,
  sort_order int not null default 0
);

create table public.seasons (
  id text primary key,                 -- 'ipl-2027'
  name text not null,
  year int not null,
  is_active boolean not null default false,
  -- Default auction rules for rooms created on this season (admin editable).
  default_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index seasons_one_active on public.seasons (is_active) where is_active;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  full_name text not null,
  country text not null,
  role text not null check (role in ('BAT', 'BWL', 'AR', 'WK')),
  batting_style text,
  bowling_style text,
  is_overseas boolean not null default false,
  is_capped boolean not null default true,
  photo_url text,
  stats jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Season-specific data. `franchise_id` is the team the player currently belongs
-- to; `is_retained` decides whether a room using retentions pre-assigns the
-- player to that team. Both are admin editable because retention lists change.
create table public.player_seasons (
  season_id text not null references public.seasons (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  base_price_lakh int not null check (base_price_lakh > 0),
  auction_set text not null,
  set_order int not null default 0,
  is_marquee boolean not null default false,
  franchise_id text references public.franchises (id),
  is_retained boolean not null default false,
  retention_price_lakh int check (retention_price_lakh is null or retention_price_lakh >= 0),
  last_price_lakh int,
  is_available boolean not null default true,
  primary key (season_id, player_id)
);
create index player_seasons_set_idx on public.player_seasons (season_id, set_order);

-- ---------------------------------------------------------------- rooms
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 280),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  has_password boolean not null default false,
  host_id uuid not null references public.profiles (id),
  auctioneer_type text not null default 'system' check (auctioneer_type in ('system', 'human')),
  auctioneer_id uuid references public.profiles (id),
  status text not null default 'lobby' check (status in ('lobby', 'live', 'paused', 'completed', 'closed')),
  max_participants int not null default 10 check (max_participants between 4 and 10),
  season_id text not null references public.seasons (id),
  event_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index rooms_public_idx on public.rooms (visibility, status, created_at desc);

-- Secrets live in their own table with no RLS policies, so no client can read them.
create table public.room_secrets (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  password_hash text,
  invite_token text not null
);

create table public.room_settings (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  purse_lakh int not null default 12500 check (purse_lakh between 1000 and 50000),
  squad_max int not null default 25 check (squad_max between 5 and 30),
  squad_min int not null default 18 check (squad_min between 1 and 30),
  overseas_max int not null default 8 check (overseas_max between 0 and 30),
  bid_timer_sec int not null default 20 check (bid_timer_sec between 5 and 120),
  result_pause_sec int not null default 6 check (result_pause_sec between 2 and 30),
  min_participants int not null default 4 check (min_participants between 2 and 10),
  format text not null default 'standard' check (format in ('standard', 'accelerated', 'custom')),
  -- [{ "upto": 100, "step": 5 }, ..., { "upto": null, "step": 25 }] in lakhs.
  increments jsonb not null,
  retention_mode text not null default 'none' check (retention_mode in ('none', 'season')),
  inactive_retained_in_pool boolean not null default true,
  unsold_reround boolean not null default true,
  pool_limit int check (pool_limit is null or pool_limit between 20 and 1000),
  allow_late_join boolean not null default false,
  check (squad_min <= squad_max)
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  franchise_id text references public.franchises (id),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),  -- server-side heartbeat
  primary key (room_id, user_id),
  -- One owner per franchise per room. NULL franchise (not chosen yet) is allowed many times.
  unique (room_id, franchise_id)
);
create index room_members_user_idx on public.room_members (user_id);

-- ---------------------------------------------------------------- auction
create table public.auction_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms (id) on delete cascade,
  status text not null default 'live' check (status in ('live', 'paused', 'completed')),
  -- intro: waiting to present first lot. bidding: lot open. result: sold/unsold shown.
  -- idle: human auctioneer has not presented a lot. done: auction finished.
  phase text not null default 'intro' check (phase in ('intro', 'idle', 'bidding', 'result', 'done')),
  round int not null default 1,
  current_lot_id uuid,
  current_bid_lakh int,
  current_bidder text references public.franchises (id),
  bid_count int not null default 0,
  bid_deadline timestamptz,           -- authoritative close time for the open lot
  next_at timestamptz,                -- when the system auctioneer moves on
  paused_remaining_ms int,            -- time left on whichever clock was running when paused
  lots_total int not null default 0,
  lots_done int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.auction_lots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.auction_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id),
  lot_order int not null,
  auction_set text not null,
  base_price_lakh int not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'sold', 'unsold', 'withdrawn')),
  round int not null default 1,
  sold_to text references public.franchises (id),
  sold_price_lakh int,
  closed_at timestamptz,
  -- A player appears once per auction, so can be sold at most once.
  unique (session_id, player_id),
  unique (session_id, lot_order)
);
create index auction_lots_pending_idx on public.auction_lots (session_id, status, lot_order);

alter table public.auction_sessions
  add constraint auction_sessions_current_lot_fk
  foreign key (current_lot_id) references public.auction_lots (id);

create table public.auction_teams (
  session_id uuid not null references public.auction_sessions (id) on delete cascade,
  franchise_id text not null references public.franchises (id),
  user_id uuid not null references public.profiles (id),
  purse_initial_lakh int not null,
  purse_remaining_lakh int not null check (purse_remaining_lakh >= 0),
  squad_count int not null default 0,
  overseas_count int not null default 0,
  bids_placed int not null default 0,
  primary key (session_id, franchise_id),
  unique (session_id, user_id)
);

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.auction_sessions (id) on delete cascade,
  lot_id uuid not null references public.auction_lots (id) on delete cascade,
  franchise_id text not null references public.franchises (id),
  user_id uuid not null references public.profiles (id),
  amount_lakh int not null check (amount_lakh > 0),
  idempotency_key text not null,
  is_void boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, idempotency_key)
);
create index bids_lot_idx on public.bids (lot_id, created_at);

create table public.lot_passes (
  lot_id uuid not null references public.auction_lots (id) on delete cascade,
  franchise_id text not null references public.franchises (id),
  created_at timestamptz not null default now(),
  primary key (lot_id, franchise_id)
);

create table public.team_squads (
  session_id uuid not null references public.auction_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id),
  franchise_id text not null references public.franchises (id),
  price_lakh int not null,
  is_retained boolean not null default false,
  acquired_at timestamptz not null default now(),
  -- One franchise per player per auction: a player can never be bought twice.
  primary key (session_id, player_id)
);
create index team_squads_franchise_idx on public.team_squads (session_id, franchise_id);

-- Ordered, append-only history. Doubles as the audit log and the recovery source.
create table public.auction_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  seq bigint not null,
  type text not null,
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (room_id, seq)
);

create table public.matchmaking_queue (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid references public.rooms (id) on delete cascade,
  type text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid references public.rooms (id) on delete set null,
  message text not null check (char_length(message) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (user_id, action)
);

-- ---------------------------------------------------------------- profile bootstrap
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, ''), '@', 1)
  )), '');
  if v_name is null then
    v_name := 'Guest ' || upper(substr(replace(new.id::text, '-', ''), 1, 4));
  end if;
  insert into public.profiles (id, display_name, avatar_url, is_guest)
  values (
    new.id,
    left(v_name, 32),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Guest upgraded to a real account: clear the guest flag.
create function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false) then
    update public.profiles set is_guest = false where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- ---------------------------------------------------------------- row level security
create function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = (select auth.uid())
  );
$$;

create function public.is_session_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.auction_sessions s
    join public.room_members m on m.room_id = s.room_id
    where s.id = p_session_id and m.user_id = (select auth.uid())
  );
$$;

alter table public.profiles enable row level security;
alter table public.franchises enable row level security;
alter table public.seasons enable row level security;
alter table public.players enable row level security;
alter table public.player_seasons enable row level security;
alter table public.rooms enable row level security;
alter table public.room_secrets enable row level security;
alter table public.room_settings enable row level security;
alter table public.room_members enable row level security;
alter table public.auction_sessions enable row level security;
alter table public.auction_lots enable row level security;
alter table public.auction_teams enable row level security;
alter table public.bids enable row level security;
alter table public.lot_passes enable row level security;
alter table public.team_squads enable row level security;
alter table public.auction_events enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.rate_limits enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);

create policy franchises_read on public.franchises for select to anon, authenticated using (true);
create policy seasons_read on public.seasons for select to anon, authenticated using (true);
create policy players_read on public.players for select to anon, authenticated using (true);
create policy player_seasons_read on public.player_seasons for select to anon, authenticated using (true);

create policy rooms_read on public.rooms for select to authenticated
  using (visibility = 'public' or public.is_room_member(id));
create policy room_settings_read on public.room_settings for select to authenticated
  using (public.is_room_member(room_id));
create policy room_members_read on public.room_members for select to authenticated
  using (public.is_room_member(room_id));
create policy auction_sessions_read on public.auction_sessions for select to authenticated
  using (public.is_room_member(room_id));
create policy auction_lots_read on public.auction_lots for select to authenticated
  using (public.is_session_member(session_id));
create policy auction_teams_read on public.auction_teams for select to authenticated
  using (public.is_session_member(session_id));
create policy bids_read on public.bids for select to authenticated
  using (public.is_session_member(session_id));
create policy team_squads_read on public.team_squads for select to authenticated
  using (public.is_session_member(session_id));
create policy auction_events_read on public.auction_events for select to authenticated
  using (public.is_room_member(room_id));
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- Realtime: members of a room may subscribe to (and track presence on) its private channel.
create policy room_channel_read on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'room:%'
    and public.is_room_member(nullif(split_part(realtime.topic(), ':', 2), '')::uuid)
  );
create policy room_channel_presence on realtime.messages for insert to authenticated
  with check (
    extension = 'presence'
    and realtime.topic() like 'room:%'
    and public.is_room_member(nullif(split_part(realtime.topic(), ':', 2), '')::uuid)
  );
