"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export { cn };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "gold" | "ghost" | "outline" | "danger" | "go";
  size?: "sm" | "md" | "lg";
  busy?: boolean;
};

const BUTTON_VARIANT = {
  gold: "bg-gradient-to-b from-[#ffe08a] via-gold to-gold-deep text-ink shadow-[0_10px_30px_-12px_rgba(246,196,83,0.7)] hover:brightness-110",
  go: "bg-gradient-to-b from-[#6ff0ad] to-[#1fa863] text-ink shadow-[0_10px_30px_-12px_rgba(53,208,127,0.7)] hover:brightness-110",
  ghost: "bg-white/[0.06] text-chalk hover:bg-white/[0.11]",
  outline: "border border-line-strong text-chalk hover:bg-white/[0.06]",
  danger: "bg-live/15 text-[#ff8f9b] border border-live/40 hover:bg-live/25",
};

const BUTTON_SIZE = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function Button({ variant = "ghost", size = "md", busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-wide transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none active:translate-y-px",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

export function Panel({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("panel", className)}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mute">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-dim">{hint}</span>}
    </label>
  );
}

const CONTROL =
  "rounded-xl border border-line bg-black/30 px-3.5 text-sm text-chalk placeholder:text-dim " +
  "outline-none transition focus:border-gold/70 focus:bg-black/45";

/** Default size (full width, 44px tall) unless the caller passes its own w-* or h-* utility. */
function control(className?: string): string {
  const classes = className?.split(/s+/) ?? [];
  return cn(
    CONTROL,
    !classes.some((c) => c.startsWith("w-")) && "w-full",
    !classes.some((c) => c.startsWith("h-")) && "h-11",
    className,
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={control(className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(control(className), "appearance-none")}>
      {children}
    </select>
  );
}

const BADGE_TONE = {
  neutral: "bg-white/[0.07] text-mute",
  gold: "bg-gold/15 text-gold",
  live: "bg-live/15 text-[#ff8f9b]",
  go: "bg-go/15 text-go",
  warn: "bg-warn/15 text-warn",
};

export function Badge({ tone = "neutral", className, children }: { tone?: keyof typeof BADGE_TONE; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider", BADGE_TONE[tone], className)}>
      {children}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={cn("inline-block size-2 rounded-full bg-live animate-blink", className)} />;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("panel relative max-h-[90dvh] w-full animate-pop overflow-y-auto p-6", wide ? "max-w-3xl" : "max-w-md")}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="display text-2xl">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-mute hover:bg-white/10 hover:text-chalk">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left text-sm disabled:opacity-50"
    >
      <span className="text-chalk">{label}</span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-gold" : "bg-white/15")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="display text-xl text-mute">{title}</p>
      {children && <div className="mt-2 text-sm text-dim">{children}</div>}
    </div>
  );
}

export type MenuItem = { label: string; onSelect: () => void; tone?: "danger" };

/** Small "⋯" actions menu. Closes on outside click, Escape, or after choosing. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "grid size-8 place-items-center rounded-lg text-lg leading-none text-mute transition hover:bg-white/10 hover:text-chalk",
          open && "bg-white/10 text-chalk",
        )}
      >
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-30 min-w-44 animate-pop overflow-hidden rounded-xl border border-line-strong bg-panel-2 p-1 shadow-2xl">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-white/10",
                item.tone === "danger" ? "text-[#ff8f9b]" : "text-chalk",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
