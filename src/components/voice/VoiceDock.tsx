"use client";

import { useEffect, useRef, useState } from "react";
import type { VoiceHandle } from "@/hooks/useVoice";
import { Badge, Button, Toggle, cn } from "@/components/shared/ui";

function MicIcon({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

/** Voice controls: join/leave, mute, push-to-talk, listen volume, auctioneer priority. */
export function VoiceDock({ voice, compact }: { voice: VoiceHandle; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const live = voice.status === "on";
  const micLive = live && (voice.pushToTalk ? voice.talking : !voice.muted);

  if (voice.unavailable) {
    return (
      <div className="rounded-xl border border-dashed border-line px-3 py-2 text-xs text-dim">
        Voice chat is not configured on this server.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", compact && "text-sm")}>
      <div className="flex flex-wrap items-center gap-2">
        {voice.status === "off" ? (
          <Button variant="go" size="sm" onClick={voice.join}>
            <MicIcon /> Join voice
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant={micLive ? "go" : "danger"}
              onClick={voice.toggleMute}
              disabled={!live || voice.pushToTalk}
              aria-pressed={voice.muted}
              title={voice.pushToTalk ? "Hold Space to talk" : voice.muted ? "Unmute" : "Mute"}
            >
              <MicIcon off={!micLive} />
              {voice.pushToTalk ? (voice.talking ? "Talking" : "Hold Space") : voice.muted ? "Muted" : "Mic on"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              Options
            </Button>
            <Button size="sm" variant="outline" onClick={voice.leave}>
              Leave voice
            </Button>
          </>
        )}
        {voice.status === "connecting" && <Badge tone="warn">Connecting</Badge>}
        {voice.status === "reconnecting" && <Badge tone="warn">Reconnecting</Badge>}
        {live && <Badge tone="go">{voice.peers.length} in voice</Badge>}
      </div>

      {open && voice.status !== "off" && (
        <div className="space-y-3 rounded-xl border border-line bg-black/25 p-3">
          <Toggle checked={voice.pushToTalk} onChange={voice.setPushToTalk} label="Push to talk (hold Space)" />
          <Toggle checked={voice.priority} onChange={voice.setPriority} label="Lower others while the auctioneer speaks" />
          <label className="flex items-center gap-3 text-sm">
            <span className="shrink-0 text-chalk">Voice volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={voice.volume}
              onChange={(e) => voice.setVolume(Number(e.target.value))}
              className="w-full accent-[#f6c453]"
            />
          </label>
        </div>
      )}
      {voice.error && <p className="text-xs text-warn">{voice.error}</p>}
    </div>
  );
}

/** Local microphone check with a level meter. Nothing is sent anywhere. */
export function MicTest() {
  const [state, setState] = useState<"idle" | "testing" | "denied">("idle");
  const [level, setLevel] = useState(0);
  const cleanup = useRef<(() => void) | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let frame = 0;
      const read = () => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
        setLevel(Math.min(1, peak / 60));
        frame = requestAnimationFrame(read);
      };
      read();
      cleanup.current = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
      };
      setState("testing");
    } catch {
      setState("denied");
    }
  }

  function stop() {
    cleanup.current?.();
    cleanup.current = null;
    setLevel(0);
    setState("idle");
  }

  useEffect(() => () => cleanup.current?.(), []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={state === "testing" ? stop : start}>
          {state === "testing" ? "Stop test" : "Test microphone"}
        </Button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="Microphone level" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-go transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
        </div>
      </div>
      {state === "testing" && <p className="text-xs text-dim">Speak now. The bar should move.</p>}
      {state === "denied" && <p className="text-xs text-warn">Microphone access was blocked. Allow it in your browser&apos;s site settings.</p>}
    </div>
  );
}
