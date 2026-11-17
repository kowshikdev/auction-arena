import { beforeAll, describe, expect, it } from "vitest";
import { cleanup, FRANCHISES, key, rpc, rpcCode, seatedRoom, sleep, testUser, type TestUser } from "./helpers";

// These cover the release blockers in req.md section 24.
let users: TestUser[];

beforeAll(async () => {
  users = [];
  for (let n = 1; n <= 5; n++) users.push(await testUser(n));
});

describe("lobby", () => {
  it("lets four friends join a private room and blocks a duplicate franchise", async () => {
    const [a, b, c, d, e] = users;
    const created = await rpc(a, "create_room", { p_name: "Friends", p_visibility: "private" });
    const roomId = created.room_id as string;
    for (const user of [b, c, d, e]) await rpc(user, "join_room", { p_code: created.code });

    for (const [i, user] of [a, b, c, d].entries()) {
      await rpc(user, "select_franchise", { p_room_id: roomId, p_franchise_id: FRANCHISES[i] });
    }
    // A fifth person cannot take an occupied franchise.
    expect(await rpcCode(e, "select_franchise", { p_room_id: roomId, p_franchise_id: "CSK" })).toBe("FRANCHISE_TAKEN");

    const state = await rpc(a, "get_room_state", { p_code: created.code });
    const taken = state.members.map((m: any) => m.franchise_id).filter(Boolean);
    expect(new Set(taken).size).toBe(4);

    for (const user of [e, d, c, b, a]) await rpc(user, "leave_room", { p_room_id: roomId });
  });

  it("gives the same franchise to exactly one of several simultaneous pickers", async () => {
    const [a, b, c, d] = users;
    const created = await rpc(a, "create_room", { p_name: "Race", p_visibility: "private" });
    const roomId = created.room_id as string;
    for (const user of [b, c, d]) await rpc(user, "join_room", { p_code: created.code });

    const results = await Promise.all(
      [a, b, c, d].map((user) => rpcCode(user, "select_franchise", { p_room_id: roomId, p_franchise_id: "MI" })),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "FRANCHISE_TAKEN")).toHaveLength(3);

    for (const user of [d, c, b, a]) await rpc(user, "leave_room", { p_room_id: roomId });
  });

  it("refuses to start with fewer than four owners or with someone not ready", async () => {
    const [a, b, c, d, e] = users;
    const created = await rpc(a, "create_room", { p_name: "Start rules", p_visibility: "private" });
    const roomId = created.room_id as string;
    for (const user of [b, c]) await rpc(user, "join_room", { p_code: created.code });
    for (const [i, user] of [a, b, c].entries()) {
      await rpc(user, "select_franchise", { p_room_id: roomId, p_franchise_id: FRANCHISES[i] });
      await rpc(user, "set_ready", { p_room_id: roomId, p_ready: true });
    }
    expect(await rpcCode(a, "start_auction", { p_room_id: roomId })).toBe("NOT_ENOUGH_PLAYERS");

    // A fourth person in the room who has not picked a franchise does not count as an owner.
    await rpc(d, "join_room", { p_code: created.code });
    expect(await rpcCode(a, "start_auction", { p_room_id: roomId })).toBe("NOT_ENOUGH_PLAYERS");
    await rpc(d, "select_franchise", { p_room_id: roomId, p_franchise_id: "KKR" });
    expect(await rpcCode(a, "start_auction", { p_room_id: roomId })).toBe("NOT_READY");
    await rpc(d, "set_ready", { p_room_id: roomId, p_ready: true });
    // Four ready owners, but a fifth member is still without a franchise.
    await rpc(e, "join_room", { p_code: created.code });
    expect(await rpcCode(a, "start_auction", { p_room_id: roomId })).toBe("MEMBER_WITHOUT_FRANCHISE");
    // Only the host may start.
    expect(await rpcCode(b, "start_auction", { p_room_id: roomId })).toBe("NOT_HOST");

    for (const user of [e, d, c, b, a]) await rpc(user, "leave_room", { p_room_id: roomId });
  });
});

