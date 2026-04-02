/**
 * 8-bit chip-tune sound effects using Web Audio API
 * All sounds use square waves for classic retro game feel
 */

export type SoundName =
  | "select"
  | "confirm"
  | "cancel"
  | "cardFlip"
  | "cardSelect"
  | "cardHover"
  | "cardPreview"
  | "packOpen"
  | "complete"
  | "fullClear"
  | "levelUp"
  | "equip"
  | "xpGain"
  | "chargeUp";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

const MASTER_VOLUME = 0.18;

/** Create a square wave oscillator connected through a gain node */
function createOsc(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number = MASTER_VOLUME,
  type: OscillatorType = "square"
): { osc: OscillatorNode; gain: GainNode } {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  // Attack
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.005);
  // Release
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
  return { osc, gain };
}

/** Sweep frequency from start to end */
function createSweep(
  ctx: AudioContext,
  freqStart: number,
  freqEnd: number,
  startTime: number,
  duration: number,
  volume: number = MASTER_VOLUME
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(freqStart, startTime);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

const sounds: Record<SoundName, () => void> = {
  /** UI selection tick — 50ms, short bright boop ~800Hz */
  select() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createOsc(ctx, 800, t, 0.05, MASTER_VOLUME * 0.7);
  },

  /** Success/confirm chime — 200ms, two rising notes 600→800Hz */
  confirm() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createOsc(ctx, 600, t, 0.1);
    createOsc(ctx, 800, t + 0.1, 0.1);
  },

  /** Cancel/deselect — 100ms, falling pitch 600→400Hz */
  cancel() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createSweep(ctx, 600, 400, t, 0.1);
  },

  /** Card flip/reveal — 80ms, quick sweep 400→1200Hz */
  cardFlip() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createSweep(ctx, 400, 1200, t, 0.08);
  },

  /** Card hover — 40ms, subtle soft tick ~700Hz (quiet) */
  cardHover() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createOsc(ctx, 700, t, 0.04, MASTER_VOLUME * 0.35);
  },

  /** Card preview slide — 120ms, smooth whoosh sweep 500→900Hz */
  cardPreview() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createSweep(ctx, 500, 900, t, 0.12, MASTER_VOLUME * 0.5);
  },

  /** Card selected for deck — 80ms, positive tick ~900Hz */
  cardSelect() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createOsc(ctx, 900, t, 0.06);
    createOsc(ctx, 1100, t + 0.04, 0.05, MASTER_VOLUME * 0.6);
  },

  /** Pack opening sparkle — 300ms, ascending arpeggio 3 notes */
  packOpen() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createOsc(ctx, 600, t, 0.1);
    createOsc(ctx, 800, t + 0.1, 0.1);
    createOsc(ctx, 1000, t + 0.2, 0.12);
  },

  /** Challenge complete — 300ms, victory ding, 3 ascending notes */
  complete() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createOsc(ctx, 523, t, 0.1);        // C5
    createOsc(ctx, 659, t + 0.1, 0.1);  // E5
    createOsc(ctx, 784, t + 0.2, 0.15); // G5
  },

  /** All daily challenges done — 600ms, triumphant 4-note fanfare */
  fullClear() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createOsc(ctx, 523, t, 0.12);        // C5
    createOsc(ctx, 659, t + 0.12, 0.12); // E5
    createOsc(ctx, 784, t + 0.24, 0.12); // G5
    createOsc(ctx, 1047, t + 0.36, 0.25); // C6 (hold longer)
    // Add a subtle triangle harmony on the final note
    createOsc(ctx, 523, t + 0.36, 0.25, MASTER_VOLUME * 0.4, "triangle");
  },

  /** Level up — 800ms, grand 8-bit fanfare with harmonics */
  levelUp() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const notes = [523, 587, 659, 784, 1047, 1319]; // C5 D5 E5 G5 C6 E6
    const dur = 0.11;
    notes.forEach((freq, i) => {
      createOsc(ctx, freq, t + i * dur, dur + 0.02);
    });
    // Final sustained note with harmony
    createOsc(ctx, 1319, t + notes.length * dur, 0.2, MASTER_VOLUME * 0.8);
    createOsc(ctx, 784, t + notes.length * dur, 0.2, MASTER_VOLUME * 0.35, "triangle");
  },

  /** Title equip — 200ms, "cha-ching" two bright notes */
  equip() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createOsc(ctx, 1200, t, 0.08);
    createOsc(ctx, 1600, t + 0.08, 0.12);
  },

  /** XP gained — 150ms, coin-like blip 1000→1200Hz */
  xpGain() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    createSweep(ctx, 1000, 1200, t, 0.08);
    createOsc(ctx, 1200, t + 0.08, 0.07, MASTER_VOLUME * 0.6);
  },

  /** Charge up — 800ms, rising sweep that builds tension 200→800Hz */
  chargeUp() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Low rumble base sweep
    createSweep(ctx, 150, 600, t, 0.7, MASTER_VOLUME * 0.5);
    // Higher overtone sweep that trails slightly
    createSweep(ctx, 300, 1000, t + 0.1, 0.6, MASTER_VOLUME * 0.3);
    // Staccato energy pulses
    for (let i = 0; i < 6; i++) {
      const freq = 200 + i * 100;
      createOsc(ctx, freq, t + i * 0.1, 0.06, MASTER_VOLUME * (0.15 + i * 0.05));
    }
  },
};

export function playSound(name: SoundName): void {
  try {
    sounds[name]();
  } catch {
    // Silently fail — audio is non-critical
  }
}
