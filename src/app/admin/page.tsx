"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { csvToObjects } from "@/lib/csv";
import { FRANCHISES, ROLE_LABEL } from "@/lib/franchises";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/hooks/useAuth";
import { usePlayers } from "@/hooks/usePlayers";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { DEFAULT_SETTINGS, SettingsForm, type EditableSettings } from "@/components/lobby/SettingsForm";
import { AuthGate } from "@/components/shared/AuthGate";
import { FranchiseLogo } from "@/components/shared/identity";
import { useToast } from "@/components/shared/toast";
import { Badge, Button, EmptyState, Field, Input, Modal, Panel, Select, Spinner, Toggle, cn } from "@/components/shared/ui";
import type { Player, PlayerRole } from "@/types";

type Overview = {
  counts: Record<string, number>;
  rooms: { room_id: string; code: string; name: string; status: string; visibility: string; host_name: string; member_count: number; created_at: string }[];
  reports: { id: number; message: string; status: string; created_at: string; room_code: string | null; reporter: string }[];
  admins: { user_id: string; display_name: string }[];
};
type Tab = "overview" | "players" | "import" | "season";

const CSV_COLUMNS = "name,team,country,role,capped,base_lakh,marquee,bowling,batting,retained,retention_lakh,photo_url";

function Admin() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const catalogue = usePlayers();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    const result = await api<Overview>("/api/admin/overview");
    if (result.ok) setOverview(result);
  }, []);

  useEffect(() => {
    if (profile?.is_admin) void loadOverview();
  }, [profile?.is_admin, loadOverview]);

  if (!profile) return <div className="stadium grid min-h-dvh place-items-center"><Spinner className="size-8 text-gold" /></div>;

  if (!profile.is_admin) {
    return (
      <div className="stadium min-h-dvh">
        <SiteHeader />
        <main className="mx-auto max-w-lg px-4 py-16">
          <Panel className="p-7 text-center">
            <h1 className="display text-4xl">Admin access required</h1>
            <p className="mt-2 text-sm text-mute">
              The admin panel manages players, seasons and rooms. If no administrator exists yet, the first registered account can claim it.
            </p>
            <Button
              variant="gold"
              className="mt-6"
              busy={busy === "claim"}
              onClick={async () => {
                setBusy("claim");
                const result = await api("/api/admin/claim", {});
                setBusy(null);
                if (!result.ok) return toast(result.error.message, "error");
                await refreshProfile();
                toast("You are now the administrator", "success");
              }}
            >
              Claim admin access
            </Button>
          </Panel>
        </main>
      </div>
    );
  }

  return (
    <div className="stadium min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 className="display mt-1 text-5xl">Control room</h1>
        </div>

        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-black/30 p-1">
          {([["overview", "Overview"], ["players", "Players"], ["import", "CSV import"], ["season", "Season and rules"]] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition", tab === id ? "bg-gold text-ink" : "text-mute hover:text-chalk")}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && <OverviewTab overview={overview} reload={loadOverview} />}
        {tab === "players" && <PlayersTab catalogue={catalogue} />}
        {tab === "import" && <ImportTab catalogue={catalogue} />}
        {tab === "season" && <SeasonTab catalogue={catalogue} />}
      </main>
    </div>
  );
}

function OverviewTab({ overview, reload }: { overview: Overview | null; reload: () => Promise<void> }) {
  const toast = useToast();
  if (!overview) return <div className="grid place-items-center py-16"><Spinner className="size-7 text-gold" /></div>;
  const labels: Record<string, string> = {
    users: "Users", guests: "Guests", players: "Active players", rooms_open: "Open rooms",
    auctions_completed: "Completed auctions", reports_open: "Open reports",
  };

  async function post(path: string, body: Record<string, unknown>, done: string) {
    const result = await api(path, body);
    if (!result.ok) return toast(result.error.message, "error");
    toast(done, "success");
    await reload();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Object.entries(overview.counts).map(([key, value]) => (
          <Panel key={key} className="p-4">
            <p className="eyebrow text-[10px]">{labels[key] ?? key}</p>
            <p className="display tabular mt-1 text-4xl">{value}</p>
          </Panel>
        ))}
      </div>

      <Panel className="p-5">
        <h2 className="display mb-3 text-3xl">Rooms</h2>
        {overview.rooms.length === 0 ? <EmptyState title="No rooms" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-mute">
                  <th className="pb-2 pr-3">Code</th><th className="pb-2 pr-3">Name</th><th className="pb-2 pr-3">Host</th>
                  <th className="pb-2 pr-3">Owners</th><th className="pb-2 pr-3">Status</th><th className="pb-2 pr-3">Created</th><th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {overview.rooms.map((room) => (
                  <tr key={room.room_id} className="border-t border-line">
                    <td className="py-2 pr-3 font-mono tracking-widest">{room.code}</td>
                    <td className="py-2 pr-3 font-bold">{room.name}</td>
                    <td className="py-2 pr-3 text-mute">{room.host_name}</td>
                    <td className="tabular py-2 pr-3 text-mute">{room.member_count}</td>
                    <td className="py-2 pr-3"><Badge tone={room.status === "live" ? "live" : room.status === "completed" ? "gold" : "neutral"}>{room.status}</Badge></td>
                    <td className="py-2 pr-3 text-xs text-dim">{new Date(room.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="py-2 text-right">
                      {room.status !== "completed" && (
                        <Button size="sm" variant="danger" onClick={() => post("/api/admin/rooms/close", { room_id: room.room_id }, "Room closed")}>
                          {room.status === "lobby" ? "Close" : "End"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="p-5">
        <h2 className="display mb-3 text-3xl">Reported issues</h2>
        {overview.reports.length === 0 ? <EmptyState title="No reports" /> : (
          <ul className="space-y-2">
            {overview.reports.map((report) => (
              <li key={report.id} className="flex items-start gap-3 rounded-xl border border-line bg-black/20 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{report.message}</p>
                  <p className="mt-1 text-xs text-dim">
                    {report.reporter} · {new Date(report.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                    {report.room_code && ` · room ${report.room_code}`}
                  </p>
                </div>
                {report.status === "open" ? (
                  <Button size="sm" variant="outline" onClick={() => post("/api/admin/reports/resolve", { id: report.id }, "Report resolved")}>Resolve</Button>
                ) : (
                  <Badge tone="go">Resolved</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

type Catalogue = ReturnType<typeof usePlayers>;

function PlayersTab({ catalogue }: { catalogue: Catalogue }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("");
  const [editing, setEditing] = useState<Player | null>(null);
  const [draft, setDraft] = useState<Partial<Player> & { stats_text?: string }>({});
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogue.players
      .filter((p) => (!q || p.full_name.toLowerCase().includes(q)) && (!team || (team === "none" ? !p.franchise_id : p.franchise_id === team)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [catalogue.players, query, team]);

  function open(player: Player) {
    setEditing(player);
    setDraft({ ...player, stats_text: JSON.stringify(player.stats ?? {}, null, 2) });
  }

  async function save() {
    if (!editing || !catalogue.season) return;
    let stats: Record<string, string | number>;
    try {
      stats = JSON.parse(draft.stats_text || "{}");
    } catch {
      return toast("Statistics must be valid JSON, for example {\"Matches\": 120}.", "error");
    }
    setSaving(true);
    const result = await api("/api/admin/players", {
      season_id: catalogue.season.id,
      player_id: editing.id,
      patch: {
        full_name: draft.full_name, country: draft.country, role: draft.role, is_capped: draft.is_capped,
        batting_style: draft.batting_style || null, bowling_style: draft.bowling_style || null,
        photo_url: draft.photo_url || null, stats, is_active: draft.is_active,
        base_price_lakh: Number(draft.base_price_lakh), is_marquee: draft.is_marquee,
        franchise_id: draft.franchise_id || null, is_retained: draft.is_retained,
        retention_price_lakh: draft.retention_price_lakh === null || draft.retention_price_lakh === undefined ? null : Number(draft.retention_price_lakh),
        is_available: draft.is_available,
      },
    });
    setSaving(false);
    if (!result.ok) return toast(result.error.message, "error");
    toast("Player saved", "success");
    setEditing(null);
    catalogue.refresh();
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    const response = await fetch(`/api/admin/players?id=${editing.id}`, { method: "DELETE" });
    const result = await response.json();
    setSaving(false);
    if (!result.ok) return toast(result.error.message, "error");
    toast(result.deactivated ? "Player has auction history, so was deactivated instead" : "Player removed", "success");
    setEditing(null);
    catalogue.refresh();
  }

  const set = (patch: Partial<Player> & { stats_text?: string }) => setDraft((current) => ({ ...current, ...patch }));
  const retained = catalogue.players.filter((p) => p.is_retained).length;

  return (
    <Panel className="p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-3xl">Player database</h2>
          <p className="text-sm text-mute">{catalogue.players.length} players · {retained} marked as retained · season {catalogue.season?.name ?? "none"}</p>
        </div>
        <div className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search players" className="h-10 w-48" />
          <Select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team" className="h-10 w-44">
            <option value="">All teams</option>
            <option value="none">No team</option>
            {FRANCHISES.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
          </Select>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="sticky top-0 bg-panel">
            <tr className="text-left text-[11px] uppercase tracking-wider text-mute">
              <th className="pb-2 pr-3">Player</th><th className="pb-2 pr-3">Role</th><th className="pb-2 pr-3">Country</th>
              <th className="pb-2 pr-3">Team</th><th className="pb-2 pr-3">Set</th><th className="pb-2 pr-3 text-right">Base</th>
              <th className="pb-2 pr-3">Flags</th><th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((player) => (
              <tr key={player.id} className={cn("border-t border-line", !player.is_active && "opacity-50")}>
                <td className="py-1.5 pr-3 font-bold">{player.full_name}</td>
                <td className="py-1.5 pr-3 text-mute">{ROLE_LABEL[player.role]}</td>
                <td className="py-1.5 pr-3 text-mute">{player.country}</td>
                <td className="py-1.5 pr-3">
                  {player.franchise_id ? <span className="flex items-center gap-1.5"><FranchiseLogo id={player.franchise_id} size={20} />{player.franchise_id}</span> : <span className="text-dim">None</span>}
                </td>
                <td className="py-1.5 pr-3 font-mono text-xs text-mute">{player.auction_set}</td>
                <td className="tabular py-1.5 pr-3 text-right">{formatMoney(player.base_price_lakh)}</td>
                <td className="py-1.5 pr-3">
                  <span className="flex gap-1">
                    {player.is_retained && <Badge tone="go">Retained</Badge>}
                    {player.is_marquee && <Badge tone="gold">Marquee</Badge>}
                    {!player.is_active && <Badge>Inactive</Badge>}
                  </span>
                </td>
                <td className="py-1.5 text-right"><Button size="sm" variant="ghost" onClick={() => open(player)}>Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit player" wide>
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Full name"><Input value={draft.full_name ?? ""} onChange={(e) => set({ full_name: e.target.value })} /></Field>
              <Field label="Country"><Input value={draft.country ?? ""} onChange={(e) => set({ country: e.target.value })} /></Field>
              <Field label="Role">
                <Select value={draft.role} onChange={(e) => set({ role: e.target.value as PlayerRole })}>
                  {Object.entries(ROLE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Current team">
                <Select value={draft.franchise_id ?? ""} onChange={(e) => set({ franchise_id: (e.target.value || null) as Player["franchise_id"] })}>
                  <option value="">No team</option>
                  {FRANCHISES.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </Field>
              <Field label="Base price (lakh)"><Input type="number" min={1} value={draft.base_price_lakh ?? 30} onChange={(e) => set({ base_price_lakh: Number(e.target.value) })} /></Field>
              <Field label="Retention price (lakh)" hint="Deducted from the purse when retained.">
                <Input type="number" min={0} value={draft.retention_price_lakh ?? ""} onChange={(e) => set({ retention_price_lakh: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              <Field label="Batting style"><Input value={draft.batting_style ?? ""} onChange={(e) => set({ batting_style: e.target.value })} placeholder="Right-hand bat" /></Field>
              <Field label="Bowling style"><Input value={draft.bowling_style ?? ""} onChange={(e) => set({ bowling_style: e.target.value })} placeholder="pace / spin" /></Field>
              <Field label="Photo URL"><Input value={draft.photo_url ?? ""} onChange={(e) => set({ photo_url: e.target.value })} placeholder="https://" /></Field>
            </div>
            <div className="grid gap-3 rounded-xl border border-line bg-black/20 p-3.5 sm:grid-cols-2">
              <Toggle checked={Boolean(draft.is_retained)} onChange={(v) => set({ is_retained: v })} label="Retained by current team" />
              <Toggle checked={Boolean(draft.is_marquee)} onChange={(v) => set({ is_marquee: v })} label="Marquee player" />
              <Toggle checked={Boolean(draft.is_capped)} onChange={(v) => set({ is_capped: v })} label="Capped (international)" />
              <Toggle checked={Boolean(draft.is_available)} onChange={(v) => set({ is_available: v })} label="Available this season" />
              <Toggle checked={Boolean(draft.is_active)} onChange={(v) => set({ is_active: v })} label="Active in catalogue" />
            </div>
            <Field label="Career statistics (JSON)" hint='Shown on the auction card, for example {"Matches": 120, "Runs": 3400, "SR": 141.2}'>
              <textarea
                value={draft.stats_text ?? "{}"}
                onChange={(e) => set({ stats_text: e.target.value })}
                rows={4}
                className="w-full rounded-xl border border-line bg-black/30 p-3 font-mono text-xs outline-none focus:border-gold/70"
              />
            </Field>
            <div className="flex justify-between gap-3">
              <Button variant="danger" busy={saving} onClick={remove}>Remove player</Button>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button variant="gold" busy={saving} onClick={save}>Save player</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Panel>
  );
}

function ImportTab({ catalogue }: { catalogue: Catalogue }) {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const parsed = csvToObjects(await file.text());
    setFileName(file.name);
    setRows(parsed);
    if (parsed.length === 0) toast("No rows found in that file.", "error");
  }

  async function run() {
    if (!catalogue.season) return;
    setBusy(true);
    const result = await api<{ imported: number }>("/api/admin/players/import", { season_id: catalogue.season.id, rows });
    setBusy(false);
    if (!result.ok) return toast(result.error.message, "error");
    toast(`${result.imported} players imported`, "success");
    setRows([]);
    setFileName("");
    catalogue.refresh();
  }

  const missing = rows.length > 0 ? ["name", "country", "role", "base_lakh"].filter((key) => !(key in rows[0])) : [];

  return (
    <Panel className="space-y-4 p-5">
      <div>
        <h2 className="display text-3xl">Import players from CSV</h2>
        <p className="mt-1 text-sm text-mute">
          Rows are matched by player name: existing players are updated, new ones are added to {catalogue.season?.name ?? "the active season"}. Auction sets are rebuilt after every import.
        </p>
      </div>
      <div className="rounded-xl border border-line bg-black/25 p-3">
        <p className="eyebrow text-[10px]">Columns (name, country, role and base_lakh are required)</p>
        <code className="mt-1 block break-all font-mono text-xs text-gold">{CSV_COLUMNS}</code>
        <p className="mt-2 text-xs text-dim">role: BAT, BWL, AR or WK · capped / marquee / retained: Y or N · team: CSK, MI, RCB, KKR, SRH, RR, DC, PBKS, GT, LSG or blank · prices in lakh</p>
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="CSV file"
        onChange={(e) => void onFile(e.target.files?.[0])}
        className="block w-full text-sm text-mute file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:font-semibold file:text-chalk hover:file:bg-white/15"
      />
      {rows.length > 0 && (
        <>
          <p className="text-sm">
            <b>{rows.length}</b> rows in <span className="font-mono">{fileName}</span>
            {missing.length > 0 && <span className="ml-2 text-live">Missing columns: {missing.join(", ")}</span>}
          </p>
          <div className="max-h-64 overflow-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel-2">
                <tr>{Object.keys(rows[0]).map((key) => <th key={key} className="px-2 py-1.5 text-left font-semibold text-mute">{key}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row, index) => (
                  <tr key={index} className="border-t border-line">
                    {Object.keys(rows[0]).map((key) => <td key={key} className="px-2 py-1">{row[key]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 25 && <p className="text-xs text-dim">Showing the first 25 rows.</p>}
          <Button variant="gold" busy={busy} disabled={missing.length > 0} onClick={run}>Import {rows.length} players</Button>
        </>
      )}
    </Panel>
  );
}

function SeasonTab({ catalogue }: { catalogue: Catalogue }) {
  const toast = useToast();
  const season = catalogue.season;
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const [rules, setRules] = useState<EditableSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!season) return;
    setId(season.id);
    setName(season.name);
    setYear(season.year);
    setRules({ ...DEFAULT_SETTINGS, ...(season.default_rules as Partial<EditableSettings>) });
  }, [season]);

  async function save(activate: boolean) {
    setBusy(true);
    const result = await api("/api/admin/season", { id, name, year, default_rules: rules, activate });
    setBusy(false);
    if (!result.ok) return toast(result.error.message, "error");
    toast(activate ? "Season saved and activated" : "Season saved", "success");
    catalogue.refresh();
  }

  return (
    <Panel className="space-y-5 p-5">
      <div>
        <h2 className="display text-3xl">Season and default rules</h2>
        <p className="mt-1 text-sm text-mute">
          New rooms start from these rules; hosts can still change them in the lobby. Use a new season id to start a fresh catalogue, then import its players.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Season id" hint="Lower-case letters, digits and dashes."><Input value={id} onChange={(e) => setId(e.target.value)} /></Field>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Year"><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>
      </div>
      <SettingsForm value={rules} onChange={(patch) => setRules((current) => ({ ...current, ...patch }))} />
      <div className="flex flex-wrap gap-3">
        <Button variant="gold" busy={busy} onClick={() => save(false)}>Save season</Button>
        {season?.id !== id && <Button variant="outline" busy={busy} onClick={() => save(true)}>Save and make active</Button>}
      </div>
    </Panel>
  );
}

export default function AdminPage() {
  return (
    <AuthGate reason="Sign in with an administrator account.">
      <Admin />
    </AuthGate>
  );
}
