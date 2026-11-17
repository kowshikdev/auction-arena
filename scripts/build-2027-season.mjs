// Builds the IPL 2027 season from three sources:
//   data/2026-list.csv            official 2026 auction list (registered players, base prices, caps)
//   data/players-2026-squads.csv  the ten 2026 squads (who played for whom)
//   data/ipl-2027-retentions.json retained / released lists, purse and slots per franchise
// plus data/extra-players.csv for released or retained players found in neither list.
//
// Output: data/players-ipl-2027.csv (the season catalogue) and a seed migration.
// Usage: node scripts/build-2027-season.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  row.push(field); rows.push(row);
  return rows;
}

// Name matching: lower-case, drop dots, expand "Mohd", plus spelling variants between sources.
const ALIASES = {
  "vaibhav sooryavanshi": "vaibhav suryavanshi",
  "raj angad bawa": "raj bawa",
  "rasikh dar": "rasikh salam",
  "rasikh salam dar": "rasikh salam",
  "varun chakaravarthy": "varun chakravarthy",
  "manimaran siddharth": "m siddharth",
  "mitch owen": "mitchell owen",
  "yudhvir charak": "yudhvir singh charak",
  "mohammed arshad khan": "arshad khan",
  "t natarajan": "t natarajan",
  "am ghazanfar": "allah ghazanfar",
  "rs ambrish": "r s ambrish",
};
function key(name) {
  let k = name.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  k = k.replace(/^mohd /, "mohammed ").replace(/^md /, "mohammed ");
  return ALIASES[k] ?? k;
}

const ROLE = { BATTER: "BAT", BOWLER: "BWL", "ALL-ROUNDER": "AR", WICKETKEEPER: "WK" };
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ---- 2026 auction list
const list = new Map();
for (const cells of parseCsv(read("data/2026-list.csv"))) {
  const specialism = cells.findIndex((c) => ROLE[c.trim()]);
  // The set code (BA1, UAL10, ...) sits in column 2 or 3 depending on the row; name and country follow it.
  const set = cells.findIndex((c, i) => i < 5 && /^[A-Z]+\d+$/.test(c.trim()));
  if (specialism < 0 || set < 0) continue;
  const tail = cells.slice(specialism);
  const first = cells[set + 1].trim(), last = cells[set + 2].trim();
  const name = [first, last].filter(Boolean).join(" ");
  const nonEmpty = cells.map((c) => c.trim());
  // Read from the end: ..., test, odi, t20, ipl, 2025 team, 2025 ipl, C/U/A, price, surname, ""
  const end = nonEmpty.length - 1 - [...nonEmpty].reverse().findIndex((c) => c !== "");
  const price = Number(nonEmpty[end - 1]);
  const cua = nonEmpty[end - 2];
  const [, hand, bowling, test, odi, t20, ipl] = tail.map((c) => c.trim());
  const dob = cells.slice(set + 3, specialism).map((c) => c.trim()).find((c) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c));
  const stats = {};
  if (test) stats.Tests = Number(test);
  if (odi) stats.ODIs = Number(odi);
  if (t20) stats.T20Is = Number(t20);
  if (ipl) stats["IPL matches"] = Number(ipl);
  if (dob) {
    const [d, m, y] = dob.split("/").map(Number);
    stats.Age = 2026 - y - (m > 11 || (m === 11 && d > 17) ? 1 : 0);
  }
  list.set(key(name), {
    name,
    country: cells[set + 3].trim(),
    role: ROLE[tail[0].trim()],
    capped: cua === "Uncapped" ? "N" : "Y",
    base_lakh: Number.isFinite(price) && price > 0 ? price : 30,
    batting: hand === "LHB" ? "Left-hand bat" : hand === "RHB" ? "Right-hand bat" : "",
    bowling: bowling ? titleCase(bowling).replace(/^(Right|Left) Arm/, "$1-arm") : "",
    stats,
  });
}

// ---- 2026 squads (our earlier catalogue)
const squads = new Map();
{
  const [header, ...rows] = parseCsv(read("data/players-2026-squads.csv").trim());
  for (const cells of rows) {
    const row = Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
    squads.set(key(row.name), row);
  }
}

// ---- players missing from both lists
const extras = new Map();
{
  const [header, ...rows] = parseCsv(read("data/extra-players.csv").trim());
  for (const cells of rows) {
    if (cells.length < 2) continue;
    const row = Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
    extras.set(key(row.name), row);
  }
}

const retentions = JSON.parse(read("data/ipl-2027-retentions.json"));
const excluded = new Set(retentions.excluded.map(key));

function profile(name) {
  const k = key(name);
  const fromList = list.get(k);
  const fromSquad = squads.get(k);
  const fromExtra = extras.get(k);
  if (!fromList && !fromSquad && !fromExtra) return null;
  const base = fromList ?? fromSquad ?? fromExtra;
  return {
    name: fromSquad?.name ?? fromList?.name ?? fromExtra.name,
    country: base.country,
    role: base.role,
    capped: base.capped,
    base_lakh: Number(fromList?.base_lakh ?? fromSquad?.base_lakh ?? fromExtra.base_lakh),
    batting: fromList?.batting ?? fromExtra?.batting ?? "",
    bowling: fromList?.bowling || fromSquad?.bowling || fromExtra?.bowling || "",
    stats: fromList?.stats ?? {},
    last_team: fromSquad?.team ?? "",
  };
}

