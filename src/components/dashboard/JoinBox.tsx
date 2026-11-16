"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/shared/ui";

/** Room-code entry. The join page does the actual joining (and asks for a password if needed). */
export function JoinBox({ size = "md" }: { size?: "md" | "lg" }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (clean.length >= 4) router.push(`/join/${clean}`);
      }}
    >
      <Input
        value={clean}
        onChange={(e) => setCode(e.target.value)}
        placeholder="ROOM CODE"
        aria-label="Room code"
        className={`tabular text-center font-mono font-bold uppercase tracking-[0.3em] ${size === "lg" ? "h-12 text-base" : ""}`}
      />
      <Button type="submit" variant="outline" size={size} disabled={clean.length < 4} className="shrink-0">
        Join
      </Button>
    </form>
  );
}
