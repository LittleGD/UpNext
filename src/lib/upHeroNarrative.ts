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
 *
 * Phase 13c — i18n. 기존 단일 string 반환 외에 `heroAttackNarrativeI18n` /
 *   `monsterAttackNarrativeI18n` 이 { text, key, params } 를 반환해 LogEntry
 *   에 저장. CombatLog 는 key + params 를 현재 언어로 풀어 렌더. 한국어 fallback
 *   은 legacy save 호환 + i18n 키 누락 시 안전망.
 */

import type { CombatOutcome, Monster, NarrativeParams } from "@/types/uphero";
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

/** Phase 13c — i18n metadata 와 함께 묶인 narrative. */
export interface I18nNarrative {
  /** 한국어 legacy fallback */
  text: string;
  /** i18n key (없으면 text 그대로 렌더) */
  key?: string;
  /** key 를 t() 에 전달할 때 쓸 params. monsterTemplateId 포함 가능. */
  params?: NarrativeParams;
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
  return heroAttackNarrativeI18n(monster, outcome, damage).text;
}

/**
 * Phase 13c — i18n-ready variant. 한국어 text + i18n key + params 반환.
 */
export function heroAttackNarrativeI18n(
  monster: Monster,
  outcome: CombatOutcome,
  damage: number,
): I18nNarrative {
  switch (outcome) {
    case "miss":
      return { text: pick(HERO_MISS_LINES), key: "uphero.combat.narrative.heroMiss" };
    case "dodge":
      return {
        text: pick(MONSTER_DODGE_LINES[monster.kind]),
        key: "uphero.combat.narrative.monsterDodge",
        params: {
          monster: monster.name,
          monsterTemplateId: monster.templateId ?? "",
        },
      };
    case "crit": {
      const part = pick(MONSTER_BODY_PARTS[monster.kind].weak);
      const verb = pick(HERO_CRIT_VERBS);
      return {
        text: `치명타! 영웅이 ${monster.name}의 ${part}를 ${verb}. −${damage}`,
        key: "uphero.combat.narrative.heroCrit",
        params: {
          monster: monster.name,
          monsterTemplateId: monster.templateId ?? "",
          damage,
        },
      };
    }
    case "hit": {
      const part = pick(MONSTER_BODY_PARTS[monster.kind].normal);
      const verb = pick(HERO_HIT_VERBS);
      return {
        text: `영웅이 ${monster.name}의 ${part}를 ${verb}. −${damage}`,
        key: "uphero.combat.narrative.heroHit",
        params: {
          monster: monster.name,
          monsterTemplateId: monster.templateId ?? "",
          damage,
        },
      };
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
  return monsterAttackNarrativeI18n(monster, outcome, damage).text;
}

/**
 * Phase 13c — i18n-ready variant. 한국어 text + i18n key + params 반환.
 */
export function monsterAttackNarrativeI18n(
  monster: Monster,
  outcome: CombatOutcome,
  damage: number,
): I18nNarrative {
  const flavor = MONSTER_ATTACK_FLAVOR[monster.kind];
  switch (outcome) {
    case "miss":
      return {
        text: pick(MONSTER_MISS_LINES[monster.kind]),
        key: "uphero.combat.narrative.monsterMiss",
        params: {
          monster: monster.name,
          monsterTemplateId: monster.templateId ?? "",
        },
      };
    case "dodge":
      return { text: pick(HERO_DODGE_LINES), key: "uphero.combat.narrative.heroDodge" };
    case "crit": {
      const verb = pick(flavor.critVerbs);
      return {
        text: `치명타! ${monster.name}이(가) ${verb}. −${damage}`,
        key: "uphero.combat.narrative.enemyCrit",
        params: {
          monster: monster.name,
          monsterTemplateId: monster.templateId ?? "",
          damage,
        },
      };
    }
    case "hit": {
      const instrument = pick(flavor.instruments);
      const verb = pick(flavor.hitVerbs);
      return {
        text: `${monster.name}이(가) ${instrument} 영웅을 ${verb}. −${damage}`,
        key: "uphero.combat.narrative.enemyHit",
        params: {
          monster: monster.name,
          monsterTemplateId: monster.templateId ?? "",
          damage,
        },
      };
    }
  }
}
