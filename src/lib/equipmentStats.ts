/**
 * Phase 6-E (Track E, 피드백 17) — 장비 스탯 표시 순서의 단일 출처.
 *
 * `Object.entries(stats)` 순서는 계약이 아니다 (affix 가 primary 앞에 쌓이는 경우가
 * 있다). 주스탯은 템플릿 `statBoost` (baseId 로 조회) 로 정하고, 그 다음 str/int/vit/
 * dex/agi 순, crit, slotBonus 로 고정한다. iOS `EquipmentStats` 미러.
 */

import type { Equipment, HeroBaseStats } from "@/types/uphero";
import { findTemplateByBaseId } from "@/data/upHeroEquipment";

export type StatKey = keyof HeroBaseStats;

/** 주스탯 후보 순서 (crit / slotBonus 제외). */
const CORE_ORDER: readonly StatKey[] = ["str", "int", "vit", "dex", "agi"] as const;

/** 스탯 key → 표시 라벨. */
export const STAT_LABEL: Record<StatKey, string> = {
  str: "STR",
  int: "INT",
  vit: "VIT",
  dex: "DEX",
  agi: "AGI",
  crit: "CRIT",
  slotBonus: "SLOT",
};

/**
 * 주스탯 key. 템플릿이 있으면 `statBoost`; 없으면(사진 부적·손상본) affix 가 아닌
 * core 스탯 중 값이 가장 큰 것 (동률은 CORE_ORDER 앞). 스탯이 없으면 null.
 */
export function getPrimaryStatKey(
  eq: Pick<Equipment, "baseId" | "stats" | "affix" | "affixes">,
): StatKey | null {
  if (eq.baseId) {
    const template = findTemplateByBaseId(eq.baseId);
    if (template) return template.statBoost as StatKey;
  }
  const affixSet = new Set<string>([
    ...(eq.affix ? [eq.affix] : []),
    ...(eq.affixes ?? []),
  ]);
  let best: StatKey | null = null;
  let bestVal = 0;
  for (const k of CORE_ORDER) {
    if (affixSet.has(k)) continue;
    const v = eq.stats[k] ?? 0;
    if (v > bestVal) {
      best = k;
      bestVal = v;
    }
  }
  if (best) return best;
  // affix 뿐인 손상본 — 그래도 값이 있는 첫 core 스탯.
  for (const k of CORE_ORDER) if ((eq.stats[k] ?? 0) > 0) return k;
  return null;
}

/**
 * 표시 순서로 정렬된 [key, value] 목록. 0 / null 값은 뺀다.
 *   1. 주스탯 · 2. 나머지 str/int/vit/dex/agi · 3. crit · 4. slotBonus
 */
export function orderedStatEntries(
  eq: Pick<Equipment, "baseId" | "stats" | "affix" | "affixes">,
): Array<[StatKey, number]> {
  const primary = getPrimaryStatKey(eq);
  const order: StatKey[] = [];
  if (primary) order.push(primary);
  for (const k of CORE_ORDER) if (k !== primary) order.push(k);
  order.push("crit", "slotBonus");
  const out: Array<[StatKey, number]> = [];
  for (const k of order) {
    const v = eq.stats[k];
    if (v == null || v === 0) continue;
    out.push([k, v]);
  }
  return out;
}

/** "+7%" (crit) / "+N" (그 외). */
export function formatStat(k: StatKey, v: number): string {
  return k === "crit" ? `+${v}%` : `+${v}`;
}
