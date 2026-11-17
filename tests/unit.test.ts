import { describe, expect, it } from "vitest";
import { csvToObjects, parseCsv } from "@/lib/csv";
import { pickForWindow } from "@/lib/featured";
import { formatMoney, maxBid, nextBid, speakMoney } from "@/lib/money";
import type { IncrementBand } from "@/types";

const IPL: IncrementBand[] = [
  { upto: 100, step: 5 },
  { upto: 200, step: 10 },
  { upto: 500, step: 20 },
  { upto: null, step: 25 },
];

describe("bid increments", () => {
  it("opens at the base price", () => {
    expect(nextBid(IPL, 200, null)).toBe(200);
  });
  it("steps by band, switching exactly at each boundary", () => {
    expect(nextBid(IPL, 30, 30)).toBe(35);
    expect(nextBid(IPL, 30, 95)).toBe(100);
    expect(nextBid(IPL, 30, 100)).toBe(110);
    expect(nextBid(IPL, 30, 190)).toBe(200);
    expect(nextBid(IPL, 30, 200)).toBe(220);
    expect(nextBid(IPL, 30, 480)).toBe(500);
    expect(nextBid(IPL, 30, 500)).toBe(525);
    expect(nextBid(IPL, 30, 2700)).toBe(2725);
  });
});

describe("maximum affordable bid", () => {
  it("holds back enough purse to fill the minimum squad", () => {
    // 18 minimum, 4 bought: after this player 13 more slots remain, at 30 lakh each.
    expect(maxBid(5000, 4, 18, 30)).toBe(5000 - 13 * 30);
  });
  it("frees the whole purse once the minimum squad is reached", () => {
    expect(maxBid(900, 18, 18, 30)).toBe(900);
    expect(maxBid(900, 17, 18, 30)).toBe(900);
  });
  it("never goes negative", () => {
    expect(maxBid(100, 0, 18, 30)).toBe(0);
  });
});

describe("money formatting", () => {
  it("shows lakhs below a crore and crores above", () => {
    expect(formatMoney(30)).toBe("₹30 L");
    expect(formatMoney(100)).toBe("₹1.00 Cr");
    expect(formatMoney(1425)).toBe("₹14.25 Cr");
    expect(formatMoney(12500, { compact: true })).toBe("₹125 Cr");
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(0)).toBe("₹0");
  });
  it("spells amounts for the auctioneer", () => {
    expect(speakMoney(200)).toBe("2 crore");
    expect(speakMoney(220)).toBe("2 crore 20 lakh");
    expect(speakMoney(75)).toBe("75 lakh");
  });
});

describe("csv import", () => {
  it("parses quoted fields, escaped quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });
  it("maps rows to lower-cased headers and skips blank lines", () => {
    expect(csvToObjects("Name,Team\nVirat Kohli,RCB\n\nMS Dhoni,CSK\n")).toEqual([
      { name: "Virat Kohli", team: "RCB" },
      { name: "MS Dhoni", team: "CSK" },
    ]);
  });
});

describe("landing page rotation", () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` }));
  const window = 10 * 60 * 1000;

  it("shows the same lineup within a 10-minute window and a different one in the next", () => {
    const t = 1_800_000_000_000;
    const now = pickForWindow(items, 6, t).map((p) => p.id);
    expect(pickForWindow(items, 6, t + 60_000).map((p) => p.id)).toEqual(now);
    expect(pickForWindow(items, 6, t + window).map((p) => p.id)).not.toEqual(now);
    expect(new Set(now).size).toBe(6);
  });
  it("returns everything when there are fewer items than requested", () => {
    expect(pickForWindow(items.slice(0, 3), 6)).toHaveLength(3);
  });
});
