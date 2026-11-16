"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type Participant, type RemoteParticipant, type RemoteTrack } from "livekit-client";
import { api } from "@/lib/api/client";

export type VoiceStatus = "off" | "connecting" | "on" | "reconnecting";

type VoicePeer = { userId: string; name: string; micOn: boolean; isAuctioneer: boolean };

function isAuctioneer(participant: Participant): boolean {
  try {
    return Boolean(JSON.parse(participant.metadata || "{}").is_auctioneer);
  } catch {
    return false;
  }
}

/**
 * Voice chat for one auction room, carried by LiveKit (WebRTC). It is completely separate
 * from bidding: if voice drops, the auction carries on, and the other way round.
 */
export function useVoice(code: string) {
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [talking, setTalking] = useState(false); // push-to-talk key held
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [volume, setVolumeState] = useState(1);
  const [priority, setPriority] = useState(true); // duck everyone else while the auctioneer talks

  const volumeRef = useRef(1);
  const priorityRef = useRef(true);
  useEffect(() => {
    priorityRef.current = priority;
  }, [priority]);

  const syncPeers = useCallback(() => {
    const room = roomRef.current;
    if (!room) return setPeers([]);
    const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
    setPeers(
      all.map((p) => ({
        userId: p.identity,
        name: p.name || "Participant",
        micOn: p.isMicrophoneEnabled,
        isAuctioneer: isAuctioneer(p),
      })),
    );
  }, []);

  const applyVolumes = useCallback((activeSpeakers: Participant[] = []) => {
    const room = roomRef.current;
    if (!room) return;
    const auctioneerTalking = priorityRef.current && activeSpeakers.some((p) => isAuctioneer(p));
    for (const participant of room.remoteParticipants.values() as IterableIterator<RemoteParticipant>) {
      const ducked = auctioneerTalking && !isAuctioneer(participant);
      participant.setVolume(volumeRef.current * (ducked ? 0.25 : 1));
    }
  }, []);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) await room.disconnect();
    document.querySelectorAll("audio[data-voice]").forEach((el) => el.remove());
    setStatus("off");
    setSpeaking(new Set());
    setPeers([]);
  }, []);

  const join = useCallback(async () => {
    if (roomRef.current) return;
    setError(null);
    setStatus("connecting");

    const grant = await api<{ url: string; token: string }>("/api/livekit/token", { code });
    if (!grant.ok) {
      setStatus("off");
      if (grant.error.code === "VOICE_DISABLED") setUnavailable(true);
      setError(grant.error.message);
      return;
    }

    const room = new Room({
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    roomRef.current = room;

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.dataset.voice = "1";
        document.body.appendChild(element);
        applyVolumes();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        setSpeaking(new Set(speakers.map((p) => p.identity)));
        applyVolumes(speakers);
      })
      .on(RoomEvent.ParticipantConnected, syncPeers)
      .on(RoomEvent.ParticipantDisconnected, syncPeers)
      .on(RoomEvent.TrackMuted, syncPeers)
      .on(RoomEvent.TrackUnmuted, syncPeers)
      .on(RoomEvent.TrackPublished, syncPeers)
      .on(RoomEvent.LocalTrackPublished, syncPeers)
      .on(RoomEvent.Reconnecting, () => setStatus("reconnecting"))
      .on(RoomEvent.Reconnected, () => {
        setStatus("on");
        syncPeers();
      })
      .on(RoomEvent.Disconnected, () => {
        // LiveKit retries by itself; this fires only when it has given up or we left.
        if (roomRef.current === room) {
          roomRef.current = null;
          setStatus("off");
          setPeers([]);
          setError("Voice disconnected. Rejoin when your connection is back.");
        }
      });

    try {
      await room.connect(grant.url, grant.token);
      setStatus("on");
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMuted(false);
      } catch {
        // Listening still works without a microphone.
        setMuted(true);
        setError("Microphone blocked. You can listen; allow mic access in the browser to speak.");
      }
      syncPeers();
    } catch {
      roomRef.current = null;
      setStatus("off");
      setError("Could not connect to voice chat.");
    }
  }, [code, applyVolumes, syncPeers]);

  const setMic = useCallback(
    async (enabled: boolean) => {
      const room = roomRef.current;
      if (!room) return;
      try {
        await room.localParticipant.setMicrophoneEnabled(enabled);
        setError(null);
      } catch {
        setError("Microphone blocked. Allow mic access in the browser to speak.");
      }
      syncPeers();
    },
    [syncPeers],
  );

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      if (!pushToTalk) void setMic(!next);
      return next;
    });
  }, [pushToTalk, setMic]);

  const setVolume = useCallback(
    (value: number) => {
      volumeRef.current = value;
      setVolumeState(value);
      applyVolumes();
    },
    [applyVolumes],
  );

  // Push-to-talk: the mic is live only while Space is held (and not while typing).
  useEffect(() => {
    if (status !== "on") return;
    if (!pushToTalk) {
      void setMic(!muted);
      return;
    }
    void setMic(false);
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || typing(event.target)) return;
      event.preventDefault();
      setTalking(true);
      void setMic(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      setTalking(false);
      void setMic(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      setTalking(false);
    };
    // `muted` is intentionally read only when push-to-talk is switched off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToTalk, status, setMic]);

  useEffect(() => () => void leave(), [leave]);

  return {
    status, error, unavailable, muted, pushToTalk, talking, speaking, peers, volume, priority,
    join, leave, toggleMute, setPushToTalk, setVolume, setPriority,
  };
}

export type VoiceHandle = ReturnType<typeof useVoice>;
