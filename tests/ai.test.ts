import { beforeAll, describe, expect, it } from "vitest";
import { cleanup, rpc, rpcCode, sleep, testUser, type TestUser } from "./helpers";

let users: TestUser[];

beforeAll(async () => {
  users = [await testUser(6), await testUser(7)];
});

async function state(user: TestUser, code: string) {
  return rpc(user, "get_room_state", { p_code: code });
}

describe("AI owners", () => {
  it("starts a solo room at once with a human and AI franchises", async () => {
    const [me] = users;
    const solo = await rpc(me, "create_solo_room", { p_franchise: "MI", p_ai_count: 5, p_difficulty: "hard", p_timer_sec: 5, p_pool_limit: 20 });
    const s = await state(me, solo.code);
    expect(s.room.status).toBe("live");
    expect(s.teams).toHaveLength(6);
    const bots = s.members.filter((m: any) => m.is_bot);
    expect(bots).toHaveLength(5);
    expect(s.members.find((m: any) => m.user_id === me.id).franchise_id).toBe("MI");
    expect(s.settings.ai_difficulty).toBe("hard");
    await cleanup(me, solo.room_id);
  });

  it("rejects invalid solo options", async () => {
    const [me] = users;
    expect(await rpcCode(me, "create_solo_room", { p_ai_count: 1 })).toBe("INVALID_SETTINGS");
    expect(await rpcCode(me, "create_solo_room", { p_difficulty: "godlike" })).toBe("INVALID_SETTINGS");
  });

  it("lets AI bid within purse and squad rules while a human passes", async () => {
    const [me] = users;
    const solo = await rpc(me, "create_solo_room", { p_franchise: "CSK", p_ai_count: 9, p_difficulty: "normal", p_timer_sec: 5, p_pool_limit: 20 });
    const deadline = Date.now() + 100_000;
    let sold = 0;
    let botBids = 0;
    while (Date.now() < deadline) {
      await rpc(me, "tick", { p_room_id: solo.room_id });
      const s = await state(me, solo.code);
      const session = s.session;
      if (session.phase === "bidding" && session.current_lot_id) {
        await rpcCode(me, "pass_lot", { p_room_id: solo.room_id, p_lot_id: session.current_lot_id });
      }
      sold = s.lots.filter((l: any) => l.status === "sold").length;
      botBids = s.teams.reduce((sum: number, t: any) => sum + t.bids_placed, 0);
      if (sold >= 1 || session.phase === "done") break;
      await sleep(600);
    }
    const s = await state(me, solo.code);
    expect(botBids).toBeGreaterThan(0);
    expect(sold).toBeGreaterThan(0);
    for (const t of s.teams) {
      expect(t.purse_remaining_lakh).toBeGreaterThanOrEqual(0);
      expect(t.squad_count).toBeLessThanOrEqual(s.settings.squad_max);
      expect(t.overseas_count).toBeLessThanOrEqual(s.settings.overseas_max);
    }
    // Nobody can double-hold a player.
    const players = s.squads.map((q: any) => q.player_id);
    expect(new Set(players).size).toBe(players.length);
    await cleanup(me, solo.room_id);
  }, 130_000);

  it("fills empty seats for the host only and blocks outsiders", async () => {
    const [host, other] = users;
    const created = await rpc(host, "create_room", { p_name: "Fill test", p_visibility: "private" });
    await rpc(other, "join_room", { p_code: created.code });
    expect(await rpcCode(other, "fill_with_ai", { p_room_id: created.room_id })).toBe("NOT_HOST");
    expect(await rpcCode(other, "add_ai_owner", { p_room_id: created.room_id })).toBe("NOT_HOST");
    const one = await rpc(host, "add_ai_owner", { p_room_id: created.room_id, p_franchise: "RCB", p_persona: "star" });
    expect(one.franchise_id).toBe("RCB");
    expect(await rpcCode(host, "add_ai_owner", { p_room_id: created.room_id, p_franchise: "RCB" })).toBe("FRANCHISE_TAKEN");
    await rpc(host, "fill_with_ai", { p_room_id: created.room_id });
    const s = await state(host, created.code);
    expect(s.members).toHaveLength(10);
    // Humans still need a franchise before the host can start.
    expect(await rpcCode(host, "start_auction", { p_room_id: created.room_id })).toBe("MEMBER_WITHOUT_FRANCHISE");
    await rpc(other, "leave_room", { p_room_id: created.room_id });
    await rpc(host, "leave_room", { p_room_id: created.room_id });
  });

  it("auto-fills a lobby after its timer and starts the auction", async () => {
    const [host] = users;
    const created = await rpc(host, "create_room", { p_name: "Autofill", p_visibility: "private", p_settings: { pool_limit: 20 } });
    await rpc(host, "set_ai_options", { p_room_id: created.room_id, p_autofill_sec: 15 });
    const deadline = Date.now() + 45_000;
    let live = false;
    while (Date.now() < deadline) {
      await sleep(3000);
      const s = await state(host, created.code);
      if (s.room.status === "live") { live = true; break; }
    }
    expect(live).toBe(true);
    const s = await state(host, created.code);
    expect(s.teams.length).toBe(10);
    await cleanup(host, created.room_id);
  }, 60_000);
});
