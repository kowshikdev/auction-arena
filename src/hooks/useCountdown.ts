"use client";

import { useEffect, useState } from "react";

/**
 * Milliseconds left until `target` (an ISO timestamp from the server), measured against
 * the server clock. Display only: the server alone decides when a lot closes.
 */
export function useCountdown(target: string | null | undefined, serverNow: () => number): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!target) {
      setRemaining(null);
      return;
    }
    const end = new Date(target).getTime();
    const update = () => setRemaining(Math.max(0, end - serverNow()));
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [target, serverNow]);

  return remaining;
}
