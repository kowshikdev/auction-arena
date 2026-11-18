// Builds scouting ratings from Cricsheet ball-by-ball data (CC BY-SA 2.0, https://cricsheet.org).
//
//   node scripts/build-ratings.mjs <dir with ipl_json extracted to ./ipl and t20s_json to ./t20>
//
// Output: supabase/migrations/<ts>_ratings_cricsheet.sql (upserts player_ratings by slug) and
// data/player-ratings-2027.csv for review. Names that cannot be matched keep their prior rating.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/build-ratings.mjs <cricsheet dir>");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const REST = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const headers = { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}` };
const get = async (path) => {
  const r = await fetch(`${REST}/${path}`, { headers });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const norm = (x, lo, hi) => clamp((x - lo) / (hi - lo));
const RECENT_SEASONS = new Set(["2025", "2026"]);

// ---- 1. accumulate per-player stats (keyed by Cricsheet display name) ----
const blank = () => ({
  matches: new Set(), bat: { runs: 0, balls: 0, out: 0, fours: 0, sixes: 0, posSum: 0, inns: 0, recentRuns: 0, recentBalls: 0, recentOut: 0 },
  bowl: { balls: 0, runs: 0, wkts: 0, dots: 0, pp: 0, death: 0, recentBalls: 0, recentRuns: 0, recentWkts: 0 },
});
const stats = new Map();
const of = (name) => {
  if (!stats.has(name)) stats.set(name, blank());
  return stats.get(name);
};
const WICKET_BOWLER = new Set(["bowled", "caught", "lbw", "stumped", "caught and bowled", "hit wicket"]);

function readMatches(folder, filter) {
  if (!existsSync(folder)) return;
  for (const file of readdirSync(folder)) {
    if (!file.endsWith(".json")) continue;
    const match = JSON.parse(readFileSync(join(folder, file), "utf8"));
    if (!filter(match.info)) continue;
    const season = String(match.info.season);
    const recent = RECENT_SEASONS.has(season) || (folder.endsWith("t20") && new Date(match.info.dates[0]) > new Date("2025-05-01"));
    for (const inning of match.innings ?? []) {
      const order = [];
      for (const over of inning.overs ?? []) {
        for (const d of over.deliveries ?? []) {
          const b = of(d.batter);
          if (!order.includes(d.batter)) order.push(d.batter);
          if (!order.includes(d.non_striker)) order.push(d.non_striker);
          const wide = d.extras?.wides;
          const noball = d.extras?.noballs;
          b.matches.add(file);
          if (!wide) {
            b.bat.balls++;
            if (recent) b.bat.recentBalls++;
          }
          b.bat.runs += d.runs.batter;
          if (recent) b.bat.recentRuns += d.runs.batter;
          if (d.runs.batter === 4) b.bat.fours++;
          if (d.runs.batter === 6) b.bat.sixes++;
          const bw = of(d.bowler);
          bw.matches.add(file);
          const conceded = d.runs.batter + (wide ?? 0) + (noball ?? 0);
          if (!wide && !noball) {
            bw.bowl.balls++;
            if (recent) bw.bowl.recentBalls++;
            if (over.over < 6) bw.bowl.pp++;
            if (over.over >= 15) bw.bowl.death++;
            if (d.runs.total === 0) bw.bowl.dots++;
          }
          bw.bowl.runs += conceded;
          if (recent) bw.bowl.recentRuns += conceded;
          for (const w of d.wickets ?? []) {
            of(w.player_out).bat.out++;
            if (recent) of(w.player_out).bat.recentOut++;
            if (WICKET_BOWLER.has(w.kind)) {
              bw.bowl.wkts++;
              if (recent) bw.bowl.recentWkts++;
            }
          }
        }
      }
      order.slice(0, 11).forEach((name, i) => {
        const s = of(name).bat;
        s.posSum += Math.floor(i / 1) < 2 ? 1 : i + 1; // opening pair counts as position 1
        s.inns++;
      });
    }
  }
}

readMatches(join(dir, "ipl"), () => true);
readMatches(join(dir, "t20"), (info) => info.gender === "male" && new Date(info.dates[0]) > new Date("2023-01-01"));
console.log("players with stats:", stats.size);

// ---- 2. name matching ----
const players = await get("players?select=id,slug,full_name,role,is_overseas,is_capped,batting_style,bowling_style&is_active=eq.true&limit=2000");
const priors = Object.fromEntries((await get("player_ratings?select=player_id,overall&limit=2000")).map((r) => [r.player_id, r.overall]));
const overrides = existsSync("data/ratings-name-map.csv")
  ? Object.fromEntries(readFileSync("data/ratings-name-map.csv", "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")))
  : {};

