"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { FranchiseId } from "@/types";

export type SeasonTeam = { franchise_id: FranchiseId; purse_lakh: number; slots: number; overseas_slots: number };

/** Each franchise's purse and open slots ahead of the season's auction (public data). */
export function useSeasonTeams(seasonId: string | undefined) {
  const [teams, setTeams] = useState<Map<FranchiseId, SeasonTeam>>(new Map());
  useEffect(() => {
    if (!seasonId) return;
    let active = true;
    supabaseBrowser()
      .from("season_franchises")
      .select("franchise_id, purse_lakh, slots, overseas_slots")
      .eq("season_id", seasonId)
      .then(({ data }) => {
        if (active && data) setTeams(new Map((data as SeasonTeam[]).map((t) => [t.franchise_id, t])));
      });
    return () => {
      active = false;
    };
  }, [seasonId]);
  return teams;
}
