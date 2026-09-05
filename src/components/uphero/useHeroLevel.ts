"use client";

/**
 * Phase 2-A (Track A) — 영웅 레벨 / XP 진행도 훅.
 *
 * 영웅 레벨의 진실은 `useUpHeroStore.heroXp` 풀이다 (계정 XP 와 완전 분리).
 * 아직 시드 전(`heroXp === undefined`)인 잠깐 동안만 `resolveHeroLevel` 이 레거시
 * 공식(progress.level - heroStartLevel + 1)로 폴백한다 — Lv47 영웅이 Lv1 로
 * 깜빡이지 않게. 컴포넌트는 `getEffectiveHeroLevel` 을 직접 부르지 않는다.
 */

import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGameStore } from "@/store/useGameStore";
import { getHeroXPProgress, resolveHeroLevel } from "@/types/uphero";

/** 표시/판정용 영웅 레벨. heroXp 풀 기준, 시드 전엔 레거시 공식 폴백. */
export function useHeroLevel(): number {
  const heroXp = useUpHeroStore((s) => s.heroXp);
  const heroStartLevel = useUpHeroStore((s) => s.heroStartLevel);
  const gameLevel = useGameStore((s) => s.progress.level);
  return resolveHeroLevel(heroXp, gameLevel, heroStartLevel);
}

/**
 * 현재 영웅 레벨 안의 XP 진행도 `{ current, needed }` (캠프 XP 바용).
 * 시드 전엔 풀이 없으므로 current 0 / needed = 현재 레벨의 gap 을 돌려준다.
 */
export function useHeroXpProgress(): { current: number; needed: number } {
  const heroXp = useUpHeroStore((s) => s.heroXp);
  const level = useHeroLevel();
  return getHeroXPProgress(heroXp ?? 0, level);
}
