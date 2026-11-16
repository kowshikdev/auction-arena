import type { FranchiseId, PlayerRole } from "@/types";

export type Franchise = {
  id: FranchiseId;
  name: string;
  city: string;
  color: string;      // primary, used for glows and accents
  color2: string;     // secondary
  logo: string;
  bg: string;        // banner artwork; the logo sits centred on top
};

// Mirrors the franchises table. Kept static so team colours are available on first paint.
export const FRANCHISES: Franchise[] = [
  { id: "CSK", name: "Chennai Super Kings", city: "Chennai", color: "#F9CD05", color2: "#1D418C", logo: "/logos/csk.png", bg: "/teams/csk-bg.png" },
  { id: "MI", name: "Mumbai Indians", city: "Mumbai", color: "#1E6FD9", color2: "#D1AB3E", logo: "/logos/mi.png", bg: "/teams/mi-bg.png" },
  { id: "RCB", name: "Royal Challengers Bengaluru", city: "Bengaluru", color: "#E0222B", color2: "#D4AF37", logo: "/logos/rcb.png", bg: "/teams/rcb-bg.png" },
  { id: "KKR", name: "Kolkata Knight Riders", city: "Kolkata", color: "#6A3FA0", color2: "#F2C028", logo: "/logos/kkr.png", bg: "/teams/kkr-bg.png" },
  { id: "SRH", name: "Sunrisers Hyderabad", city: "Hyderabad", color: "#FF822A", color2: "#1A1A1A", logo: "/logos/srh.png", bg: "/teams/srh-bg.png" },
  { id: "RR", name: "Rajasthan Royals", city: "Jaipur", color: "#EA1A85", color2: "#254AA5", logo: "/logos/rr.png", bg: "/teams/rr-bg.png" },
  { id: "DC", name: "Delhi Capitals", city: "Delhi", color: "#2561AE", color2: "#EF1B23", logo: "/logos/dc.png", bg: "/teams/dc-bg.png" },
  { id: "PBKS", name: "Punjab Kings", city: "Mullanpur", color: "#ED1B24", color2: "#C0C0C0", logo: "/logos/pbks.png", bg: "/teams/pbks-bg.png" },
  { id: "GT", name: "Gujarat Titans", city: "Ahmedabad", color: "#6FB7E0", color2: "#B7985A", logo: "/logos/gt.png", bg: "/teams/gt-bg.png" },
  { id: "LSG", name: "Lucknow Super Giants", city: "Lucknow", color: "#3F8CFF", color2: "#F28B00", logo: "/logos/lsg.png", bg: "/teams/lsg-bg.png" },
];

const BY_ID = new Map(FRANCHISES.map((f) => [f.id, f]));

export function franchise(id: FranchiseId | string | null | undefined): Franchise | undefined {
  return id ? BY_ID.get(id as FranchiseId) : undefined;
}

export const ROLE_LABEL: Record<PlayerRole, string> = {
  BAT: "Batter",
  BWL: "Bowler",
  AR: "All-rounder",
  WK: "Wicketkeeper",
};

export const ROLE_PLURAL: Record<PlayerRole, string> = {
  BAT: "Batters",
  BWL: "Bowlers",
  AR: "All-rounders",
  WK: "Wicketkeepers",
};

const SET_NAMES: Record<string, string> = {
  M: "Marquee",
  BA: "Capped batters",
  AL: "Capped all-rounders",
  WK: "Capped wicketkeepers",
  FA: "Capped fast bowlers",
  SP: "Capped spinners",
  UBA: "Uncapped batters",
  UAL: "Uncapped all-rounders",
  UWK: "Uncapped wicketkeepers",
  UFA: "Uncapped fast bowlers",
  USP: "Uncapped spinners",
};

/** "UFA2" -> "Uncapped fast bowlers · set 2". */
export function setLabel(code: string): string {
  const match = code.match(/^([A-Z]+)(\d+)$/);
  if (!match) return code;
  return `${SET_NAMES[match[1]] ?? match[1]} · set ${match[2]}`;
}
