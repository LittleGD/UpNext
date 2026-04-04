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
  | "chargeUp"
  | "ambientFloat"
  | "pulseWave"
  | "collect"
  | "fireIgnite"
  | "impactShake"
  | "superIgnite"
  | "meteorWhoosh";

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
  /** UI button click — 60ms, punchy low thud with subtle overtone */
  select() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Low thud body — deep square hit
    createOsc(ctx, 180, t, 0.06, MASTER_VOLUME * 0.8);
    // Sub-bass punch — triangle for weight
    createOsc(ctx, 90, t, 0.05, MASTER_VOLUME * 0.5, "triangle");
    // Brief high tick for clarity
    createOsc(ctx, 600, t, 0.02, MASTER_VOLUME * 0.25);
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

  /** XP gained — 450ms, ascending staccato coin-gather sequence */
  xpGain() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // 6 rapid ascending notes — feels like coins pouring in
    const notes = [880, 988, 1047, 1175, 1319, 1568]; // A5 B5 C6 D6 E6 G6
    const step = 0.055;
    notes.forEach((freq, i) => {
      createOsc(ctx, freq, t + i * step, 0.045, MASTER_VOLUME * (0.4 + i * 0.08));
    });
    // Final shimmer — sustained high note with triangle harmony
    const end = t + notes.length * step;
    createOsc(ctx, 1568, end, 0.12, MASTER_VOLUME * 0.7);
    createOsc(ctx, 784, end, 0.12, MASTER_VOLUME * 0.25, "triangle");
  },

  /** Collect/stash — 150ms, heavy thud + metallic lock, card slotting into inventory */
  collect() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Deep impact thud
    createOsc(ctx, 120, t, 0.08, MASTER_VOLUME * 0.9, "triangle");
    createOsc(ctx, 80, t, 0.06, MASTER_VOLUME * 0.6);
    // Metallic latch click
    createOsc(ctx, 1400, t + 0.03, 0.03, MASTER_VOLUME * 0.4);
    // Brief resonance tail
    createOsc(ctx, 200, t + 0.06, 0.1, MASTER_VOLUME * 0.3, "triangle");
  },

  /** Ambient float — 1.2s, deep space drone with slow oscillating undertone */
  ambientFloat() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Deep bass drone — low C2 triangle wave, slow swell
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = "triangle";
    bass.frequency.setValueAtTime(65, t); // C2
    bass.frequency.linearRampToValueAtTime(73, t + 1.2); // slow drift up
    bassGain.gain.setValueAtTime(0.0001, t);
    bassGain.gain.exponentialRampToValueAtTime(MASTER_VOLUME * 0.45, t + 0.3);
    bassGain.gain.setValueAtTime(MASTER_VOLUME * 0.45, t + 0.7);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    bass.connect(bassGain);
    bassGain.connect(ctx.destination);
    bass.start(t);
    bass.stop(t + 1.25);
    // Mid-tone square hum — G2, quiet, gives 8-bit texture
    createOsc(ctx, 98, t + 0.1, 0.8, MASTER_VOLUME * 0.15);
    // High shimmer — very quiet C4 that fades in/out
    createOsc(ctx, 262, t + 0.4, 0.5, MASTER_VOLUME * 0.08, "triangle");
    // Sub-bass rumble — pulsing
    createOsc(ctx, 45, t, 0.4, MASTER_VOLUME * 0.2, "triangle");
    createOsc(ctx, 45, t + 0.5, 0.4, MASTER_VOLUME * 0.15, "triangle");
  },

  /** Pulse wave — 900ms, ascending expanding pulse that builds outward */
  pulseWave() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Main pulse — ascending sweep, energy rising outward
    createSweep(ctx, 220, 880, t, 0.3, MASTER_VOLUME * 0.5);
    // Echo pulse 1 — higher, slightly delayed, expanding feel
    createSweep(ctx, 330, 1100, t + 0.15, 0.3, MASTER_VOLUME * 0.3);
    // Echo pulse 2 — highest, widest spread
    createSweep(ctx, 440, 1320, t + 0.3, 0.3, MASTER_VOLUME * 0.18);
    // Rising undertone — triangle wave swelling upward
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "triangle";
    sub.frequency.setValueAtTime(110, t);
    sub.frequency.exponentialRampToValueAtTime(440, t + 0.7);
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(MASTER_VOLUME * 0.35, t + 0.3);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(t);
    sub.stop(t + 0.95);
    // Bright shimmer at the peak
    createOsc(ctx, 1320, t + 0.5, 0.15, MASTER_VOLUME * 0.15, "triangle");
  },

  /** Charge up — 800ms, deep rumble rising to high tension release */
  chargeUp() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Deep sub-bass rumble foundation — builds weight
    createSweep(ctx, 60, 200, t, 0.8, MASTER_VOLUME * 0.7);
    // Main rising sweep — low to high, the core charge feeling
    createSweep(ctx, 100, 900, t, 0.75, MASTER_VOLUME * 0.55);
    // Higher overtone sweep — trails behind, adds brightness as charge builds
    createSweep(ctx, 200, 1400, t + 0.15, 0.65, MASTER_VOLUME * 0.3);
    // Triangle sub-bass drone — continuous rumble underneath
    const drone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    drone.type = "triangle";
    drone.frequency.setValueAtTime(55, t);
    drone.frequency.exponentialRampToValueAtTime(110, t + 0.8);
    droneGain.gain.setValueAtTime(0.0001, t);
    droneGain.gain.exponentialRampToValueAtTime(MASTER_VOLUME * 0.5, t + 0.15);
    droneGain.gain.setValueAtTime(MASTER_VOLUME * 0.5, t + 0.5);
    droneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    drone.connect(droneGain);
    droneGain.connect(ctx.destination);
    drone.start(t);
    drone.stop(t + 0.85);
    // Accelerating staccato pulses — faster as charge builds
    const pulses = [0, 0.12, 0.22, 0.30, 0.36, 0.41, 0.45, 0.48];
    pulses.forEach((offset, i) => {
      const freq = 150 + i * 80;
      createOsc(ctx, freq, t + offset, 0.04, MASTER_VOLUME * (0.12 + i * 0.04));
    });
    // Final bright burst at peak — signals charge complete
    createOsc(ctx, 1200, t + 0.7, 0.1, MASTER_VOLUME * 0.25);
    createOsc(ctx, 600, t + 0.7, 0.1, MASTER_VOLUME * 0.15, "triangle");
  },

  /** Fire ignite — 600ms, low rumble + crackling bursts + rising sweep */
  fireIgnite() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Low rumble — 80Hz triangle for deep fire body
    createOsc(ctx, 80, t, 0.5, MASTER_VOLUME * 0.7, "triangle");
    // Crackling bursts — 4-5 random short square notes at high freq
    const crackleFreqs = [1200, 1500, 1800, 1400, 2000];
    crackleFreqs.forEach((freq, i) => {
      const offset = 0.05 + i * 0.07 + Math.random() * 0.03;
      const dur = 0.02 + Math.random() * 0.02; // 20-40ms
      createOsc(ctx, freq, t + offset, dur, MASTER_VOLUME * 0.4);
    });
    // Rising sweep — 200→600Hz over 400ms, the fire catching
    createSweep(ctx, 200, 600, t + 0.1, 0.4, MASTER_VOLUME * 0.5);
  },

  /** Impact shake — 200ms, strong low impact + sub-bass frequency drop */
  impactShake() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Strong low impact — 60Hz square, high volume
    const impactOsc = ctx.createOscillator();
    const impactGain = ctx.createGain();
    impactOsc.type = "square";
    impactOsc.frequency.setValueAtTime(60, t);
    // Sub-bass drop — ramp 60→30Hz over 150ms
    impactOsc.frequency.exponentialRampToValueAtTime(30, t + 0.15);
    impactGain.gain.setValueAtTime(0.0001, t);
    impactGain.gain.exponentialRampToValueAtTime(0.25, t + 0.005);
    // Quick decay
    impactGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    impactOsc.connect(impactGain);
    impactGain.connect(ctx.destination);
    impactOsc.start(t);
    impactOsc.stop(t + 0.22);
    // Additional sub-bass body for weight
    createOsc(ctx, 45, t, 0.15, MASTER_VOLUME * 0.6, "triangle");
  },

  /** Super ignite — 900ms, epic enhanced fire with chorus + reverse cymbal */
  superIgnite() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Deep bass — 50Hz triangle, even deeper than fireIgnite
    createOsc(ctx, 50, t, 0.7, MASTER_VOLUME * 0.8, "triangle");
    // Double crackling — 8 notes across wider freq range
    const crackleFreqs = [1000, 1400, 1800, 2200, 1200, 2400, 1600, 2000];
    crackleFreqs.forEach((freq, i) => {
      const offset = 0.05 + i * 0.06 + Math.random() * 0.03;
      const dur = 0.02 + Math.random() * 0.02;
      createOsc(ctx, freq, t + offset, dur, MASTER_VOLUME * 0.35);
    });
    // 3 detuned oscillators for chorus effect — main + ±5Hz offsets
    const chorusBase = 200;
    [chorusBase, chorusBase + 5, chorusBase - 5].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t + 0.1);
      osc.frequency.exponentialRampToValueAtTime(freq * 3, t + 0.6);
      gain.gain.setValueAtTime(0.0001, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(MASTER_VOLUME * 0.3, t + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + 0.1);
      osc.stop(t + 0.75);
    });
    // Reverse cymbal sweep — 2000→200Hz triangle, builds tension
    const cymbal = ctx.createOscillator();
    const cymbalGain = ctx.createGain();
    cymbal.type = "triangle";
    cymbal.frequency.setValueAtTime(2000, t + 0.2);
    cymbal.frequency.exponentialRampToValueAtTime(200, t + 0.85);
    cymbalGain.gain.setValueAtTime(0.0001, t + 0.2);
    cymbalGain.gain.exponentialRampToValueAtTime(MASTER_VOLUME * 0.4, t + 0.5);
    cymbalGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    cymbal.connect(cymbalGain);
    cymbalGain.connect(ctx.destination);
    cymbal.start(t + 0.2);
    cymbal.stop(t + 0.95);
  },

  /** Meteor whoosh — 1.5s, descending sweep + cosmic pad + sparkle pings */
  meteorWhoosh() {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Descending sweep — 1500→300Hz triangle, the meteor streaking
    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweep.type = "triangle";
    sweep.frequency.setValueAtTime(1500, t);
    sweep.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    sweepGain.gain.setValueAtTime(0.0001, t);
    sweepGain.gain.exponentialRampToValueAtTime(MASTER_VOLUME * 0.6, t + 0.02);
    sweepGain.gain.exponentialRampToValueAtTime(MASTER_VOLUME * 0.3, t + 0.4);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    sweep.connect(sweepGain);
    sweepGain.connect(ctx.destination);
    sweep.start(t);
    sweep.stop(t + 0.85);
    // Soft cosmic pad — 200Hz triangle, very low volume, sustained
    const pad = ctx.createOscillator();
    const padGain = ctx.createGain();
    pad.type = "triangle";
    pad.frequency.setValueAtTime(200, t + 0.2);
    padGain.gain.setValueAtTime(0.0001, t + 0.2);
    padGain.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
    padGain.gain.setValueAtTime(0.05, t + 1.0);
    padGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    pad.connect(padGain);
    padGain.connect(ctx.destination);
    pad.start(t + 0.2);
    pad.stop(t + 1.35);
    // Light sparkle notes — 2 quick 1800Hz pings at the tail
    createOsc(ctx, 1800, t + 1.0, 0.06, MASTER_VOLUME * 0.25);
    createOsc(ctx, 1800, t + 1.12, 0.06, MASTER_VOLUME * 0.15);
  },
};

export function playSound(name: SoundName): void {
  try {
    sounds[name]();
  } catch {
    // Silently fail — audio is non-critical
  }
}

/* === 햅틱(진동) 피드백 === */
const VIBRATION_PATTERNS: Record<SoundName, number[] | null> = {
  select:       [8],
  confirm:      [15],
  cancel:       [15],
  cardFlip:     [15],
  cardSelect:   [8],
  cardHover:    null,            // 너무 빈번 — 진동 없음
  cardPreview:  [8],
  packOpen:     [10, 30, 10],
  complete:     [10, 30, 10],
  fullClear:    [20, 20, 30],
  levelUp:      [20, 20, 30],
  equip:        [8],
  xpGain:       [15],
  chargeUp:     [30, 10, 40],
  ambientFloat: null,            // 배경음 — 진동 없음
  pulseWave:    [30, 10, 40],
  collect:      [8],
  fireIgnite:   [20, 20, 30],
  impactShake:  [30, 10, 40],
  superIgnite:  [30, 10, 40],
  meteorWhoosh: [30, 10, 40],
};

export function triggerHaptic(name: SoundName): void {
  const pattern = VIBRATION_PATTERNS[name];
  if (pattern && typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* non-critical */ }
  }
}
