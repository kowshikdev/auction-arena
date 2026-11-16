# AuctionArena

Multiplayer IPL-style mock auction. Friends open a room, each takes one franchise, and bid for players in real time with voice chat and an automated (or human) auctioneer.

Independent fan project for entertainment. Not affiliated with the IPL, the BCCI or any franchise. No real money.

## Stack

| Part | Technology |
| --- | --- |
| App | Next.js 16 (App Router), TypeScript, Tailwind CSS 4 |
| Database, auth, realtime | Supabase (Postgres, Auth, Realtime broadcast and presence) |
| Voice | LiveKit Cloud (WebRTC) |
| Auctioneer voice and sounds | Browser speech synthesis and Web Audio |
| Tests | Vitest (unit and database integration), Playwright (four-browser end to end) |
| Hosting | Vercel (functions pinned to Mumbai, `bom1`) |

## How the auction stays fair

- **The database decides.** Every bid, sale and timer expiry runs inside a Postgres function that first locks the room's session row, so actions for one room happen strictly one at a time. Two owners bidding in the same instant produce exactly one accepted bid.
- **No server timer, no client timer.** The deadline is a timestamp in the database. Browsers only draw it. A lot closes when a client (or the `pg_cron` backstop, every 5 seconds) asks the server to check and the database clock has passed the deadline.
- **Stale and duplicate requests are rejected.** A bid carries the lot id, the exact next amount and an idempotency key.
- **Clients cannot write tables.** Row level security allows reads only; all writes go through functions that identify the caller with `auth.uid()`. No service-role key exists in the app.
- **Events are ordered.** Each change appends a numbered event and broadcasts it. A client that sees a gap, reconnects or wakes up refetches the authoritative snapshot.
- **Money is integer lakhs** (100 lakh = 1 crore), so there is no floating point drift.

## Auction rules (defaults, all configurable per room)

| Rule | Default |
| --- | --- |
| Purse | ₹125 Cr (presets for ₹120 Cr and ₹130 Cr) |
| Squad | 18 to 25 players, at most 8 overseas |
| Bid steps | ₹5 L up to ₹1 Cr, ₹10 L to ₹2 Cr, ₹20 L to ₹5 Cr, then ₹25 L |
| Base prices | ₹30 L to ₹2 Cr |
| Timer | 20 seconds, reset by every valid bid |
| Purse reserve | A franchise must keep enough to fill its minimum squad |
| Unsold players | Return once in a faster final round |
| Retentions | Off (everyone in the pool) or taken from the season's retention list |

Players are the IPL 2026 squads (250 players) grouped into marquee, capped and uncapped sets. Team, retention status, base price and every other field are editable in the admin panel or by CSV import, because retention lists change.

## Run locally

Requirements: Node 22+, pnpm, a Supabase project, optionally a LiveKit Cloud project.

```bash
pnpm install
cp .env.example .env.local   # fill in the values
supabase link --project-ref <your-project-ref>
supabase db push             # schema, functions, franchises, players
pnpm dev
```

In Supabase, enable **Anonymous sign-ins** (Authentication > Providers) for guest play. `supabase config push` applies the settings in `supabase/config.toml`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (safe in the browser) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Voice chat. Without them the app runs with voice disabled |

### Google sign-in

1. In Google Cloud Console open **Google Auth Platform > Clients** and create an OAuth client of type **Web application**.
2. Add the authorised redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Export `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`, set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, and run `supabase config push`.

### First administrator

Register an account, open `/admin` and press **Claim admin access**. This works only while no administrator exists.

## Tests

```bash
pnpm test        # unit tests plus database integration tests (bidding races, purse, clock)
pnpm build && pnpm test:e2e   # four browsers: create, join, bid, sold, refresh, pause, voice, results
```

Integration and end-to-end tests run against the Supabase project in `.env.local` using fixed test accounts (`ownerN@auctionarena.test`).

## Project layout

```
src/app            pages and /api route handlers
src/components     UI by area: auction, lobby, teams, voice, dashboard, shared
src/hooks          useRoom (live sync), useVoice, useAnnouncer, useCountdown
src/lib            Supabase clients, API helpers, money, audio, validation
supabase/migrations  schema, room functions, auction engine, admin, seed
data               player catalogue CSV (source for the seed migration)
tests, e2e         Vitest and Playwright suites
```
