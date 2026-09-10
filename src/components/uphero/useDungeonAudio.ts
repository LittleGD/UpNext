'use client';
import { useEffect, useRef } from 'react';
import { appAudio } from '@/lib/audio';
import { triggerHaptic } from '@/lib/sounds';
import { combatSound, dungeonMusic } from '@/lib/upHeroAudio';
import { useUpHeroStore } from '@/store/useUpHeroStore';
import { useGameStore } from '@/store/useGameStore';

/** Lives above the dungeon/result branch so terminal combat cues are not lost on unmount. */
export function useDungeonAudio() {
  const session = useUpHeroStore(s => s.currentSession);
  const enabled = useGameStore(s => s.progress.soundEnabled ?? true);
  const hapticEnabled = useGameStore(s => s.progress.hapticEnabled ?? true);
  const cursor = useRef<{ stamp: number; count: number; hp: number; time: number } | null>(null);
  useEffect(() => {
    appAudio.setMusic(dungeonMusic(session));
    if (!session) { cursor.current = null; return; }
    const previous = cursor.current;
    cursor.current = { stamp: session.startedAt, count: session.log.length, hp: session.hero.hp, time: session.time };
    // Baseline resumed sessions; never replay historical combat or muted events.
    if (!previous || previous.stamp !== session.startedAt) return;
    for (const entry of session.log.slice(Math.max(previous.count, session.log.length - 8))) {
      const cue = combatSound(entry);
      if (cue && enabled) appAudio.play(cue);
      if (hapticEnabled && (entry.type === 'boss' || (entry.type === 'combat' && entry.outcome === 'crit'))) {
        triggerHaptic('impactShake');
      }
    }
    if (enabled && session.hero.hp > previous.hp && !session.log.slice(previous.count).some(e => e.type === 'choiceResult')) appAudio.play('heal');
    if (enabled && previous.time > 10 && session.time <= 10 && session.time > 0) appAudio.play('timeWarning');
  }, [session, enabled, hapticEnabled]);
  useEffect(() => () => appAudio.setMusic('main'), []);
}
