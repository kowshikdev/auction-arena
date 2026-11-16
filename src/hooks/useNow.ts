"use client";

import { useEffect, useState } from "react";

/** A clock value that re-renders the component every `intervalMs`, for "seen recently" checks. */
export function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
