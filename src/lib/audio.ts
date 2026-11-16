"use client";

// Sound effects are synthesised with Web Audio (no audio files to ship or license) and the
// auctioneer voice uses the browser's speech synthesis. Both are optional and user controlled.

export type AudioPrefs = { sfx: boolean; voice: boolean; volume: number };

const KEY = "auctionarena.audio";
const DEFAULTS: AudioPrefs = { sfx: true, voice: true, volume: 0.7 };

export function loadAudioPrefs(): AudioPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function saveAudioPrefs(prefs: AudioPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: preferences simply do not persist.
  }
}

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, length: number, volume: number, type: OscillatorType = "sine", endFreq?: number) {
  const ctx = audio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + length);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.02);
}

function knock(start: number, volume: number) {
  const ctx = audio();
  if (!ctx) return;
  // Gavel: a short burst of filtered noise on top of a low thump.
  const length = 0.09;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = "bandpass";
  filter.frequency.value = 900;
  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(ctx.currentTime + start);
  tone(150, start, 0.16, volume * 0.9, "sine", 60);
}

export type Sfx = "bid" | "tick" | "sold" | "unsold" | "reveal" | "start";

export function playSfx(name: Sfx, prefs: AudioPrefs) {
  if (!prefs.sfx || prefs.volume <= 0) return;
  const v = prefs.volume * 0.25;
  switch (name) {
    case "bid":
      tone(660, 0, 0.09, v, "triangle");
      tone(990, 0.07, 0.12, v, "triangle");
      break;
    case "tick":
      tone(1200, 0, 0.06, v * 0.8, "square");
      break;
    case "sold":
      knock(0, v * 2.4);
      knock(0.22, v * 2.4);
      tone(523, 0.42, 0.5, v, "triangle");
      tone(659, 0.42, 0.5, v, "triangle");
      tone(784, 0.42, 0.6, v, "triangle");
      break;
    case "unsold":
      tone(330, 0, 0.22, v, "sawtooth", 220);
      tone(220, 0.2, 0.35, v, "sawtooth", 150);
      break;
    case "reveal":
      tone(220, 0, 0.5, v * 0.9, "sine", 880);
      tone(880, 0.42, 0.3, v, "triangle");
      break;
    case "start":
      [392, 523, 659, 784].forEach((freq, i) => tone(freq, i * 0.13, 0.3, v, "triangle"));
      break;
  }
}

let voice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (voice !== undefined) return voice;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null; // not loaded yet: try again on the next call
  voice =
    voices.find((v) => v.lang === "en-IN") ??
    voices.find((v) => v.lang === "en-GB") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null;
  return voice;
}

/**
 * Speaks an auctioneer line. `replace` drops anything still queued, so during a burst of
 * bids the voice always announces the latest bid instead of falling behind.
 */
export function speak(text: string, prefs: AudioPrefs, options: { replace?: boolean; rate?: number } = {}) {
  if (!prefs.voice || prefs.volume <= 0) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  if (options.replace) synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const chosen = pickVoice();
  if (chosen) utterance.voice = chosen;
  utterance.rate = options.rate ?? 1.08;
  utterance.pitch = 1;
  utterance.volume = Math.min(1, prefs.volume);
  synth.speak(utterance);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
