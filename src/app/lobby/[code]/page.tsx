"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { FRANCHISES } from "@/lib/franchises";
import { formatMoney } from "@/lib/money";
import { useNow } from "@/hooks/useNow";
import { useRoom } from "@/hooks/useRoom";
import { useVoice } from "@/hooks/useVoice";
import { Wordmark } from "@/components/layout/SiteHeader";
import { SeasonTag } from "@/components/shared/SeasonTag";
import { SettingsForm, type EditableSettings } from "@/components/lobby/SettingsForm";
import { AuthGate } from "@/components/shared/AuthGate";
import { ChatPanel } from "@/components/shared/ChatPanel";
import { Avatar, FranchiseLogo, TeamBanner } from "@/components/shared/identity";
import { useToast } from "@/components/shared/toast";
import { Badge, Button, Menu, Modal, Panel, Spinner, cn } from "@/components/shared/ui";
import { useSeasonTeams, type SeasonTeam } from "@/hooks/useSeasonTeams";
import { MicTest, VoiceDock } from "@/components/voice/VoiceDock";
import type { FranchiseId, Member, RoomSnapshot } from "@/types";

/** Human wording for a countdown to an ISO time. */
function autofillIn(at: string, now: number) {
  const secs = Math.max(0, Math.round((new Date(at).getTime() - now) / 1000));
  return secs <= 0 ? "any moment now" : `in ${secs}s`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          window.prompt("Copy this", value);
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2 text-sm", ok ? "text-chalk" : "text-mute")}>
      <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold", ok ? "bg-go text-ink" : "bg-white/10 text-dim")}>
        {ok ? "✓" : ""}
      </span>
      {children}
    </li>
  );
}

