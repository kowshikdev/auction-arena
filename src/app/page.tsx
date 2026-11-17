import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { JoinBox } from "@/components/dashboard/JoinBox";
import { FranchiseLogo } from "@/components/shared/identity";
import { HeroCard } from "@/components/landing/HeroCard";
import { loadFeatured } from "@/lib/featured";
import { Badge, Button, LiveDot } from "@/components/shared/ui";
import { FRANCHISES } from "@/lib/franchises";

const STEPS = [
  { n: "01", title: "Open a room", body: "Create a private room for your group or jump into a public one. Share the code or invite link." },
  { n: "02", title: "Claim a franchise", body: "Ten teams, one owner each. Pick yours, test your mic and hit ready. Four owners start the auction." },
  { n: "03", title: "Bid live", body: "Every player goes under the hammer with a live countdown. Raise, pass, bluff and talk it out on voice." },
  { n: "04", title: "Own the squad", body: "Finish with full squads, purse reports and bragging rights. Every auction is saved to your history." },
];

const FEATURES = [
  { title: "Server-decided bids", body: "Two owners bid in the same instant? The database picks exactly one winner. No client ever decides a sale." },
  { title: "Real auction rules", body: "Real purses and open slots, 25-player squads, 8 overseas, IPL bid increments. All configurable by the host." },
  { title: "Voice at the table", body: "Talk to the room while you bid: mute, push-to-talk and speaking indicators built in." },
  { title: "Virtual auctioneer", body: "A system auctioneer calls every lot and bid out loud, or one of you takes the hammer." },
  { title: "Refresh-proof", body: "Drop your connection or reload the tab and you land back in your seat with the live state." },
  { title: "Real IPL 2027 squads", body: "Retained squads, purses left after trades and the full registered pool. Or switch to a mega auction from scratch." },
];

// Rebuilt at most every 10 minutes, so the featured players and purses rotate from the database.
export const revalidate = 600;

export default async function LandingPage() {
  const featured = await loadFeatured();
  return (
    <div className="stadium min-h-dvh">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
          <div className="animate-rise">
            <Badge tone="live" className="mb-5">
              <LiveDot /> Multiplayer mock auction
            </Badge>
            <h1 className="display text-6xl sm:text-7xl lg:text-8xl">
              Your friends.
              <br />
              Ten franchises.
              <br />
              <span className="gold-text">One hammer.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-mute">
              Run a full IPL-style player auction in your browser. Real-time bidding, live voice chat and an auctioneer who
              never misses a bid.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/dashboard?create=1">
                <Button variant="gold" size="lg" className="shine">Create a room</Button>
              </Link>
              <Link href="/dashboard?match=1">
                <Button variant="outline" size="lg">Find a match</Button>
              </Link>
            </div>
            <div className="mt-5 max-w-sm">
              <p className="eyebrow mb-2">Have a code?</p>
              <JoinBox size="lg" />
            </div>
          </div>

          {featured && (
            <div className="animate-rise [animation-delay:120ms]">
              <HeroCard featured={featured} />
            </div>
          )}
        </section>

        {/* Franchise strip */}
        <section className="border-y border-line bg-black/30">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-7 gap-y-4 px-4 py-7 sm:px-6">
            {FRANCHISES.map((team) => (
              <div key={team.id} className="flex items-center gap-2.5 opacity-90 transition hover:opacity-100">
                <FranchiseLogo id={team.id} size={44} />
                <span className="display hidden text-lg text-mute lg:block">{team.id}</span>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <p className="eyebrow">How it works</p>
          <h2 className="display mt-2 text-5xl">From invite to final squad</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="panel p-6">
                <span className="display gold-text text-5xl">{step.n}</span>
                <h3 className="display mt-4 text-2xl">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <p className="eyebrow">Built for a fair fight</p>
          <h2 className="display mt-2 text-5xl">Everything an auction night needs</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="panel p-6">
                <h3 className="display text-2xl">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing call */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <div className="panel team-wash flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center sm:p-10">
            <div>
              <h2 className="display text-4xl sm:text-5xl">The table is set.</h2>
              <p className="mt-2 text-mute">Four owners is all it takes to start.</p>
            </div>
            <Link href="/dashboard?create=1">
              <Button variant="gold" size="lg">Start an auction</Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-7xl px-4 py-8 text-xs leading-relaxed text-dim sm:px-6">
          AuctionArena is an independent fan-made mock auction for entertainment. It is not affiliated with, endorsed by or
          connected to the IPL, the BCCI or any franchise. Team names and logos belong to their respective owners. No real
          money is involved.
        </div>
      </footer>
    </div>
  );
}