const out = new Map();
const problems = [];
const add = (k, row) => {
  if (out.has(k)) problems.push(`duplicate entry for ${row.name}`);
  out.set(k, row);
};

// Retained: stay with their (possibly new, after trades) franchise.
for (const [team, data] of Object.entries(retentions.teams)) {
  for (const name of data.retained) {
    const p = profile(name);
    if (!p) { problems.push(`retained ${team}: no profile for "${name}"`); continue; }
    add(key(name), { ...p, team, retained: "Y", available: "Y" });
  }
}
// Released: into the auction pool, remembering the last team.
for (const [team, data] of Object.entries(retentions.teams)) {
  for (const name of data.released) {
    const p = profile(name);
    if (!p) { problems.push(`released ${team}: no profile for "${name}"`); continue; }
    if (out.has(key(name))) { problems.push(`released ${team}: ${name} is also retained`); continue; }
    add(key(name), { ...p, team, retained: "N", available: excluded.has(key(name)) ? "N" : "Y" });
  }
}
// Everyone else registered for the 2026 auction goes back into the pool.
for (const [k, p] of list) {
  if (out.has(k)) continue;
  const squad = squads.get(k);
  // A 2026 squad player missing from both 2027 lists is treated as released.
  if (squad) problems.push(`note: ${p.name} (${squad.team} 2026) is in neither 2027 list; put in the pool`);
  add(k, { ...profile(p.name), team: squad?.team ?? "", retained: "N", available: excluded.has(k) ? "N" : "Y" });
}
// 2026 squad players we were told nothing about.
const unaccounted = [...squads.values()].filter((row) => !out.has(key(row.name)));

// ---- checks against the purse graphic
const summary = [];
for (const [team, data] of Object.entries(retentions.teams)) {
  const kept = [...out.values()].filter((p) => p.team === team && p.retained === "Y");
  const overseas = kept.filter((p) => p.country !== "India").length;
  const slotsOk = 25 - kept.length === data.slots;
  const osOk = 8 - overseas === data.overseas_slots;
  summary.push(`${team.padEnd(4)} retained ${String(kept.length).padStart(2)} (slots ${25 - kept.length}/${data.slots}${slotsOk ? "" : " MISMATCH"}) overseas ${overseas} (slots ${8 - overseas}/${data.overseas_slots}${osOk ? "" : " MISMATCH"}) purse ₹${data.purse_lakh / 100} Cr`);
}

const pool = [...out.values()].filter((p) => p.retained === "N" && p.available === "Y");
console.log(summary.join("\n"));
console.log(`\ncatalogue ${out.size} players · retained ${[...out.values()].filter((p) => p.retained === "Y").length} · auction pool ${pool.length} (${pool.filter((p) => p.country !== "India").length} overseas) · excluded ${[...out.values()].filter((p) => p.available === "N").length}`);
if (unaccounted.length) console.log(`\n2026 squad players not in any 2027 list (left out): ${unaccounted.map((r) => `${r.name} (${r.team})`).join(", ")}`);
if (problems.length) console.log(`\nPROBLEMS:\n- ${problems.join("\n- ")}`);
if (process.argv.includes("--check")) process.exit(problems.some((p) => !p.startsWith("note:")) ? 1 : 0);

// ---- write catalogue and migration
const cols = ["name", "team", "country", "role", "capped", "base_lakh", "marquee", "bowling", "batting", "retained", "available", "stats"];
const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const rows = [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(
  new URL("data/players-ipl-2027.csv", root),
  [cols.join(","), ...rows.map((p) => cols.map((c) => esc(c === "stats" ? JSON.stringify(p.stats) : c === "marquee" ? "" : p[c] ?? "")).join(","))].join("\n") + "\n",
);

const json = JSON.stringify(rows.map((p) => ({ ...p, stats: p.stats, last_team: undefined }))).replaceAll("'", "''");
const franchiseRows = Object.entries(retentions.teams)
  .map(([team, d]) => `  ('${retentions.season}', '${team}', ${d.purse_lakh}, ${d.slots}, ${d.overseas_slots})`)
  .join(",\n");
writeFileSync(
  new URL("supabase/migrations/20261117000002_seed_ipl_2027.sql", root),
  `-- Generated by scripts/build-2027-season.mjs. Do not edit by hand.
-- IPL 2027: retained squads (after trades), released players and the registered pool,
-- with each franchise's remaining purse and slots ahead of the auction.

insert into public.season_franchises (season_id, franchise_id, purse_lakh, slots, overseas_slots) values
${franchiseRows}
on conflict (season_id, franchise_id) do update set
  purse_lakh = excluded.purse_lakh, slots = excluded.slots, overseas_slots = excluded.overseas_slots;

-- Players not in the 2027 lists at all are no longer part of this season.
update public.player_seasons set is_available = false, is_retained = false where season_id = '${retentions.season}';

select public._import_players('${retentions.season}', '${json}'::jsonb);

update public.seasons set default_rules = default_rules || '{"retention_mode": "season"}'::jsonb where id = '${retentions.season}';
`,
);
console.log(`\nwrote data/players-ipl-2027.csv and the seed migration (${rows.length} players)`);