function Lobby() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode.toUpperCase();
  const router = useRouter();
  const toast = useToast();
  const room = useRoom(code);
  const voice = useVoice(code);
  const snapshot = room.snapshot;
  const now = useNow();
  const clock = useNow(1000);
  const seasonTeams = useSeasonTeams(snapshot?.room.season_id);

  const [pending, setPending] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<EditableSettings | null>(null);

  // Route by room state: the lobby is only for rooms that have not started.
  useEffect(() => {
    if (room.error?.code === "NOT_MEMBER") router.replace(`/join/${code}`);
    const status = snapshot?.room.status;
    if (status === "live" || status === "paused") router.replace(`/auction/${code}`);
    if (status === "completed") router.replace(`/results/${code}`);
  }, [room.error, snapshot?.room.status, code, router]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const { members, room: info, settings, me } = snapshot;
    const humanAuctioneer = info.auctioneer_type === "human" ? info.auctioneer_id ?? info.host_id : null;
    const owners = members.filter((m) => m.franchise_id);
    const unseated = members.filter((m) => !m.franchise_id && m.user_id !== humanAuctioneer);
    const notReady = members.filter((m) => !m.is_ready && m.user_id !== info.host_id);
    const meMember = members.find((m) => m.user_id === me.user_id);
    const ownerByFranchise = new Map<FranchiseId, Member>();
    for (const member of owners) ownerByFranchise.set(member.franchise_id as FranchiseId, member);
    return {
      owners, unseated, notReady, meMember, ownerByFranchise, humanAuctioneer,
      enoughOwners: owners.length >= settings.min_participants,
      canStart: owners.length >= settings.min_participants && unseated.length === 0 && notReady.length === 0,
    };
  }, [snapshot]);

  if (room.loading || !snapshot || !derived) {
    return (
      <div className="stadium grid min-h-dvh place-items-center">
        {room.error && room.error.code !== "NOT_MEMBER" ? (
          <Panel className="max-w-sm p-6 text-center">
            <p className="display text-2xl">Room unavailable</p>
            <p className="mt-2 text-sm text-mute">{room.error.message}</p>
            <Button className="mt-4" variant="outline" onClick={() => router.push("/dashboard")}>Back to dashboard</Button>
          </Panel>
        ) : (
          <Spinner className="size-8 text-gold" />
        )}
      </div>
    );
  }

  const { room: info, settings, me, members } = snapshot;
  const roomId = info.id;
  const inviteLink = `${origin}/join/${info.code}?t=${snapshot.invite_token}`;
  const isOnline = (member: Member) =>
    room.online.has(member.user_id) || now - new Date(member.last_seen_at).getTime() < 45_000;

  async function act(key: string, path: string, body: Record<string, unknown>, success?: string) {
    setPending(key);
    const result = await api(path, body);
    setPending(null);
    if (!result.ok) toast(result.error.message, "error");
    else if (success) toast(success, "success");
    return result.ok;
  }

  const pickFranchise = (id: FranchiseId | null) =>
    act(`team-${id}`, "/api/rooms/franchise", { room_id: roomId, franchise_id: id });

  async function start() {
    const ok = await act("start", "/api/auctions/start", { room_id: roomId });
    if (ok) router.replace(`/auction/${code}`);
  }

  async function leave() {
    void voice.leave();
    const ok = await act("leave", "/api/rooms/leave", { room_id: roomId });
    if (ok) router.replace("/dashboard");
  }

  async function saveSettings() {
    if (!draft) return;
    if (draft.squad_min > draft.squad_max) {
      toast("Minimum squad size cannot exceed the maximum.", "error");
      return;
    }
    const ok = await act("settings", "/api/rooms/update", { room_id: roomId, patch: { settings: draft } }, "Auction rules updated");
    if (ok) setSettingsOpen(false);
  }

  const meReady = Boolean(derived.meMember?.is_ready);
  const canReady = Boolean(me.franchise_id) || me.user_id === derived.humanAuctioneer;

  return (
    <div className="stadium min-h-dvh">
      {/* Top bar */}
      <header className="border-b border-line bg-ink/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-5">
            <Wordmark className="hidden sm:flex" />
            <div>
              <SeasonTag size="sm" />
              <p className="eyebrow mt-1">Lobby · {info.visibility}</p>
              <h1 className="display text-2xl sm:text-3xl">{info.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-1.5 font-mono text-lg font-bold tracking-[0.3em] text-gold">
              {info.code}
            </span>
            <CopyButton value={info.code} label="Copy code" />
            <CopyButton value={inviteLink} label="Copy invite link" />
            <Badge tone={room.connected ? "go" : "warn"}>{room.connected ? "Connected" : "Reconnecting"}</Badge>
            <Button size="sm" variant="danger" busy={pending === "leave"} onClick={leave}>Leave</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_22rem]">
        {/* Franchise slots */}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="eyebrow">Choose your franchise</p>
              <h2 className="display text-3xl">{derived.owners.length} of {info.max_participants} owners seated</h2>
            </div>
            {me.franchise_id && (
              <Button size="sm" variant="ghost" onClick={() => pickFranchise(null)} busy={pending === "team-null"}>
                Release my franchise
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {FRANCHISES.map((team) => {
              const owner = derived.ownerByFranchise.get(team.id);
              const mine = owner?.user_id === me.user_id;
              const taken = Boolean(owner) && !mine;
              const seatsFull = !me.franchise_id && derived.owners.length >= info.max_participants;
              return (
                <button
                  key={team.id}
                  disabled={taken || mine || seatsFull || pending !== null}
                  onClick={() => pickFranchise(team.id)}
                  style={{ "--team": team.color } as React.CSSProperties}
                  className={cn(
                    "group panel overflow-hidden text-left transition",
                    mine && "team-glow",
                    !taken && !mine && !seatsFull && "hover:-translate-y-0.5 hover:border-line-strong",
                    taken && "cursor-not-allowed",
                  )}
                  aria-label={`${team.name}${owner ? `, taken by ${owner.display_name}` : ", available"}`}
                >
                  <TeamBanner id={team.id} logoSize={72} dimmed={!owner} className={cn("aspect-[3/2] w-full", !owner && "opacity-80 group-hover:opacity-100")}>
                    {mine && <Badge tone="gold" className="absolute left-2 top-2 bg-ink/80">You</Badge>}
                    {owner?.is_bot ? <Badge tone="gold" className="absolute right-2 top-2 bg-ink/80">AI</Badge> : owner?.is_ready && <Badge tone="go" className="absolute right-2 top-2 bg-ink/80">Ready</Badge>}
                  </TeamBanner>
                  <div className="p-3">
                    <p className="display truncate text-lg leading-tight">{team.name}</p>
                    {snapshot.settings.retention_mode === "season" && seasonTeams.get(team.id) && (
                      <p className="tabular mt-0.5 text-[11px] font-semibold text-gold">
                        {formatMoney(seasonTeams.get(team.id)!.purse_lakh)} · {seasonTeams.get(team.id)!.slots} slots · {seasonTeams.get(team.id)!.overseas_slots} OS
                      </p>
                    )}
                    {owner ? (
                      <div className="mt-2 flex items-center gap-2" title={owner.is_bot ? `AI owner · ${owner.bot_persona ?? ""}` : undefined}>
                        <Avatar name={owner.display_name} src={owner.avatar_url} size={22} />
                        <span className="truncate text-xs font-semibold">{owner.display_name}</span>
                        <span className={cn("ml-auto size-2 shrink-0 rounded-full", isOnline(owner) ? "bg-go" : "bg-dim")} title={isOnline(owner) ? "Online" : "Offline"} />
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-dim">{seatsFull ? "Seats full" : "Available · tap to claim"}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Chat */}
          <Panel className="mt-5 flex h-72 flex-col p-4">
            <p className="eyebrow mb-2">Room chat</p>
            <ChatPanel roomId={roomId} messages={snapshot.chat} meId={me.user_id} className="flex-1" />
          </Panel>
        </section>

        {/* Side column */}
        <aside className="space-y-4">
          <Panel className="p-5">
            <p className="eyebrow">Start conditions</p>
            <ul className="mt-3 space-y-2">
              <Check ok={derived.enoughOwners}>
                At least {settings.min_participants} franchise owners ({derived.owners.length} seated)
              </Check>
              <Check ok={derived.unseated.length === 0}>
                Everyone has a franchise
                {derived.unseated.length > 0 && ` (${derived.unseated.map((m) => m.display_name).join(", ")} still choosing)`}
              </Check>
              <Check ok={derived.notReady.length === 0}>
                Everyone is ready{derived.notReady.length > 0 && ` (${derived.notReady.length} not ready)`}
              </Check>
            </ul>

            {me.user_id !== info.host_id && (
              <Button
                variant={meReady ? "outline" : "go"}
                size="lg"
                className="mt-5 w-full"
                disabled={!canReady}
                busy={pending === "ready"}
                onClick={() => act("ready", "/api/rooms/ready", { room_id: roomId, ready: !meReady })}
              >
                {meReady ? "Not ready" : canReady ? "I am ready" : "Pick a franchise first"}
              </Button>
            )}
            {me.is_host && derived.owners.length < info.max_participants && (
              <Button variant="outline" size="lg" className="mt-3 w-full" busy={pending === "fill"} onClick={() => act("fill", "/api/rooms/ai", { action: "fill", room_id: roomId }, "AI owners seated")}>
                Fill empty seats with AI
              </Button>
            )}
            {settings.ai_autofill_at && (
              <p className="mt-3 text-center text-xs text-gold">AI owners join and the auction starts {autofillIn(settings.ai_autofill_at, clock)}.</p>
            )}
            {me.is_host ? (
              <Button variant="gold" size="lg" className="mt-5 w-full shine" disabled={!derived.canStart} busy={pending === "start"} onClick={start}>
                Start auction
              </Button>
            ) : (
              <p className="mt-3 text-center text-xs text-dim">The host starts the auction once everyone is ready.</p>
            )}
          </Panel>

          <Panel className="p-5">
            <p className="eyebrow mb-3">Voice</p>
            <VoiceDock voice={voice} />
            <div className="mt-3"><MicTest /></div>
          </Panel>

          <Panel className="p-5">
            <p className="eyebrow mb-3">Participants · {members.length}</p>
            <ul className="space-y-2.5">
              {members.map((member) => (
                <li key={member.user_id} className="flex items-center gap-2.5">
                  <span className="relative">
                    <Avatar name={member.display_name} src={member.avatar_url} size={32} />
                    <span className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-panel", isOnline(member) ? "bg-go" : "bg-dim")} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {member.display_name}
                      {member.user_id === me.user_id && <span className="text-dim"> (you)</span>}
                    </p>
                    <p className="flex flex-wrap items-center gap-1 text-[11px] text-dim">
                      {member.user_id === info.host_id && <span className="text-gold">Host</span>}
                      {member.user_id === derived.humanAuctioneer && <span className="text-gold">Auctioneer</span>}
                      {member.is_bot && <span className="text-gold">AI · {member.bot_persona}</span>}
                      {voice.speaking.has(member.user_id) && <span className="text-go">Speaking</span>}
                      {!isOnline(member) && <span>Disconnected</span>}
                      {member.is_ready && <span className="text-go">Ready</span>}
                    </p>
                  </div>
                  <FranchiseLogo id={member.franchise_id} size={26} />
                  {me.is_host && member.user_id !== me.user_id && (
                    <Menu
                      label={`Actions for ${member.display_name}`}
                      items={[
                        { label: "Make auctioneer", onSelect: () => void act("auc", "/api/rooms/auctioneer", { room_id: roomId, type: "human", user_id: member.user_id }) },
                        { label: "Make host", onSelect: () => void act("host", "/api/rooms/host", { room_id: roomId, user_id: member.user_id }) },
                        { label: "Remove from room", tone: "danger", onSelect: () => void act("kick", "/api/rooms/kick", { room_id: roomId, user_id: member.user_id }) },
                      ]}
                    />
                  )}
                </li>
              ))}
            </ul>
            {!me.is_host && !isOnline(members.find((m) => m.user_id === info.host_id) ?? members[0]) && (
              <Button size="sm" variant="outline" className="mt-4 w-full" onClick={() => act("claim", "/api/rooms/host", { room_id: roomId })}>
                Host is offline: take over as host
              </Button>
            )}
          </Panel>

          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow">Auction setup</p>
              {me.is_host && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft({
                      purse_lakh: settings.purse_lakh, squad_max: settings.squad_max, squad_min: settings.squad_min,
                      overseas_max: settings.overseas_max, bid_timer_sec: settings.bid_timer_sec, format: settings.format,
                      retention_mode: settings.retention_mode, inactive_retained_in_pool: settings.inactive_retained_in_pool,
                      unsold_reround: settings.unsold_reround, pool_limit: settings.pool_limit,
                    });
                    setSettingsOpen(true);
                  }}
                >
                  Edit rules
                </Button>
              )}
            </div>
            <SetupSummary snapshot={snapshot} seasonTeams={seasonTeams} />
            {me.is_host && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={info.auctioneer_type === "system" ? "gold" : "outline"}
                  onClick={() => act("auc", "/api/rooms/auctioneer", { room_id: roomId, type: "system" })}
                >
                  System auctioneer
                </Button>
                <Button
                  size="sm"
                  variant={info.auctioneer_type === "human" ? "gold" : "outline"}
                  onClick={() => act("auc", "/api/rooms/auctioneer", { room_id: roomId, type: "human", user_id: info.auctioneer_id ?? me.user_id })}
                >
                  Human auctioneer
                </Button>
              </div>
            )}
          </Panel>
        </aside>
      </main>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Auction rules" wide>
        {draft && (
          <>
            <SettingsForm value={draft} onChange={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))} />
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button variant="gold" busy={pending === "settings"} onClick={saveSettings}>Save rules</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function SetupSummary({ snapshot, seasonTeams }: { snapshot: RoomSnapshot; seasonTeams: Map<string, SeasonTeam> }) {
  const { settings, room: info, members } = snapshot;
  const auctioneerName =
    info.auctioneer_type === "human"
      ? members.find((m) => m.user_id === (info.auctioneer_id ?? info.host_id))?.display_name ?? "Host"
      : "System (automatic)";
  const rows: [string, string][] = [
    ["Auctioneer", auctioneerName],
    ["Purse", settings.retention_mode === "season" && seasonTeams.size > 0 ? "Season purse per team" : formatMoney(settings.purse_lakh, { compact: true })],
    ["Squad", `${settings.squad_min} to ${settings.squad_max} players`],
    ["Overseas limit", String(settings.overseas_max)],
    ["Bid timer", `${settings.bid_timer_sec} seconds`],
    ["Format", settings.format],
    ["Player pool", settings.pool_limit ? `First ${settings.pool_limit} players` : "Full catalogue"],
    ["Retentions", settings.retention_mode === "season" ? "IPL 2027 squads" : "None"],
  ];
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-mute">{label}</dt>
          <dd className="text-right font-semibold capitalize">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function LobbyPage() {
  return (
    <AuthGate reason="Pick a name to enter this lobby.">
      <Lobby />
    </AuthGate>
  );
}