describe("bidding (human auctioneer drives the flow)", () => {
  it("accepts exactly one of several simultaneous bids and keeps every client consistent", async () => {
    const owners = users.slice(0, 4);
    const [a, b, c, d] = owners;
    const { roomId, code } = await seatedRoom(owners);
    await rpc(a, "start_auction", { p_room_id: roomId });
    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "present_next" });

    let state = await rpc(a, "get_room_state", { p_code: code });
    const lotId = state.session.current_lot_id as string;
    const opening = state.session.next_bid_lakh as number;
    expect(lotId).toBeTruthy();

    // Opening bid from one owner, then three owners race for the next step.
    await rpc(a, "place_bid", { p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: opening, p_idempotency_key: key() });
    state = await rpc(b, "get_room_state", { p_code: code });
    const next = state.session.next_bid_lakh as number;
    expect(next).toBeGreaterThan(opening);

    const race = await Promise.all(
      [b, c, d].map((user) =>
        rpcCode(user, "place_bid", { p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: next, p_idempotency_key: key() }),
      ),
    );
    expect(race.filter((r) => r === "OK")).toHaveLength(1);
    expect(race.filter((r) => r === "STALE_BID")).toHaveLength(2);

    // Every participant sees the same accepted bid and bidder.
    const views = await Promise.all(owners.map((user) => rpc(user, "get_room_state", { p_code: code })));
    const bidders = new Set(views.map((v) => v.session.current_bidder));
    const amounts = new Set(views.map((v) => v.session.current_bid_lakh));
    expect(bidders.size).toBe(1);
    expect([...amounts]).toEqual([next]);

    // Sold: purse and squad move for the winner only, and only once.
    const winner = [...bidders][0] as string;
    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "sold" });
    state = await rpc(a, "get_room_state", { p_code: code });
    const team = state.teams.find((t: any) => t.franchise_id === winner);
    const retainedCount = state.squads.filter((s: any) => s.franchise_id === winner && s.is_retained).length;
    expect(team.purse_remaining_lakh).toBe(team.purse_initial_lakh - next);
    expect(team.squad_count).toBe(retainedCount + 1);
    expect(state.squads.filter((s: any) => !s.is_retained)).toHaveLength(1);
    expect(state.lots.find((l: any) => l.id === lotId)).toMatchObject({ status: "sold", sold_to: winner, sold_price_lakh: next });
    // The closed lot cannot be bid on again.
    expect(await rpcCode(b, "place_bid", { p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: next + 20, p_idempotency_key: key() })).toBe("BIDDING_CLOSED");

    await cleanup(a, roomId);
  });

  it("ignores a duplicate request and rejects the current leader bidding against themselves", async () => {
    const owners = users.slice(0, 4);
    const [a, b] = owners;
    const { roomId, code } = await seatedRoom(owners);
    await rpc(a, "start_auction", { p_room_id: roomId });
    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "present_next" });
    const state = await rpc(a, "get_room_state", { p_code: code });
    const lotId = state.session.current_lot_id;
    const amount = state.session.next_bid_lakh;

    const idem = key();
    const first = await rpc(b, "place_bid", { p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: amount, p_idempotency_key: idem });
    const second = await rpc(b, "place_bid", { p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: amount, p_idempotency_key: idem });
    expect(first.duplicate).toBeUndefined();
    expect(second.duplicate).toBe(true);
    expect(second.state.bid_count).toBe(1);

    expect(
      await rpcCode(b, "place_bid", { p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: second.state.next_bid_lakh, p_idempotency_key: key() }),
    ).toBe("ALREADY_HIGHEST");
    // A stale lot id (old auction state) is refused.
    expect(
      await rpcCode(a, "place_bid", { p_room_id: roomId, p_lot_id: crypto.randomUUID(), p_amount_lakh: amount, p_idempotency_key: key() }),
    ).toBe("STALE_LOT");

    await cleanup(a, roomId);
  });

  it("never lets a franchise spend more than its purse", async () => {
    const owners = users.slice(0, 4);
    const [a, , c, d] = owners;
    // RCB (₹14.15 Cr, 20 retained) has no minimum-squad reserve, so its purse is what stops it.
    const { roomId, code } = await seatedRoom(owners);
    await rpc(a, "start_auction", { p_room_id: roomId });
    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "present_next" });

    let state = await rpc(a, "get_room_state", { p_code: code });
    const lotId = state.session.current_lot_id;
    let lastCode = "OK";
    let turn = 0;
    let amount = state.session.next_bid_lakh as number;
    // Two owners trade bids until one runs out of money. Each accepted bid returns the next amount.
    while (lastCode === "OK" && turn < 200) {
      const bidder = turn % 2 === 0 ? c : d;
      const { data, error } = await bidder.client.rpc("place_bid", {
        p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: amount, p_idempotency_key: key(),
      });
      lastCode = error ? error.message : "OK";
      if (data) amount = data.state.next_bid_lakh;
      turn++;
    }
    expect(lastCode).toBe("INSUFFICIENT_PURSE");
    state = await rpc(a, "get_room_state", { p_code: code });
    expect(state.session.current_bid_lakh).toBeLessThanOrEqual(1415);

    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "sold" });
    state = await rpc(a, "get_room_state", { p_code: code });
    for (const team of state.teams) expect(team.purse_remaining_lakh).toBeGreaterThanOrEqual(0);

    await cleanup(a, roomId);
  });

  it("pauses and resumes, and blocks bids while paused", async () => {
    const owners = users.slice(0, 4);
    const [a, b] = owners;
    const { roomId, code } = await seatedRoom(owners);
    await rpc(a, "start_auction", { p_room_id: roomId });
    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "present_next" });
    let state = await rpc(a, "get_room_state", { p_code: code });
    const bid = { p_room_id: roomId, p_lot_id: state.session.current_lot_id, p_amount_lakh: state.session.next_bid_lakh };

    // Only host or auctioneer may pause.
    expect(await rpcCode(b, "auctioneer_action", { p_room_id: roomId, p_action: "pause" })).toBe("NOT_ALLOWED");
    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "pause" });
    expect(await rpcCode(b, "place_bid", { ...bid, p_idempotency_key: key() })).toBe("PAUSED");

    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "resume" });
    state = await rpc(a, "get_room_state", { p_code: code });
    expect(state.session.status).toBe("live");
    expect(await rpcCode(b, "place_bid", { ...bid, p_idempotency_key: key() })).toBe("OK");

    await cleanup(a, roomId);
  });

  it("keeps a reconnecting participant in their franchise and returns the live state", async () => {
    const owners = users.slice(0, 4);
    const [a, b] = owners;
    const { roomId, code } = await seatedRoom(owners);
    await rpc(a, "start_auction", { p_room_id: roomId });
    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "present_next" });

    // A brand new client for the same account, as after a browser refresh.
    const again = await testUser(2);
    expect(again.id).toBe(b.id);
    const rejoin = await rpc(again, "join_room", { p_code: code });
    expect(rejoin.rejoined).toBe(true);
    const state = await rpc(again, "get_room_state", { p_code: code });
    expect(state.me.franchise_id).toBe("MI");
    expect(state.session.phase).toBe("bidding");
    // A stranger cannot enter once the auction has started.
    expect(await rpcCode(users[4], "join_room", { p_code: code })).toBe("AUCTION_STARTED");

    await cleanup(a, roomId);
  });

  it("produces correct squads and spending when the auction completes", async () => {
    const owners = users.slice(0, 4);
    const [a] = owners;
    const { roomId, code } = await seatedRoom(owners, { settings: { pool_limit: 20, unsold_reround: false } });
    await rpc(a, "start_auction", { p_room_id: roomId });

    // Sell the first four lots at base price, one to each owner, then end.
    for (let i = 0; i < 4; i++) {
      await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "present_next" });
      const state = await rpc(a, "get_room_state", { p_code: code });
      await rpc(owners[i], "place_bid", {
        p_room_id: roomId, p_lot_id: state.session.current_lot_id,
        p_amount_lakh: state.session.next_bid_lakh, p_idempotency_key: key(),
      });
      await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "sold" });
    }
    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "end_auction" });

    const state = await rpc(a, "get_room_state", { p_code: code });
    expect(state.room.status).toBe("completed");
    const auctioned = state.squads.filter((s: any) => !s.is_retained);
    expect(auctioned).toHaveLength(4);
    for (const team of state.teams) {
      const bought = auctioned.filter((s: any) => s.franchise_id === team.franchise_id);
      const retained = state.squads.filter((s: any) => s.franchise_id === team.franchise_id && s.is_retained);
      const spent = bought.reduce((sum: number, s: any) => sum + s.price_lakh, 0);
      expect(bought).toHaveLength(1);
      expect(team.squad_count).toBe(retained.length + 1);
      expect(team.purse_initial_lakh - team.purse_remaining_lakh).toBe(spent);
    }
    // No player was sold twice.
    expect(new Set(auctioned.map((s: any) => s.player_id)).size).toBe(4);
  });
});

