import { useId } from "react";

/**
 * AuctionArena mark: a gavel striking over a stadium arc, on a night-blue tile.
 * Pure SVG so it stays sharp at every size; the same drawing is src/app/icon.svg.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="AuctionArena">
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2846" />
          <stop offset="1" stopColor="#070b15" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe9a6" />
          <stop offset="0.5" stopColor="#f6c453" />
          <stop offset="1" stopColor="#c98f24" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}-tile)`} />
      <rect x="1" y="1" width="62" height="62" rx="14" fill="none" stroke="#f6c453" strokeOpacity="0.45" strokeWidth="2" />
      {/* stadium arc and floodlight dots */}
      <path d="M10 48 A22 22 0 0 1 54 48" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="14" cy="34" r="2" fill="#f6c453" />
      <circle cx="50" cy="34" r="2" fill="#f6c453" />
      {/* gavel */}
      <g transform="rotate(-38 32 30)">
        <rect x="20" y="16" width="24" height="11" rx="3" fill={`url(#${id}-gold)`} />
        <rect x="18" y="17.5" width="3.5" height="8" rx="1.2" fill="#ffe9a6" />
        <rect x="42.5" y="17.5" width="3.5" height="8" rx="1.2" fill="#ffe9a6" />
        <rect x="30" y="26" width="4.5" height="22" rx="2.2" fill={`url(#${id}-gold)`} />
      </g>
      {/* sound block */}
      <rect x="22" y="49" width="20" height="5" rx="2" fill="#f6c453" />
    </svg>
  );
}
