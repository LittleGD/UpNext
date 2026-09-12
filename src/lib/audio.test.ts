import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppAudio } from './audio';

const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; loop: boolean; loopEnd?: number }[] = [];
const gains: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn>; cancelAndHoldAtTime: ReturnType<typeof vi.fn> }[] = [];
const pending = new Map<string, (response: Response) => void>();
const response = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as Response;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let mixer: AppAudio;
beforeEach(() => {
  sources.length = 0; gains.length = 0; pending.clear();
  class Context {
    currentTime = 0; destination = {}; state = 'running';
    resume = async () => {}; suspend = async () => {};
    decodeAudioData = async () => ({ duration: 120 }) as AudioBuffer;
    createBufferSource() {
      const source = { connect: vi.fn((gain) => gain), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), loop: false };
      sources.push(source); return source;
    }
    createGain() {
      const gain = { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelAndHoldAtTime: vi.fn() };
      gains.push(gain);
      return { connect: vi.fn(), disconnect: vi.fn(), gain };
    }
  }
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('bgm-')
    ? new Promise<Response>(resolve => pending.set(url, resolve)) : Promise.resolve(response())));
  mixer = new AppAudio();
});
afterEach(() => { mixer.setEnabled(false); vi.unstubAllGlobals(); });
const resolveMusic = async (name: string) => { pending.get(`/audio/bgm-${name}.m4a`)?.(response()); await flush(); };

describe('audio lifecycle and race handling', () => {
  it('cancels a loading shuffle on release without reviving it on re-press', async () => {
    vi.mocked(fetch).mockImplementation(url => new Promise<Response>(resolve => pending.set(String(url), resolve)));
    mixer.unlock(); await flush();
    mixer.startCardShuffle(); mixer.stopCardShuffle();
    pending.get('/audio/sfx-cardShuffle.wav')?.(response()); await flush();
    expect(sources).toHaveLength(0);
    mixer.startCardShuffle(); await flush();
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(true);
    mixer.stopCardShuffle();
    expect(sources[0].stop).toHaveBeenCalledWith(0.07);
    mixer.startCardShuffle(); await flush();
    mixer.setActive(false);
    expect(sources[1].stop).toHaveBeenCalled();
    mixer.setActive(true); await flush();
    expect(sources).toHaveLength(2); // Foreground never restarts a released hold.
  });
  it('does not fetch or start music before unlock', () => {
    mixer.setMusic('learning'); expect(fetch).not.toHaveBeenCalled();
  });
  it('crossfades and loops only the desired track when loads finish out of order', async () => {
    mixer.unlock(); await flush();
    mixer.setMusic('learning'); mixer.setMusic('wellness');
    await resolveMusic('wellness'); await resolveMusic('learning'); await resolveMusic('main');
    expect(sources.filter(s => s.loop)).toHaveLength(1);
    expect(sources.find(s => s.loop)?.loopEnd).toBe(120); // Clamp to decoded duration.
    mixer.setMusic('fitness'); await resolveMusic('fitness');
    expect(sources.filter(s => s.loop)).toHaveLength(2);
    expect(sources.find(s => s.loop)?.stop).toHaveBeenCalled();
  });
  it('cancels a pending track on mute and resumes only the latest requested scene', async () => {
    mixer.unlock(); await flush(); mixer.setEnabled(false);
    await resolveMusic('main'); expect(sources).toHaveLength(0);
    mixer.setMusic('social'); mixer.setEnabled(true); await flush(); await resolveMusic('social');
    expect(sources.filter(s => s.loop)).toHaveLength(1);
  });
  it('stops both buses in background and permits music on return', async () => {
    mixer.unlock(); await flush(); await resolveMusic('main');
    mixer.play('heroHit'); await flush();
    expect(sources).toHaveLength(2);
    mixer.setActive(false);
    expect(sources.every(s => s.stop.mock.calls.length === 1)).toBe(true);
    mixer.setActive(true); await flush();
    expect(sources.filter(s => s.loop)).toHaveLength(2);
  });
  it('overlaps effects instead of interrupting the previous effect and rate limits duplicates', async () => {
    mixer.unlock(); await flush();
    mixer.play('heroHit'); mixer.play('enemyHit'); mixer.play('heroHit'); await flush();
    expect(sources).toHaveLength(2);
    expect(sources.every(s => s.stop.mock.calls.length === 0)).toBe(true);
  });
  it('plays a quieter stinger before boss music even when the stinger loads last', async () => {
    vi.mocked(fetch).mockImplementation((url) => String(url).includes('bgm-') || String(url).includes('bossTransition')
      ? new Promise<Response>(resolve => pending.set(String(url), resolve)) : Promise.resolve(response()));
    mixer.unlock(); await flush(); await resolveMusic('main');
    mixer.setMusic('boss'); await resolveMusic('boss');
    expect(sources).toHaveLength(1); // Music must wait for the intro, not bury a late SFX.
    pending.get('/audio/sfx-bossTransition.wav')?.(response()); await flush();
    const stinger = sources[1]; const boss = sources[2];
    expect(stinger.loop).toBe(false);
    expect(gains[1].value).toBe(0.26);
    expect(boss.start.mock.calls[0][0] - stinger.start.mock.calls[0][0]).toBeCloseTo(0.45);
    expect(gains[2].setValueAtTime).toHaveBeenCalledWith(0, 0); // Silent before scheduled start.
    expect(gains[2].linearRampToValueAtTime.mock.calls[0][0]).toBe(0.55);
    expect(gains[2].linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(1.85);
    expect(gains[0].linearRampToValueAtTime).toHaveBeenCalledWith(0, 0.65);
    mixer.unlock(); mixer.unlock(); await flush();
    expect(sources).toHaveLength(3);
    mixer.setEnabled(false);
    expect(boss.stop).toHaveBeenLastCalledWith();
  });
  it('drops a late boss intro when the player has already returned to the dungeon', async () => {
    vi.mocked(fetch).mockImplementation((url) => String(url).includes('bgm-') || String(url).includes('bossTransition')
      ? new Promise<Response>(resolve => pending.set(String(url), resolve)) : Promise.resolve(response()));
    mixer.unlock(); await flush(); await resolveMusic('main');
    mixer.setMusic('boss'); mixer.setMusic('main');
    await resolveMusic('boss');
    pending.get('/audio/sfx-bossTransition.wav')?.(response()); await flush();
    expect(sources).toHaveLength(1);
  });
  it('cancels scheduled boss music immediately while the return track is still loading', async () => {
    mixer.unlock(); await flush(); await resolveMusic('main');
    mixer.setMusic('boss'); await resolveMusic('boss');
    const boss = sources.findLast(source => source.loop)!;
    expect(boss.start).toHaveBeenCalledWith(0.45);
    mixer.setMusic('fitness');
    expect(boss.stop).toHaveBeenLastCalledWith();
    await resolveMusic('fitness');
    expect(sources.findLast(source => source.loop)?.start).toHaveBeenCalledWith(0);
  });
});