describe("passing", () => {
  it("lets a franchise that passed come back and bid on the same player", async () => {
    const owners = users.slice(0, 4);
    const [a, b, c] = owners;
    const { roomId, code } = await seatedRoom(owners);
    await rpc(a, "start_auction", { p_room_id: roomId });
    await rpc(a, "auctioneer_action", { p_room_id: roomId, p_action: "present_next" });
    const state = await rpc(a, "get_room_state", { p_code: code });
    const lotId = state.session.current_lot_id;

    await rpc(b, "place_bid", { p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: state.session.next_bid_lakh, p_idempotency_key: key() });
    const passed = await rpc(c, "pass_lot", { p_room_id: roomId, p_lot_id: lotId });
    expect(passed.state.passes).toContain("RCB");

    // Changed their mind: the bid is accepted and the pass is cleared.
    const back = await rpc(c, "place_bid", {
      p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: passed.state.next_bid_lakh, p_idempotency_key: key(),
    });
    expect(back.state.current_bidder).toBe("RCB");
    expect(back.state.passes).not.toContain("RCB");

    await cleanup(a, roomId);
  });
});

describe("season retentions", () => {
  it("starts franchises with their retained squad, season purse and remaining slots", async () => {
    const owners = users.slice(0, 4); // CSK, MI, RCB, KKR
    const [a] = owners;
    const { roomId, code } = await seatedRoom(owners, { settings: { pool_limit: null } });
    // No setting can put retained players back into the pool.
    for (const settings of [{ retention_mode: "none" }, { inactive_retained_in_pool: true }]) {
      expect(await rpcCode(a, "update_room", { p_room_id: roomId, p_patch: { settings } })).toBe("INVALID_SETTINGS");
    }
    await rpc(a, "start_auction", { p_room_id: roomId });
    const state = await rpc(a, "get_room_state", { p_code: code });

    const { data: season } = await a.client.from("season_franchises").select("franchise_id, purse_lakh, slots, overseas_slots");
    for (const team of state.teams) {
      const expected = season!.find((s: any) => s.franchise_id === team.franchise_id)!;
      expect(team.purse_initial_lakh).toBe(expected.purse_lakh);
      expect(team.purse_remaining_lakh).toBe(expected.purse_lakh);
      expect(25 - team.squad_count).toBe(expected.slots);
      expect(8 - team.overseas_count).toBe(expected.overseas_slots);
    }
    // No retained player is on the auction list, including those of the six unpicked franchises.
    const { data: retainedRows } = await a.client.from("player_seasons").select("player_id").eq("season_id", "ipl-2027").eq("is_retained", true);
    const retained = new Set(retainedRows!.map((r: any) => r.player_id));
    expect(retained.size).toBe(184);
    expect(state.squads.every((s: any) => s.is_retained)).toBe(true);
    expect(state.lots.some((l: any) => retained.has(l.player_id))).toBe(false);

    // Excluded players never appear.
    const { data: excluded } = await a.client.from("players").select("id").in("full_name", ["MS Dhoni", "Travis Head", "Mitchell Starc"]);
    const lotPlayers = new Set(state.lots.map((l: any) => l.player_id));
    expect(excluded!.length).toBe(3);
    expect(excluded!.some((p: any) => lotPlayers.has(p.id))).toBe(false);

    await cleanup(a, roomId);
  });
});

