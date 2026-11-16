"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { franchise } from "@/lib/franchises";
import type { ChatMessage } from "@/types";
import { useToast } from "./toast";
import { Button, Input } from "./ui";

export function ChatPanel({ roomId, messages, meId, className }: { roomId: string; messages: ChatMessage[]; meId: string; className?: string }) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setBody("");
    const result = await api("/api/chat", { room_id: roomId, body: text });
    setSending(false);
    if (!result.ok) {
      setBody(text);
      toast(result.error.message, "error");
    }
  }

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
        {messages.length === 0 && <p className="py-6 text-center text-xs text-dim">No messages yet. Say hello.</p>}
        {messages.map((message) => {
          const team = franchise(message.franchise_id);
          return (
            <p key={message.seq} className="leading-snug">
              <span className="font-bold" style={{ color: team?.color ?? "#93a0bd" }}>
                {message.user_id === meId ? "You" : message.display_name}
                {team && <span className="ml-1 text-[10px] font-semibold opacity-80">{team.id}</span>}
              </span>{" "}
              <span className="break-words text-chalk/90">{message.body}</span>
            </p>
          );
        })}
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <Input value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} placeholder="Message the room" aria-label="Chat message" className="h-10" />
        <Button type="submit" size="md" variant="ghost" disabled={!body.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
