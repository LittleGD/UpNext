import { describe, expect, it } from 'vitest';
import { combatSound, dungeonMusic } from './upHeroAudio';
import { createDefaultHero, type CombatSession, type LogEntry, type Monster, type Equipment } from '@/types/uphero';
const monster = { isBoss: true } as Monster;
const session = (log: LogEntry[], status: CombatSession['status'] = 'active') => ({
  dungeonId: 'fitness', status, log, hero: createDefaultHero(),
} as CombatSession);

describe('dungeon music follows the encounter lifetime', () => {
  const boss: LogEntry = { type: 'boss', monster, floor: 10, timestamp: 1 };
  it('keeps boss music through reveal, pause and minigame without relying on floor number', () => {
    for (const status of ['active', 'paused', 'awaitingChoice', 'awaitingMinigame'] as const) {
      expect(dungeonMusic(session([boss], status))).toBe('boss');
    }
  });
  it('returns to that dungeon after victory, a new floor, session end and then main on exit', () => {
    expect(dungeonMusic(session([boss, { type: 'victory', monster, xp: 1, coins: 1, timestamp: 2 }]))).toBe('fitness');
    expect(dungeonMusic(session([boss, { type: 'floor', from: 10, to: 11, timestamp: 2 }]))).toBe('fitness');
    expect(dungeonMusic(session([boss], 'completed'))).toBe('fitness');
    expect(dungeonMusic(null)).toBe('main');
  });
  it('recognizes a saved boss encounter with no banner log', () => {
    expect(dungeonMusic(session([{ type: 'encounter', monster, timestamp: 1 }]))).toBe('boss');
  });
});

describe('combat cue semantics', () => {
  it('distinguishes hit, hurt, critical, dodge, miss and block', () => {
    const hit = { type: 'combat', attacker: 'hero', damage: 10, outcome: 'hit', timestamp: 1 } as const;
    expect(combatSound(hit)).toBe('heroHit');
    expect(combatSound({ ...hit, attacker: 'enemy' })).toBe('enemyHit');
    expect(combatSound({ ...hit, outcome: 'crit' })).toBe('criticalHit');
    expect(combatSound({ ...hit, outcome: 'dodge' })).toBe('dodge');
    expect(combatSound({ ...hit, outcome: 'miss' })).toBe('miss');
    expect(combatSound({ ...hit, damage: 0 })).toBe('shieldBlock');
  });
  it('uses the actual unique/legend rarity names for special drops', () => {
    for (const rarity of ['unique', 'legend'] as const) {
      expect(combatSound({ type: 'drop', equipment: { rarity } as Equipment, timestamp: 0 })).toBe('rareLoot');
    }
  });
  it('never plays success on death or spoils slot outcomes', () => {
    expect(combatSound({ type: 'sessionEnd', reason: 'heroDied', timestamp: 0 })).toBe('defeat');
    expect(combatSound({ type: 'choiceResult', text: '', slot: { outcome: 'coinSmall', symbols: ['coin', 'coin', 'coin'], cost: 100 }, timestamp: 0 })).toBeNull();
    expect(combatSound({ type: 'boss', monster, floor: 10, timestamp: 0 })).toBeNull();
  });
});
