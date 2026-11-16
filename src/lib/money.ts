import type { IncrementBand } from "@/types";

/** 520 -> "₹5.20 Cr", 30 -> "₹30 L". Amounts are integer lakhs. */
export function formatMoney(lakh: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (lakh === null || lakh === undefined) return "—";
  if (lakh === 0) return "₹0";
  if (lakh < 100) return `₹${lakh} L`;
  const crore = lakh / 100;
  const digits = opts.compact && Number.isInteger(crore) ? 0 : 2;
  return `₹${crore.toFixed(digits)} Cr`;
}

/** Words for the auctioneer voice: 220 -> "two crore twenty lakh". */
export function speakMoney(lakh: number): string {
  const crore = Math.floor(lakh / 100);
  const rest = lakh % 100;
  const parts: string[] = [];
  if (crore > 0) parts.push(`${crore} crore`);
  if (rest > 0) parts.push(`${rest} lakh`);
  return parts.join(" ") || "zero";
}

/** Mirror of the server's _next_bid. Display only: the server decides what is valid. */
export function nextBid(increments: IncrementBand[], base: number, current: number | null): number {
  if (current === null) return base;
  for (const band of increments) {
    if (band.upto === null || current < band.upto) return current + band.step;
  }
  return current + 25;
}

/** Mirror of the server's _max_bid (purse kept back to fill the minimum squad). */
export function maxBid(purse: number, squadCount: number, squadMin: number, cheapestBase: number): number {
  const reserveSlots = Math.max(0, squadMin - squadCount - 1);
  return Math.max(0, purse - reserveSlots * cheapestBase);
}
