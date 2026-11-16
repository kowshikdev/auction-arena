"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { api } from "@/lib/api/client";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ApiError, RoomEvent, RoomSnapshot } from "@/types";

type Listener = (event: RoomEvent, snapshot: RoomSnapshot) => void;

// Events that change who is in the room or how it is configured. They are rare, so the
// simplest correct reaction is to fetch a fresh snapshot.
const RELOAD_EVENTS = new Set([
  "participant_joined", "participant_left", "participant_removed", "participant_ready",
  "franchise_selected", "room_updated", "room_closed", "host_changed", "auctioneer_changed",
  "auction_started", "auction_completed", "round_started", "bid_voided",
]);

/** Pure reducer for the high-frequency auction events. */
function applyEvent(snapshot: RoomSnapshot, event: RoomEvent): RoomSnapshot {
  const next: RoomSnapshot = { ...snapshot, seq: event.seq };
  if (event.state) {
    next.session = event.state;
    if (event.state.status === "paused" || event.state.status === "live") {
      next.room = { ...snapshot.room, status: event.state.status };
    }
  }
  if (event.lot) {
    const lot = event.lot;
    next.lots = snapshot.lots.map((existing) => (existing.id === lot.id ? lot : existing));
  }
  if (event.team) {
    const team = event.team;
    next.teams = snapshot.teams.map((existing) => (existing.franchise_id === team.franchise_id ? team : existing));
  }
  switch (event.type) {
    case "player_presented":
      next.bids = [];
      break;
    case "bid_accepted":
      if (event.bid) next.bids = [...snapshot.bids, event.bid];
      break;
    case "player_sold":
      if (event.lot?.sold_to && event.lot.sold_price_lakh !== null) {
        next.squads = [
          ...snapshot.squads.filter((entry) => entry.player_id !== event.lot!.player_id),
          {
            player_id: event.lot.player_id,
            franchise_id: event.lot.sold_to,
            price_lakh: event.lot.sold_price_lakh,
            is_retained: false,
            acquired_at: event.ts,
          },
        ];
      }
      break;
    case "chat_message":
      next.chat = [
        ...snapshot.chat.slice(-99),
        {
          seq: event.seq,
          ts: event.ts,
          user_id: event.user_id ?? "",
          display_name: event.display_name ?? "",
          franchise_id: event.franchise_id ?? null,
          body: event.body ?? "",
        },
      ];
      break;
  }
  return next;
}

/**
 * Live view of one room. The database is the source of truth: this hook loads a snapshot,
 * applies broadcast events in sequence order, and reloads the snapshot whenever it sees a
 * gap, reconnects, or the tab wakes up. Nothing here decides auction outcomes.
 */
export function useRoom(code: string) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<Set<string>>(new Set());

  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const offsetRef = useRef(0); // server clock minus local clock, in ms
  const listeners = useRef(new Set<Listener>());
  const loadingRef = useRef(false);
  const reloadQueued = useRef(false);

  const commit = useCallback((next: RoomSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const reload = useCallback(async () => {
    if (loadingRef.current) {
      reloadQueued.current = true;
      return;
    }
    loadingRef.current = true;
    // If another reload is requested while one is in flight, run exactly one more afterwards.
    do {
      reloadQueued.current = false;
      const sent = Date.now();
      const result = await api<RoomSnapshot>(`/api/auctions/state?code=${encodeURIComponent(code)}`);
      const received = Date.now();

      if (result.ok) {
        // Assume the server stamped its time halfway through the round trip.
        offsetRef.current = new Date(result.server_now).getTime() - (sent + received) / 2;
        // Never step backwards if events were applied while the request was in flight.
        if (!snapshotRef.current || result.seq >= snapshotRef.current.seq) commit(result);
        setError(null);
      } else if (result.error.code !== "NETWORK") {
        setError(result.error);
      }
      setLoading(false);
    } while (reloadQueued.current);
    loadingRef.current = false;
  }, [code, commit]);

  const handleEvent = useCallback(
    (event: RoomEvent) => {
      const current = snapshotRef.current;
      if (!current || typeof event.seq !== "number") return;
      if (event.seq <= current.seq) return; // already reflected in the snapshot
      if (event.seq > current.seq + 1) {
        void reload(); // missed something: resynchronise instead of guessing
        return;
      }
      const next = applyEvent(current, event);
      commit(next);
      for (const listener of listeners.current) listener(event, next);
      if (RELOAD_EVENTS.has(event.type)) void reload();
    },
    [commit, reload],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const roomId = snapshot?.room.id;
  const userId = snapshot?.me.user_id;

  useEffect(() => {
    if (!roomId || !userId) return;
    const supabase = supabaseBrowser();
    let channel: RealtimeChannel | undefined;
    let cancelled = false;
    let wasSubscribed = false;

    (async () => {
      await supabase.realtime.setAuth(); // private channel: join is authorised by RLS
      if (cancelled) return;
      channel = supabase
        .channel(`room:${roomId}`, { config: { private: true, presence: { key: userId } } })
        .on("broadcast", { event: "*" }, (message) => handleEvent(message.payload as RoomEvent))
        .on("presence", { event: "sync" }, () => {
          if (channel) setOnline(new Set(Object.keys(channel.presenceState())));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnected(true);
            void channel?.track({ at: Date.now() });
            if (wasSubscribed) void reload(); // reconnected: catch up
            wasSubscribed = true;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnected(false);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [roomId, userId, handleEvent, reload]);

  // Safety net: periodic resync (also the server-side heartbeat), plus wake-up triggers.
  useEffect(() => {
    if (!roomId) return;
    const timer = setInterval(() => void reload(), 20_000);
    const wake = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [roomId, reload]);

  // Ask the server to check its clock when the deadline we were told about has passed.
  const session = snapshot?.session;
  const target = session?.status === "live"
    ? session.phase === "bidding" ? session.bid_deadline : session.next_at
    : null;
  useEffect(() => {
    if (!roomId || !target) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const schedule = (delay: number) => {
      timer = setTimeout(async () => {
        const result = await api<{ acted: boolean }>("/api/auctions/tick", { room_id: roomId });
        if (stopped) return;
        // Not closed yet (our clock ran slightly ahead, or the request failed): ask again shortly.
        const unchanged = snapshotRef.current?.session?.bid_deadline === target || snapshotRef.current?.session?.next_at === target;
        if ((!result.ok || !result.acted) && unchanged) schedule(700);
      }, delay);
    };
    const remaining = new Date(target).getTime() - (Date.now() + offsetRef.current);
    // Random spread so ten browsers do not all hit the server in the same millisecond.
    schedule(Math.max(0, remaining) + 60 + Math.random() * 340);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [roomId, target]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  /** Current server time in ms, for countdowns. */
  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { snapshot, error, loading, connected, online, reload, subscribe, serverNow };
}

export type RoomHandle = ReturnType<typeof useRoom>;