const byName = new Map([...stats.keys()].map((n) => [n.toLowerCase(), n]));
const bySurname = new Map();
for (const n of stats.keys()) {
  const parts = n.split(" ");
  const key = `${parts.at(-1)}|${parts[0][0]}`.toLowerCase();
  if (!bySurname.has(key)) bySurname.set(key, []);
  bySurname.get(key).push(n);
}
const volume = (n) => { const s = stats.get(n); return s.bat.balls + s.bowl.balls; };
function resolve(player) {
  if (overrides[player.slug]) return { name: overrides[player.slug], exact: true };
  const tokens = player.full_name.replace(/[.]/g, "").split(/\s+/);
  const surname = tokens.at(-1);
  const initials = tokens.slice(0, -1).map((t) => t[0].toUpperCase()).join("");
  const direct = byName.get(`${initials} ${surname}`.toLowerCase());
  if (direct) return { name: direct, exact: true };
  const first = byName.get(`${tokens[0]} ${surname}`.toLowerCase());
  if (first) return { name: first, exact: true };
  const loose = (bySurname.get(`${surname}|${tokens[0][0]}`.toLowerCase()) ?? []).sort((a, b) => volume(b) - volume(a));
  const pick = loose.length === 1 || (loose.length > 1 && volume(loose[0]) > 2 * volume(loose[1])) ? loose[0] : null;
  return pick ? { name: pick, exact: false } : null;
}

// ---- 3. rating formulas ----
const shrink = (value, prior, volumeBalls, k) => {
  const w = volumeBalls / (volumeBalls + k);
  return w * value + (1 - w) * prior;
};
function batScore(runs, balls, out) {
  if (balls < 1) return null;
  const sr = (runs / balls) * 100;
  const avg = runs / Math.max(out, 1);
  return 100 * (0.5 * norm(sr, 115, 175) + 0.5 * norm(avg, 14, 38));
}
function bowlScore(balls, runs, wkts) {
  if (balls < 1) return null;
  const econ = (runs / balls) * 6;
  const strike = wkts > 0 ? balls / wkts : 60;
  return 100 * (0.55 * (1 - norm(econ, 6.8, 10.2)) + 0.45 * (1 - norm(strike, 14, 34)));
}

