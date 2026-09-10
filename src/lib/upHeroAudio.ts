import type { CombatSession, LogEntry } from '@/types/uphero';
import type { MusicTrack } from './audio';
import type { SoundName } from './audioCatalog';

/** Inspect encounter lifetime, not floor number: choices and paused banners retain boss music. */
export function dungeonMusic(session: CombatSession | null): MusicTrack {
  if (!session) return 'main';
  if (session.status === 'completed') return session.dungeonId;
  for (let i = session.log.length - 1; i >= 0; i--) {
    const entry = session.log[i];
    if (entry.type === 'boss') return 'boss';
    if (entry.type === 'encounter') return entry.monster.isBoss ? 'boss' : session.dungeonId;
    if (entry.type === 'victory' || entry.type === 'floor' || entry.type === 'sessionEnd') break;
  }
  return session.dungeonId;
}

export function combatSound(entry: LogEntry): SoundName | null {
  switch (entry.type) {
    case 'combat':
      if (entry.outcome === 'crit') return 'criticalHit';
      if (entry.outcome === 'dodge') return 'dodge';
      if (entry.outcome === 'miss') return 'miss';
      return entry.damage > 0 ? entry.attacker === 'hero' ? 'heroHit' : 'enemyHit' : 'shieldBlock';
    case 'encounter': return entry.monster.isBoss ? null : 'encounter';
    case 'victory': return entry.monster.isBoss ? 'fullClear' : 'battleWin';
    case 'drop': return ['unique', 'legend'].includes(entry.equipment.rarity) ? 'rareLoot' : 'lootDrop';
    case 'treasure': return 'treasure';
    case 'floor': return 'floorAdvance';
    case 'choice': return entry.resolvedIndex == null ? 'choiceOpen' : null;
    case 'skill':
      if (['priest', 'druid'].includes(entry.classType)) return 'skillHoly';
      if (entry.classType === 'chronomancer') return 'skillTime';
      if (['mage', 'illusionist', 'bard'].includes(entry.classType)) return 'skillMagic';
      return 'skillMelee';
    case 'monsterEffect': return entry.effect === 'regen' ? 'heal' : entry.effect === 'poisonTick' ? 'poison' : 'shieldBlock';
    case 'choiceResult':
      if (entry.slot) return null; // The reels own their reveal sound.
      if (entry.effectSummaryData?.damage) return 'enemyHit';
      if (entry.effectSummaryData?.heal) return 'heal';
      if (entry.effectSummaryData?.coins || entry.effectSummaryData?.xp) return 'rewardChoose';
      return 'confirm';
    case 'sessionEnd':
      if (entry.reason === 'heroDied' || entry.reason === 'defeat') return 'defeat';
      if (entry.reason === 'timeExpired') return 'timeWarning';
      if (entry.reason === 'heroAbandoned' || entry.reason === 'abandoned') return 'retreat';
      return null; // Boss victory already owns the fanfare.
    default: return null;
  }
}
