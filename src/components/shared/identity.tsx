import Image from "next/image";
import type { CSSProperties } from "react";
import { franchise } from "@/lib/franchises";
import type { FranchiseId } from "@/types";
import { cn } from "@/lib/cn";

/** Small round franchise crest: team artwork behind, logo centred with a white outline. */
export function FranchiseLogo({ id, size = 40, className }: { id: FranchiseId | string | null | undefined; size?: number; className?: string }) {
  const team = franchise(id);
  if (!team) {
    return (
      <span
        className={cn("grid shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-dim", className)}
        style={{ width: size, height: size, fontSize: size * 0.36 }}
      >
        ?
      </span>
    );
  }
  return (
    <span
      className={cn("relative grid shrink-0 place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${team.bg})`,
        backgroundSize: "170%",
        backgroundPosition: "center",
        backgroundColor: team.color,
        boxShadow: `0 0 0 1px rgb(255 255 255 / 0.35), 0 6px 18px -8px ${team.color}`,
      }}
    >
      <Image
        src={team.logo}
        alt={team.name}
        width={Math.round(size * 0.8)}
        height={Math.round(size * 0.8)}
        className="object-contain"
        style={{ filter: "drop-shadow(0.75px 0 0 #fff) drop-shadow(-0.75px 0 0 #fff) drop-shadow(0 0.75px 0 #fff) drop-shadow(0 -0.75px 0 #fff)" }}
      />
    </span>
  );
}

/**
 * Franchise banner: the team artwork fills the box and the crest sits in the middle,
 * with a white outline so it reads on any background colour.
 */
export function TeamBanner({
  id,
  logoSize = 84,
  className,
  children,
  dimmed,
}: {
  id: FranchiseId | string;
  logoSize?: number;
  className?: string;
  children?: React.ReactNode;
  dimmed?: boolean;
}) {
  const team = franchise(id);
  if (!team) return null;
  return (
    <div
      className={cn("relative grid place-items-center overflow-hidden bg-cover bg-center", className)}
      style={{ backgroundImage: `url(${team.bg})`, backgroundColor: team.color }}
    >
      <Image
        src={team.logo}
        alt={team.name}
        width={logoSize}
        height={logoSize}
        className={cn("relative object-contain transition duration-300", dimmed && "opacity-90 saturate-[0.85]")}
        style={{
          filter:
            "drop-shadow(1.5px 0 0 #fff) drop-shadow(-1.5px 0 0 #fff) drop-shadow(0 1.5px 0 #fff) drop-shadow(0 -1.5px 0 #fff) drop-shadow(0 6px 10px rgba(0,0,0,0.35))",
        }}
      />
      {children}
    </div>
  );
}

/** Sets --team so .team-glow / .team-wash pick up the franchise colour. */
export function teamStyle(id: FranchiseId | string | null | undefined): CSSProperties {
  const team = franchise(id);
  return team ? ({ "--team": team.color } as CSSProperties) : {};
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\s.]/gu, "").split(/[\s.]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function hue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

/** Person avatar: profile image if set, otherwise initials on a stable colour. */
export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied hosts
    return <img src={src} alt={name} width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full font-bold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue(name)} 62% 46%), hsl(${(hue(name) + 40) % 360} 62% 30%))` }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Player portrait. No player photos ship with the app (image rights), so the default is a
 * jersey-style monogram tinted with the player's current team colour; an admin-supplied
 * photo_url replaces it.
 */
export function PlayerPortrait({
  name,
  photoUrl,
  teamId,
  size = 96,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  teamId?: FranchiseId | string | null;
  size?: number;
  className?: string;
}) {
  const team = franchise(teamId);
  const tint = team?.color ?? "#f6c453";
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-supplied hosts
    return <img src={photoUrl} alt={name} className={cn("shrink-0 rounded-2xl object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={cn("display relative grid shrink-0 place-items-center overflow-hidden rounded-2xl text-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(160deg, ${tint}cc 0%, ${tint}33 46%, #0b1120 100%)`,
        boxShadow: `inset 0 0 0 1px ${tint}66`,
      }}
    >
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
      <span className="relative drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">{initials(name)}</span>
    </span>
  );
}