const rows = [];
const unmatched = [];
// A Cricsheet name can belong to one player only; loose (initial + surname) matches lose to exact ones.
const claims = new Map();
const resolved = new Map();
for (const p of players) {
  const r = resolve(p);
  if (!r) continue;
  resolved.set(p.id, r);
  const list = claims.get(r.name) ?? [];
  list.push({ id: p.id, exact: r.exact });
  claims.set(r.name, list);
}
for (const list of claims.values()) {
  const exact = list.filter((c) => c.exact);
  const keep = exact.length ? exact : list.length === 1 ? list : [];
  for (const c of list) if (!keep.includes(c)) resolved.delete(c.id);
}
for (const p of players) {
  const prior = priors[p.id] ?? 45;
  const name = resolved.get(p.id)?.name;
  const s = name ? stats.get(name) : null;
  if (!s || s.bat.balls + s.bowl.balls < 30) {
    unmatched.push(`${p.full_name} (${p.role})`);
    continue;
  }
  const b = s.bat;
  const w = s.bowl;
  const batRaw = batScore(b.runs, b.balls, b.out);
  const bowlRaw = bowlScore(w.balls, w.runs, w.wkts);
  const batting = batRaw === null ? null : Math.round(shrink(batRaw, 45, b.balls, 250));
  const bowling = bowlRaw === null ? null : Math.round(shrink(bowlRaw, 45, w.balls, 250));
  const isBowler = p.role === "BWL";
  let skill;
  if (p.role === "BAT" || p.role === "WK") skill = batting ?? 45;
  else if (isBowler) skill = bowling ?? 45;
  else skill = Math.max(batting ?? 0, bowling ?? 0) * 0.65 + Math.min(batting ?? 45, bowling ?? 45) * 0.35;
  // Map the 0-100 skill score onto the rating scale used by the price curve (35 to 95).
  const statOverall = 20 + 95 * Math.pow(skill / 100, 1.3);
  const volumeTotal = (isBowler ? w.balls : p.role === "AR" ? b.balls + w.balls : b.balls);
  const overall = Math.round(clamp(shrink(statOverall, prior, volumeTotal, 350), 25, 95));

  const recentBat = batScore(b.recentRuns, b.recentBalls, b.recentOut);
  const recentBowl = bowlScore(w.recentBalls, w.recentRuns, w.recentWkts);
  const recent = isBowler ? recentBowl : p.role === "AR" ? Math.max(recentBat ?? 0, recentBowl ?? 0) : recentBat;
  const recentVolume = isBowler ? w.recentBalls : b.recentBalls + w.recentBalls;
  const form = Math.round(clamp(shrink(recent ?? 50, 50, recentVolume, 120), 0, 100));

  const tags = new Set();
  if (p.role === "WK") tags.add("keeper");
  const avgPos = b.inns ? b.posSum / b.inns : 99;
  if (b.inns >= 8 && avgPos <= 2) tags.add("opener");
  if (b.inns >= 8 && avgPos >= 5 && (b.runs / b.balls) * 100 >= 145) tags.add("finisher");
  if (b.inns >= 8 && avgPos > 2 && avgPos < 5 && batting >= 55) tags.add("anchor");
  if (w.balls >= 120 && w.death / w.balls >= 0.3) tags.add("death-bowler");
  if (w.balls >= 120 && w.pp / w.balls >= 0.3) tags.add("powerplay-bowler");
  if (w.balls >= 120) tags.add(/spin|break|orthodox|googly|chinaman/i.test(p.bowling_style ?? "") ? "spinner" : "pace");
  if (p.role === "AR") tags.add("allrounder");
  if (p.is_overseas) tags.add("overseas");
  if (!p.is_capped) tags.add("uncapped");
  if (!tags.size) tags.add(p.role.toLowerCase());

  rows.push({
    slug: p.slug, name: p.full_name, overall, batting, bowling, form, tags: [...tags],
    stats: {
      matches: s.matches.size,
      runs: b.runs, bat_sr: b.balls ? +((b.runs / b.balls) * 100).toFixed(1) : null, bat_avg: +(b.runs / Math.max(b.out, 1)).toFixed(1),
      wkts: w.wkts, econ: w.balls ? +((w.runs / w.balls) * 6).toFixed(2) : null,
    },
  });
}

// ---- 4. output ----
const esc = (t) => t.replace(/'/g, "''");
const values = rows.map((r) =>
  `  ('${esc(r.slug)}', ${r.overall}, ${r.batting ?? "null"}, ${r.bowling ?? "null"}, ${r.form}, array[${r.tags.map((t) => `'${t}'`).join(",")}]::text[], '${esc(JSON.stringify(r.stats))}'::jsonb)`,
).join(",\n");
writeFileSync(
  "supabase/migrations/20261118000004_ratings_cricsheet.sql",
  `-- Scouting ratings from Cricsheet ball-by-ball data (https://cricsheet.org, CC BY-SA 2.0).
-- Generated by scripts/build-ratings.mjs. Players without enough data keep their prior rating.
insert into public.player_ratings (player_id, overall, batting, bowling, form, tags, stats, source, updated_at)
select p.id, v.overall, v.batting, v.bowling, v.form, v.tags, v.stats, 'cricsheet', now()
from (values
${values}
) as v(slug, overall, batting, bowling, form, tags, stats)
join public.players p on p.slug = v.slug
on conflict (player_id) do update set
  overall = excluded.overall, batting = excluded.batting, bowling = excluded.bowling, form = excluded.form,
  tags = excluded.tags, stats = excluded.stats, source = excluded.source, updated_at = now();
`,
);
writeFileSync(
  "data/player-ratings-2027.csv",
  "slug,name,overall,batting,bowling,form,tags\n" + rows.map((r) => [r.slug, `"${r.name}"`, r.overall, r.batting ?? "", r.bowling ?? "", r.form, `"${r.tags.join(" ")}"`].join(",")).join("\n") + "\n",
);
console.log(`rated ${rows.length} of ${players.length}; ${unmatched.length} kept prior ratings`);
writeFileSync("data/ratings-unmatched.txt", unmatched.join("\n") + "\n");
const top = [...rows].sort((a, b) => b.overall - a.overall).slice(0, 25);
console.log(top.map((r) => `${r.overall} ${r.name} bat${r.batting} bowl${r.bowling} form${r.form}`).join("\n"));