describe("system auctioneer clock", () => {
  it("sells on the server deadline, not on any client's say-so", async () => {
    const owners = users.slice(0, 4);
    const [a, b] = owners;
    const { roomId, code } = await seatedRoom(owners, { auctioneer: "system", settings: { bid_timer_sec: 5 } });
    await rpc(a, "start_auction", { p_room_id: roomId });

    // Asking early does nothing: the intro delay has not elapsed on the server.
    const early = await rpc(a, "tick", { p_room_id: roomId });
    expect(early.acted).toBe(false);
    expect(early.state.phase).toBe("intro");

    // Wait for the first player (client tick or the pg_cron backstop presents it).
    let state: any;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      state = (await rpc(a, "tick", { p_room_id: roomId })).state;
      if (state.phase === "bidding") break;
    }
    expect(state.phase).toBe("bidding");
    const lotId = state.current_lot_id;

    const accepted = await rpc(b, "place_bid", {
      p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: state.next_bid_lakh, p_idempotency_key: key(),
    });
    const deadline = new Date(accepted.state.bid_deadline).getTime();
    const serverNow = new Date(accepted.state.server_now).getTime();
    expect(deadline - serverNow).toBeGreaterThan(4000);

    // Before the deadline a tick must not close the lot.
    expect((await rpc(a, "tick", { p_room_id: roomId })).state.phase).toBe("bidding");

    await sleep(6000);
    // After the deadline a late bid is refused even if nobody has closed the lot yet.
    const late = await rpcCode(a, "place_bid", {
      p_room_id: roomId, p_lot_id: lotId, p_amount_lakh: accepted.state.next_bid_lakh, p_idempotency_key: key(),
    });
    expect(["BIDDING_CLOSED", "STALE_LOT"]).toContain(late);

    await rpc(a, "tick", { p_room_id: roomId });
    const final = await rpc(a, "get_room_state", { p_code: code });
    expect(final.lots.find((l: any) => l.id === lotId)).toMatchObject({ status: "sold", sold_to: "MI" });

    await cleanup(a, roomId);
  });
});
