"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/shared/toast";
import { Button, Modal, Select } from "@/components/shared/ui";
import type { RoomSnapshot } from "@/types";

/**
 * Controls for whoever runs the room. A human auctioneer drives every step; with the
 * system auctioneer the host can still pause, resume, hand over or end the auction.
 * The server checks the caller's role on every action.
 */
export function Controls({ snapshot }: { snapshot: RoomSnapshot }) {
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { room, session, me, members } = snapshot;
  if (!session || (!me.is_host && !me.is_auctioneer)) return null;

  const roomId = room.id;
  const paused = session.status === "paused";
  const bidding = session.phase === "bidding";
  const hasBid = session.current_bidder !== null;

  async function run(key: string, path: string, body: Record<string, unknown> = {}) {
    setPending(key);
    const result = await api(path, { room_id: roomId, ...body });
    setPending(null);
    if (!result.ok) toast(result.error.message, "error");
    return result.ok;
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="eyebrow">{me.is_auctioneer ? "Auctioneer desk" : "Host controls"}</p>
        <p className="text-xs text-dim">
          {room.auctioneer_type === "system" ? "System auctioneer is running the auction" : "Human auctioneer"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {me.is_auctioneer && !paused && (
          <>
            <Button variant="gold" disabled={bidding} busy={pending === "next"} onClick={() => run("next", "/api/auctions/next")}>
              Present next player
            </Button>
            <Button variant="go" disabled={!bidding || !hasBid} busy={pending === "sold"} onClick={() => run("sold", "/api/auctions/sold")}>
              Sold
            </Button>
            <Button variant="outline" disabled={!bidding || hasBid} busy={pending === "unsold"} onClick={() => run("unsold", "/api/auctions/unsold")}>
              Unsold
            </Button>
            <Button
              variant="outline"
              disabled={!bidding}
              busy={pending === "count"}
              onClick={() =>
                run("count", "/api/auctions/action", session.bid_deadline ? { action: "stop_countdown" } : { action: "start_countdown" })
              }
            >
              {session.bid_deadline ? "Stop countdown" : "Start countdown"}
            </Button>
            <Button variant="ghost" disabled={!bidding || !hasBid} busy={pending === "undo"} onClick={() => run("undo", "/api/auctions/action", { action: "undo_bid" })}>
              Undo last bid
            </Button>
            <Button variant="ghost" disabled={!bidding || hasBid} busy={pending === "skip"} onClick={() => run("skip", "/api/auctions/action", { action: "skip" })}>
              Withdraw player
            </Button>
          </>
        )}

        {paused ? (
          <Button variant="go" busy={pending === "resume"} onClick={() => run("resume", "/api/auctions/resume")}>
            Resume auction
          </Button>
        ) : (
          <Button variant="outline" busy={pending === "pause"} onClick={() => run("pause", "/api/auctions/pause")}>
            Pause
          </Button>
        )}

        {me.is_host && (
          <Select
            aria-label="Change auctioneer"
            className="h-10 w-56"
            value={room.auctioneer_type === "system" ? "system" : room.auctioneer_id ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              void run("auctioneer", "/api/rooms/auctioneer", value === "system" ? { type: "system" } : { type: "human", user_id: value });
            }}
          >
            <option value="system">Auctioneer: System</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                Auctioneer: {member.display_name}
              </option>
            ))}
          </Select>
        )}
        <Button variant="danger" onClick={() => setConfirmEnd(true)}>End auction</Button>
      </div>

      <Modal open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End the auction now?">
        <p className="text-sm text-mute">
          Players not yet presented will not be auctioned. Squads and purses are saved as they stand. This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmEnd(false)}>Keep going</Button>
          <Button
            variant="danger"
            busy={pending === "end"}
            onClick={async () => {
              const ok = await run("end", "/api/auctions/action", { action: "end_auction" });
              if (ok) setConfirmEnd(false);
            }}
          >
            End auction
          </Button>
        </div>
      </Modal>
    </div>
  );
}
