"use client";

import { useEffect, useRef, useState } from "react";
import { loadAudioPrefs, playSfx, saveAudioPrefs, speak, stopSpeaking, type AudioPrefs } from "@/lib/audio";
import { ROLE_LABEL, franchise } from "@/lib/franchises";
import { speakMoney } from "@/lib/money";
import type { Player, RoomEvent, RoomSnapshot } from "@/types";
import type { RoomHandle } from "./useRoom";

/**
 * The system auctioneer's voice and the sound effects. Every line is triggered by an event
 * the server broadcast after committing it, so the voice can never announce a result that
 * did not happen. The only locally timed lines are the "going once / twice" warnings, which
 * are derived from the server deadline and say nothing about the outcome.
 */
export function useAnnouncer(room: RoomHandle, players: Map<string, Player>, remainingMs: number | null) {
  const [prefs, setPrefs] = useState<AudioPrefs>({ sfx: true, voice: true, volume: 0.7 });
  const prefsRef = useRef(prefs);
  const playersRef = useRef(players);
  useEffect(() => {
    prefsRef.current = prefs;
    playersRef.current = players;
  });

  useEffect(() => setPrefs(loadAudioPrefs()), []);

  const update = (patch: Partial<AudioPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      saveAudioPrefs(next);
      if (!next.voice) stopSpeaking();
      return next;
    });
  };

  useEffect(() => {
    return room.subscribe((event: RoomEvent, snapshot: RoomSnapshot) => {
      const p = prefsRef.current;
      const systemVoice = snapshot.room.auctioneer_type === "system";
      const say = (text: string, replace = false) => systemVoice && speak(text, p, { replace });
      const playerName = (id: string | undefined) => (id ? playersRef.current.get(id)?.full_name : undefined) ?? "the player";

      switch (event.type) {
        case "auction_started":
          playSfx("start", p);
          say("Welcome to the Auction Arena auction. Franchises, get ready.", true);
          break;
        case "player_presented": {
          const player = event.lot ? playersRef.current.get(event.lot.player_id) : undefined;
          playSfx("reveal", p);
          if (player && event.lot) {
            say(`Up next, ${player.full_name}. ${ROLE_LABEL[player.role]}, ${player.country}. Base price, ${speakMoney(event.lot.base_price_lakh)}.`, true);
          }
          break;
        }
        case "bid_accepted":
          playSfx("bid", p);
          if (event.bid) {
            const team = franchise(event.bid.franchise_id);
            say(`${team?.name ?? event.bid.franchise_id}, ${speakMoney(event.bid.amount_lakh)}.`, true);
          }
          break;
        case "player_sold":
          playSfx("sold", p);
          if (event.lot?.sold_to && event.lot.sold_price_lakh !== null) {
            say(`Sold! ${playerName(event.lot.player_id)} goes to ${franchise(event.lot.sold_to)?.name ?? event.lot.sold_to} for ${speakMoney(event.lot.sold_price_lakh)}.`, true);
          }
          break;
        case "player_unsold":
          playSfx("unsold", p);
          say(`${playerName(event.lot?.player_id)} goes unsold.`, true);
          break;
        case "player_withdrawn":
          say(`${playerName(event.lot?.player_id)} has been withdrawn.`, true);
          break;
        case "round_started":
          say("Main list complete. Unsold players return for the accelerated round.", true);
          break;
        case "auction_paused":
          say("The auction is paused.", true);
          break;
        case "auction_resumed":
          say("The auction resumes.", true);
          break;
        case "auction_completed":
          playSfx("start", p);
          say("That concludes the auction. Thank you, franchises.", true);
          break;
      }
    });
  }, [room]);

  // Countdown warnings for the lot on the table.
  const session = room.snapshot?.session;
  const deadline = session?.status === "live" && session.phase === "bidding" ? session.bid_deadline : null;
  const hasBid = Boolean(session?.current_bidder);
  const systemVoice = room.snapshot?.room.auctioneer_type === "system";
  const timerSec = session?.timer_sec ?? 20;
  const said = useRef<{ deadline: string | null; once: boolean; twice: boolean; second: number }>({ deadline: null, once: false, twice: false, second: -1 });

  useEffect(() => {
    if (!deadline || remainingMs === null) return;
    if (said.current.deadline !== deadline) said.current = { deadline, once: false, twice: false, second: -1 };
    const seconds = Math.ceil(remainingMs / 1000);
    const state = said.current;
    const onceAt = Math.min(6, Math.max(3, Math.round(timerSec * 0.3)));
    const twiceAt = Math.min(3, Math.max(1, Math.round(timerSec * 0.15)));

    if (seconds <= 5 && seconds > 0 && seconds !== state.second) {
      state.second = seconds;
      playSfx("tick", prefsRef.current);
    }
    if (!systemVoice || !hasBid) return;
    if (!state.once && seconds <= onceAt && seconds > twiceAt) {
      state.once = true;
      speak("Going once.", prefsRef.current);
    } else if (!state.twice && seconds <= twiceAt && seconds > 0) {
      state.twice = true;
      speak("Going twice.", prefsRef.current, { replace: true });
    }
  }, [deadline, remainingMs, hasBid, systemVoice, timerSec]);

  useEffect(() => () => stopSpeaking(), []);

  return { prefs, update };
}
