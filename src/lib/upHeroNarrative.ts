/**
 * Up Hero — Phase 3: 전투 narrative 생성기.
 *
 * 템플릿:
 *  - 영웅 공격: `{critPrefix}영웅이 {monster.name}의 {bodyPart}를 {verb}. −{dmg}`
 *  - 몬스터 공격: `{critPrefix}{monster.name}이(가) {instrument} 영웅을 {verb}. −{dmg}`
 *  - 회피/미스: 단일 문장 풀에서 pick
 *
 * `critPrefix` = `"치명타! "` 또는 빈 문자열.
 *
 * 순수 함수 — same outcome + damage 조합이어도 pool 에서 random pick 하므로 매번 다른 문장 생성.
 * CombatSession.log 에 저장할 때는 1회 호출 결과를 persist 해서 재렌더 시 일관성 유지.
 */

import type { CombatOutcome, Monster } from "@/types/uphero";
import {
  HERO_HIT_VERBS,
  HERO_CRIT_VERBS,
  HERO_MISS_LINES,
  HERO_DODGE_LINES,
  MONSTER_ATTACK_FLAVOR,
  MONSTER_BODY_PARTS,
  MONSTER_DODGE_LINES,
  MONSTER_MISS_LINES,
} from "@/data/upHeroCombatFlavor";

/** 배열에서 random 요소 pick */
function pick<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 영웅이 몬스터를 공격 — outcome + damage → narrative 생성.
 *
 * @param monster 대상 몬스터 (이름, kind 사용)
 * @param outcome "hit" | "crit" | "dodge" | "miss"
 *                "dodge" 면 방어자(몬스터) 가 피함
 *                "miss" 면 공격자(영웅) 가 허탕침
 * @param damage 가한 피해 (dodge/miss 면 0)
 */
export function heroAttackNarrative(
  monster: Monster,
  outcome: CombatOutcome,
  damage: number,
): string {
  switch (outcome) {
    case "miss":
      return pick(HERO_MISS_LINES);
    case "dodge":
      return pick(MONSTER_DODGE_LINES[monster.kind]);
    case "crit": {
      const part = pick(MONSTER_BODY_PARTS[monster.kind].weak);
      const verb = pick(HERO_CRIT_VERBS);
      return `치명타! 영웅이 ${monster.name}의 ${part}를 ${verb}. −${damage}`;
    }
    case "hit": {
      const part = pick(MONSTER_BODY_PARTS[monster.kind].normal);
      const verb = pick(HERO_HIT_VERBS);
      return `영웅이 ${monster.name}의 ${part}를 ${verb}. −${damage}`;
    }
  }
}

/**
 * 몬스터가 영웅을 공격 — outcome + damage → narrative 생성.
 *
 * @param monster 공격 중인 몬스터 (이름, kind 사용)
 * @param outcome "hit" | "crit" | "dodge" | "miss"
 *                "dodge" 면 방어자(영웅) 가 피함
 *                "miss" 면 공격자(몬스터) 가 허탕침
 * @param damage 가한 피해 (dodge/miss 면 0)
 */
export function monsterAttackNarrative(
  monster: Monster,
  outcome: CombatOutcome,
  damage: number,
): string {
  const flavor = MONSTER_ATTACK_FLAVOR[monster.kind];
  switch (outcome) {
    case "miss":
      return pick(MONSTER_MISS_LINES[monster.kind]);
    case "dodge":
      return pick(HERO_DODGE_LINES);
    case "crit": {
      const verb = pick(flavor.critVerbs);
      return `치명타! ${monster.name}이(가) ${verb}. −${damage}`;
    }
    case "hit": {
      const instrument = pick(flavor.instruments);
      const verb = pick(flavor.hitVerbs);
      return `${monster.name}이(가) ${instrument} 영웅을 ${verb}. −${damage}`;
    }
  }
}
