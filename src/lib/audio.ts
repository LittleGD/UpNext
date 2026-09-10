import { MUSIC_LOOP_SECONDS, SOUND_NAMES, type SoundName } from './audioCatalog';
import type { DungeonId } from '@/types/uphero';

export type MusicTrack = 'main' | 'boss' | DungeonId;
const MUSIC_LEVEL = (track: MusicTrack) => track === 'main' ? 0.24 : track === 'boss' ? 0.55 : 0.42;
const BOSS_INTRO_LEAD = 0.45;
const QUIET = new Set<SoundName>(['select', 'cardHover', 'slotTick', 'miss', 'heroHit', 'enemyHit']);
type Voice = { source: AudioBufferSourceNode; gain: GainNode; startsAt: number };

/** Shared mixer. Music has baked loop crossfades; scene changes fade here.
 * Nothing starts before a browser gesture. Pending loads cannot revive muted audio.
 */
export class AppAudio {
  private context: AudioContext | null = null;
  private enabled = true;
  private active = true;
  private unlocked = false;
  private desired: MusicTrack = 'main';
  private current: MusicTrack | null = null;
  private generation = 0;
  private effectsEpoch = 0;
  private music = new Set<Voice>();
  private effects = new Map<Voice, SoundName>();
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private lastPlayed = new Map<SoundName, number>();
  private prewarmed = false;
  private bossIntro: Promise<number | null> | null = null;

  private getContext() {
    return this.context ??= new AudioContext();
  }

  unlock() {
    if (!this.enabled || !this.active) return;
    this.unlocked = true;
    const ctx = this.getContext();
    void ctx.resume().then(() => {
      if (!this.enabled || !this.active) return;
      if (!this.prewarmed) {
        this.prewarmed = true;
        for (const name of SOUND_NAMES) void this.load(`sfx-${name}.wav`).catch(() => {});
      }
      this.startMusic();
    }).catch(() => {});
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.stopAll();
    else if (this.unlocked) this.unlock();
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      this.stopAll();
      void this.context?.suspend().catch(() => {});
    } else if (this.unlocked) this.unlock();
  }

  setMusic(track: MusicTrack) {
    if (track === this.desired) return;
    const enteringBoss = track === 'boss';
    this.desired = track;
    this.generation++;
    if (!enteringBoss) {
      for (const [voice, name] of this.effects) if (name === 'bossTransition') this.stopVoice(voice);
      for (const voice of this.music) {
        if (voice.startsAt > this.getContext().currentTime) {
          this.stopVoice(voice);
          this.current = null;
        }
      }
    }
    this.bossIntro = enteringBoss ? this.play('bossTransition') : null;
    this.startMusic();
  }

  private load(file: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(file);
    if (cached) return cached;
    const promise = fetch(`/audio/${file}`).then(response => {
      if (!response.ok) throw new Error(`Audio ${response.status}: ${file}`);
      return response.arrayBuffer();
    }).then(data => this.getContext().decodeAudioData(data)).catch(error => {
      this.buffers.delete(file);
      throw error;
    });
    this.buffers.set(file, promise);
    return promise;
  }

  private makeVoice(buffer: AudioBuffer): Voice {
    const ctx = this.getContext();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    const voice = { source, gain, startsAt: ctx.currentTime };
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      this.music.delete(voice); this.effects.delete(voice);
    };
    return voice;
  }

  private startMusic() {
    if (!this.enabled || !this.active || !this.unlocked || this.current === this.desired) return;
    const track = this.desired;
    const generation = this.generation;
    // The stinger gets a head start even if its sample loads after the music.
    // Repeated unlock gestures share this intro instead of replaying it.
    void Promise.all([this.load(`bgm-${track}.m4a`), this.bossIntro]).then(([buffer, introStarted]) => {
      if (generation !== this.generation || !this.enabled || !this.active || this.current === track) return;
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const fade = track === 'boss' ? 1.4 : 2.4;
      const start = introStarted === null ? now : Math.max(now, introStarted + BOSS_INTRO_LEAD);
      const outgoingFade = introStarted === null ? fade : 0.65;
      for (const voice of this.music) {
        voice.gain.gain.cancelAndHoldAtTime(now);
        voice.gain.gain.linearRampToValueAtTime(0, now + outgoingFade);
        voice.source.stop(now + outgoingFade + 0.05);
      }
      const voice = this.makeVoice(buffer);
      voice.source.loop = true;
      voice.source.loopEnd = Math.min(buffer.duration, MUSIC_LOOP_SECONDS[track]);
      voice.gain.gain.setValueAtTime(0, now);
      voice.gain.gain.setValueAtTime(0, start);
      voice.gain.gain.linearRampToValueAtTime(MUSIC_LEVEL(track), start + fade);
      voice.startsAt = start;
      voice.source.start(start);
      this.music.add(voice);
      this.current = track;
      // Keep only the current decoded music in cache. Outgoing voices retain their
      // own buffers until their fade ends, bounding memory even across 8 dungeons.
      for (const key of this.buffers.keys()) {
        if (key.startsWith('bgm-') && key !== `bgm-${track}.m4a`) this.buffers.delete(key);
      }
    }).catch(() => { /* Keep the previous music when a track cannot load. */ });
  }

  async play(name: SoundName): Promise<number | null> {
    if (!this.enabled || !this.active || !this.unlocked) return null;
    const epoch = this.effectsEpoch;
    const generation = this.generation;
    const now = performance.now();
    const cooldown = name === 'slotTick' || name === 'select' ? 45 : 110;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < cooldown) return null;
    this.lastPlayed.set(name, now);
    // Ordinary effects survive music changes; boss stingers belong to their scene.
    const ctx = this.getContext();
    try {
      const buffer = await this.load(`sfx-${name}.wav`);
      if (epoch !== this.effectsEpoch || !this.enabled || !this.active ||
          (name === 'bossTransition' && (this.desired !== 'boss' || generation !== this.generation)) ||
          performance.now() - now > 350) return null;
      if (this.effects.size >= 12) {
        const expendable = [...this.effects].find(([, cue]) => QUIET.has(cue));
        if (expendable) this.stopVoice(expendable[0]);
        else return null;
      }
      const voice = this.makeVoice(buffer);
      voice.gain.gain.value = name === 'bossTransition' ? 0.26 : QUIET.has(name) ? 0.22 : 0.42;
      const started = ctx.currentTime;
      voice.source.start(started);
      this.effects.set(voice, name);
      return started;
    } catch { return null; }
  }

  private stopVoice(voice: Voice) {
    try { voice.source.stop(); } catch { /* Already ended. */ }
    this.effects.delete(voice);
    this.music.delete(voice);
  }

  private stopAll() {
    this.generation++;
    this.effectsEpoch++;
    this.current = null;
    this.bossIntro = null;
    for (const voice of [...this.music, ...this.effects.keys()]) this.stopVoice(voice);
    this.lastPlayed.clear();
  }
}

export const appAudio = new AppAudio();
