// One-off generator: derives the AI-owner migration from existing function bodies so the
// bidding rules are copied exactly, not retyped. Run: node scripts/gen-ai-migration.mjs
import { readFileSync, writeFileSync } from "node:fs";

const rd = (file) => readFileSync(file, "utf8").split("\r\n").join("\n");
const d = "supabase/migrations/";
const eng = rd(d + "20261116000003_auction_engine.sql");
const sea = rd(d + "20261117000001_season_franchises.sql");
const rooms = rd(d + "20261116000002_room_functions.sql");
const stats = rd(d + "20261117000005_admin_live_stats.sql");

const fn = (src, name) => {
  const re = new RegExp("create (?:or replace )?function public[.]" + name + "[(]");
  const m = re.exec(src);
  if (!m) throw new Error("missing " + name);
  const end = src.indexOf("\n$$;", m.index);
  return src.slice(m.index, end + 4);
};
const orReplace = (s) => s.replace(/^create function/, "create or replace function");
const must = (s, a, b) => {
  if (!s.includes(a)) throw new Error("anchor missing: " + a);
  return s.replace(a, b);
};

let sessionState = orReplace(fn(eng, "_session_state"));
sessionState = must(sessionState, "'next_at', s.next_at,", "'next_at', s.next_at,\n    'next_bot_at', s.next_bot_at,");

let present = orReplace(fn(eng, "_present_next"));
present = must(present, "  perform public._emit(v_s.room_id, 'player_presented'",
  "  perform public._schedule_bots(p_session_id);\n  perform public._emit(v_s.room_id, 'player_presented'");

let placeBid = fn(sea, "place_bid");
placeBid = must(placeBid, "  perform public._emit(p_room_id, 'bid_accepted'",
  "  perform public._schedule_bots(v_s.id);\n  perform public._emit(p_room_id, 'bid_accepted'");

// start_auction becomes _start_core (no host or readiness check); a thin wrapper is in the tail.
let core = fn(sea, "start_auction");
core = must(core, "create or replace function public.start_auction(p_room_id uuid)",
  "create or replace function public._start_core(p_room_id uuid)");
core = must(core, "v_room public.rooms := public._require_host(p_room_id);", "v_room public.rooms;");
core = must(core, "begin\n  if v_room.status <> 'lobby'",
  "begin\n  select * into v_room from public.rooms where id = p_room_id for update;\n  if v_room.status <> 'lobby'");
const readyStart = core.indexOf("  if exists (select 1 from public.room_members\n             where room_id = p_room_id and not is_ready");
if (readyStart < 0) throw new Error("ready block");
const readyEnd = core.indexOf("  end if;\n", readyStart) + "  end if;\n".length;
core = core.slice(0, readyStart) + core.slice(readyEnd);

let leave = fn(rooms, "leave_room");
leave = must(leave,
  "select user_id into v_next from public.room_members where room_id = p_room_id order by joined_at limit 1;",
  "select m.user_id into v_next from public.room_members m join public.profiles p on p.id = m.user_id\n  where m.room_id = p_room_id and not p.is_bot order by m.joined_at limit 1;");
leave = orReplace(leave);

let findMatch = orReplace(fn(rooms, "find_match"));
findMatch = must(findMatch,
  "    insert into public.room_members (room_id, user_id, franchise_id) values (v_room.id, v_uid, v_franchise);",
  "    insert into public.room_members (room_id, user_id, franchise_id) values (v_room.id, v_uid, v_franchise);\n" +
  "    update public.room_settings set ai_autofill_at = greatest(ai_autofill_at, clock_timestamp() + interval '25 seconds')\n" +
  "    where room_id = v_room.id and ai_autofill_at is not null;");
findMatch = must(findMatch,
  "  select id into v_franchise from public.franchises order by random() limit 1;\n  update public.room_members",
  "  update public.room_settings set ai_autofill_sec = 45, ai_autofill_at = clock_timestamp() + interval '45 seconds'\n" +
  "  where room_id = (v_created ->> 'room_id')::uuid;\n" +
  "  select id into v_franchise from public.franchises order by random() limit 1;\n  update public.room_members");
findMatch = findMatch.replace("Auction starts when four owners are ready.", "AI owners fill empty seats if nobody else joins.");

const adminStats = stats
  .split("from public.profiles where ").join("from public.profiles where not is_bot and ")
  .split("from public.profiles p where ").join("from public.profiles p where not p.is_bot and ");

const head = rd("scripts/ai-migration-head.sql");
const tail = rd("scripts/ai-migration-tail.sql");
writeFileSync(
  d + "20261118000001_ai_owners.sql",
  [head, sessionState, present, placeBid, core, leave, findMatch, tail].join("\n\n") +
    "\n\n-- admin stats exclude bots\n" + adminStats,
);
console.log("ok");

// Follow-up migration: restore the original check order (owner count before readiness).
{
  let c2 = fn(sea, "start_auction");
  c2 = must(c2, "create or replace function public.start_auction(p_room_id uuid)",
    "create or replace function public._start_core(p_room_id uuid, p_require_ready boolean default false)");
  c2 = must(c2, "v_room public.rooms := public._require_host(p_room_id);", "v_room public.rooms;");
  c2 = must(c2, "begin\n  if v_room.status <> 'lobby'",
    "begin\n  select * into v_room from public.rooms where id = p_room_id for update;\n  if v_room.status <> 'lobby'");
  c2 = must(c2, "  if exists (select 1 from public.room_members\n             where room_id = p_room_id and not is_ready",
    "  if p_require_ready and exists (select 1 from public.room_members\n             where room_id = p_room_id and not is_ready");
  const wrapper = `create or replace function public.start_auction(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms := public._require_host(p_room_id);
begin
  return public._start_core(p_room_id, true);
end;
$$;`;
  writeFileSync(d + "20261118000003_start_order.sql",
    [c2, wrapper, "drop function public._start_core(uuid);",
     "revoke execute on function public._start_core(uuid, boolean) from public, anon, authenticated;"].join("\n\n") + "\n");
}
