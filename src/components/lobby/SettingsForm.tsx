"use client";

import { Field, Input, Select, Toggle, cn } from "@/components/shared/ui";
import type { RoomSettings } from "@/types";

export type EditableSettings = Pick<
  RoomSettings,
  | "purse_lakh" | "squad_max" | "squad_min" | "overseas_max" | "bid_timer_sec" | "format"
  | "retention_mode" | "inactive_retained_in_pool" | "unsold_reround" | "pool_limit"
>;

export const DEFAULT_SETTINGS: EditableSettings = {
  purse_lakh: 12500,
  squad_max: 25,
  squad_min: 18,
  overseas_max: 8,
  bid_timer_sec: 20,
  format: "standard",
  retention_mode: "season",
  inactive_retained_in_pool: false,
  unsold_reround: true,
  pool_limit: null,
};

const POOLS: { limit: number | null; label: string; note: string }[] = [
  { limit: 60, label: "Quick", note: "60 players · about 40 min" },
  { limit: 120, label: "Standard", note: "120 players · about 80 min" },
  { limit: null, label: "Full", note: "every player in the catalogue" },
];

function Choice({ active, onClick, title, note, disabled }: { active: boolean; onClick: () => void; title: string; note?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
        active ? "border-gold/70 bg-gold/10" : "border-line bg-black/20 hover:border-line-strong",
      )}
    >
      <span className={cn("block text-sm font-bold", active ? "text-gold" : "text-chalk")}>{title}</span>
      {note && <span className="mt-0.5 block text-[11px] leading-snug text-dim">{note}</span>}
    </button>
  );
}

/** Auction rule editor, used when creating a room and by the host in the lobby. */
export function SettingsForm({
  value,
  onChange,
  disabled,
}: {
  value: EditableSettings;
  onChange: (patch: Partial<EditableSettings>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gold/30 bg-gold/5 p-3.5 text-sm">
        <p className="font-bold text-gold">IPL 2027 squads</p>
        <p className="mt-0.5 text-xs leading-relaxed text-mute">
          Every franchise starts with its retained players and its real purse remaining. Retained players are never in the
          auction, including those of franchises nobody picks.
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-mute">Player pool</p>
        <div className="grid grid-cols-3 gap-2">
          {POOLS.map((pool) => (
            <Choice key={pool.label} disabled={disabled} active={value.pool_limit === pool.limit} onClick={() => onChange({ pool_limit: pool.limit })} title={pool.label} note={pool.note} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Bid timer">
          <Select disabled={disabled} value={value.bid_timer_sec} onChange={(e) => onChange({ bid_timer_sec: Number(e.target.value) })}>
            {[8, 10, 15, 20, 30, 45].map((s) => (
              <option key={s} value={s}>{s} seconds</option>
            ))}
          </Select>
        </Field>
        <Field label="Format">
          <Select disabled={disabled} value={value.format} onChange={(e) => onChange({ format: e.target.value as EditableSettings["format"] })}>
            <option value="standard">Standard</option>
            <option value="accelerated">Accelerated (10s max)</option>
            <option value="custom">Custom</option>
          </Select>
        </Field>
        <Field label="Squad size (max)">
          <Input type="number" min={5} max={30} disabled={disabled} value={value.squad_max} onChange={(e) => onChange({ squad_max: Number(e.target.value) })} />
        </Field>
        <Field label="Squad size (min)">
          <Input type="number" min={1} max={30} disabled={disabled} value={value.squad_min} onChange={(e) => onChange({ squad_min: Number(e.target.value) })} />
        </Field>
        <Field label="Overseas limit">
          <Input type="number" min={0} max={30} disabled={disabled} value={value.overseas_max} onChange={(e) => onChange({ overseas_max: Number(e.target.value) })} />
        </Field>
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-black/20 p-3.5">
        <Toggle disabled={disabled} checked={value.unsold_reround} onChange={(v) => onChange({ unsold_reround: v })} label="Bring unsold players back for a faster final round" />
      </div>
      <p className="text-xs leading-relaxed text-dim">
        Bid steps follow the IPL table: ₹5 L up to ₹1 Cr, ₹10 L to ₹2 Cr, ₹20 L to ₹5 Cr, then ₹25 L. A franchise must keep
        enough purse to fill its minimum squad.
      </p>
    </div>
  );
}
