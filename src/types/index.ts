// Shapes returned by the database functions (see supabase/migrations).
// All money values are integer lakhs: 100 lakh = 1 crore.

export type FranchiseId = "CSK" | "MI" | "RCB" | "KKR" | "SRH" | "RR" | "DC" | "PBKS" | "GT" | "LSG";
export type PlayerRole = "BAT" | "BWL" | "AR" | "WK";
export type RoomStatus = "lobby" | "live" | "paused" | "completed" | "closed";
export type AuctioneerType = "system" | "human";
export type Phase = "intro" | "idle" | "bidding" | "result" | "done";
export type LotStatus = "pending" | "active" | "sold" | "unsold" | "withdrawn";

export type IncrementBand = { upto: number | null; step: number };

export type Room = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  has_password: boolean;
  host_id: string;
  auctioneer_type: AuctioneerType;
  auctioneer_id: string | null;
  status: RoomStatus;
  max_participants: number;
  season_id: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type RoomSettings = {
  purse_lakh: number;
  squad_max: number;
  squad_min: number;
  overseas_max: number;
  bid_timer_sec: number;
  result_pause_sec: number;
  min_participants: number;
  format: "standard" | "accelerated" | "custom";
  increments: IncrementBand[];
  retention_mode: "none" | "season";
  inactive_retained_in_pool: boolean;
  unsold_reround: boolean;
  pool_limit: number | null;
  allow_late_join: boolean;
};

export type Member = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_guest: boolean;
  franchise_id: FranchiseId | null;
  is_ready: boolean;
  joined_at: string;
  last_seen_at: string;
};

export type SessionState = {
  id: string;
  status: "live" | "paused" | "completed";
  phase: Phase;
  round: number;
  current_lot_id: string | null;
  current_bid_lakh: number | null;
  current_bidder: FranchiseId | null;
  bid_count: number;
  bid_deadline: string | null;
  next_at: string | null;
  paused_remaining_ms: number | null;
  lots_total: number;
  lots_done: number;
  timer_sec: number;
  next_bid_lakh: number | null;
  passes: FranchiseId[];
  server_now: string;
};

export type Team = {
  session_id: string;
  franchise_id: FranchiseId;
  user_id: string;
  purse_initial_lakh: number;
  purse_remaining_lakh: number;
  squad_count: number;
  overseas_count: number;
  bids_placed: number;
};

export type Lot = {
  id: string;
  player_id: string;
  lot_order: number;
  auction_set: string;
  base_price_lakh: number;
  status: LotStatus;
  round: number;
  sold_to: FranchiseId | null;
  sold_price_lakh: number | null;
};

export type SquadEntry = {
  player_id: string;
  franchise_id: FranchiseId;
  price_lakh: number;
  is_retained: boolean;
  acquired_at: string;
};

export type Bid = {
  lot_id: string;
  franchise_id: FranchiseId;
  amount_lakh: number;
  created_at: string;
};

export type ChatMessage = {
  seq: number;
  ts: string;
  user_id: string;
  display_name: string;
  franchise_id: FranchiseId | null;
  body: string;
};

export type RoomSnapshot = {
  server_now: string;
  seq: number;
  room: Room;
  settings: RoomSettings;
  invite_token: string;
  members: Member[];
  me: { user_id: string; franchise_id: FranchiseId | null; is_host: boolean; is_auctioneer: boolean };
  chat: ChatMessage[];
  session: SessionState | null;
  teams: Team[];
  lots: Lot[];
  squads: SquadEntry[];
  bids: Bid[];
};

/** Broadcast payload. Every event carries seq so clients can detect gaps. */
export type RoomEvent = {
  seq: number;
  type: string;
  room_id: string;
  ts: string;
  state?: SessionState | null;
  lot?: Lot;
  team?: Team;
  bid?: Bid;
  user_id?: string;
  franchise_id?: FranchiseId | null;
  display_name?: string;
  body?: string;
  amount_lakh?: number;
  round?: number;
  is_ready?: boolean;
  auctioneer_type?: AuctioneerType;
  auctioneer_id?: string | null;
  reason?: string;
};

export type Player = {
  id: string;
  slug: string;
  full_name: string;
  country: string;
  role: PlayerRole;
  batting_style: string | null;
  bowling_style: string | null;
  is_overseas: boolean;
  is_capped: boolean;
  photo_url: string | null;
  stats: Record<string, string | number>;
  is_active: boolean;
  // Season data
  base_price_lakh: number;
  auction_set: string;
  set_order: number;
  is_marquee: boolean;
  franchise_id: FranchiseId | null;
  is_retained: boolean;
  retention_price_lakh: number | null;
  last_price_lakh: number | null;
  is_available: boolean;
};

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  is_guest: boolean;
};

export type PublicRoom = {
  room_id: string;
  code: string;
  name: string;
  description: string | null;
  status: RoomStatus;
  has_password: boolean;
  auctioneer_type: AuctioneerType;
  max_participants: number;
  member_count: number;
  host_name: string;
  purse_lakh: number;
  bid_timer_sec: number;
  format: string;
  created_at: string;
};

export type ApiError = { code: string; message: string };
export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: ApiError };
