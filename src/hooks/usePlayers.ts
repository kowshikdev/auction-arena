"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Player } from "@/types";

type Season = { id: string; name: string; year: number; default_rules: Record<string, unknown> };
type Catalogue = { players: Player[]; byId: Map<string, Player>; season: Season | null };

let cache: Promise<Catalogue> | null = null;

async function load(): Promise<Catalogue> {
  const result = await api<{ players: Player[]; season: Season }>("/api/players?all=true");
  if (!result.ok) {
    cache = null; // let the next mount retry
    return { players: [], byId: new Map(), season: null };
  }
  return {
    players: result.players,
    byId: new Map(result.players.map((player) => [player.id, player])),
    season: result.season,
  };
}

export function invalidatePlayers() {
  cache = null;
}

/** The season catalogue, fetched once per page load and shared by every component. */
export function usePlayers() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    cache ??= load();
    cache.then((value) => active && setCatalogue(value));
    return () => {
      active = false;
    };
  }, [version]);

  return {
    players: catalogue?.players ?? [],
    byId: catalogue?.byId ?? new Map<string, Player>(),
    season: catalogue?.season ?? null,
    loading: catalogue === null,
    refresh: () => {
      invalidatePlayers();
      setVersion((v) => v + 1);
    },
  };
}
