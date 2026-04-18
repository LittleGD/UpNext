/**
 * Up Hero — 데이터 레이어 i18n 헬퍼.
 *
 * 몬스터 / 스킬 / 장비 등 **데이터로 정의된** 이름/설명을 현재 언어로 표시하기
 * 위한 helper. `useTranslation` hook 은 컴포넌트 내부에서만 쓰므로, 컴포넌트
 * 바깥 (lib / data 계층) 에서는 이 파일의 `t()` direct import 를 사용한다.
 *
 * 키 규칙:
 *  - 몬스터: `uphero.monster.<templateId>`      예: "fit_wolf"
 *  - 스킬 이름: `uphero.skill.<skillId>.name`    예: "warrior_smash_t1"
 *  - 스킬 설명: `uphero.skill.<skillId>.desc`
 *  - 자원 이름: `uphero.resource.<classType>`   예: "warrior" → "분노"
 *  - 장비 이름: `uphero.equip.<baseId>.name`    예: "self_control_sword"
 *
 * legacy save 호환:
 *  - 번역 키가 없으면 저장된 한국어 fallback 반환.
 *  - Monster.templateId / Skill.id 등이 누락된 legacy entity 는 .name 그대로.
 */

import { t as dictT } from "@/i18n";
import type { Language } from "@/types/game";
import type { DictKey } from "@/i18n";
import type {
  CardBuff,
  ClassType,
  DungeonId,
  Monster,
  SpecialEffect,
} from "@/types/uphero";
import type { Category, Rarity } from "@/types/card";

/**
 * Monster 의 다국어 이름 반환.
 *  - templateId 가 있으면 `uphero.monster.<id>` 조회
 *  - 키 미존재 / 한국어 설정 / legacy entity 면 `.name` 그대로
 */
export function monsterName(monster: Monster, language: Language): string {
  if (!monster.templateId) return monster.name;
  return monsterNameById(monster.templateId, monster.name, language);
}

/**
 * Template id + 한국어 fallback 으로 직접 다국어 이름 반환.
 *   MonsterTemplate 를 직접 다루는 도감 / 리스트 UI 용.
 */
export function monsterNameById(
  templateId: string,
  koreanFallback: string,
  language: Language,
): string {
  const key = `uphero.monster.${templateId}` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? koreanFallback : translated;
}

/**
 * Phase 13c — 몬스터 lore 다국어 반환.
 *  `uphero.monster.<templateId>.lore` 조회, 없으면 한국어 fallback.
 *  fallback 은 보통 `getMonsterLore(id, kind)` 결과 (MONSTER_LORE or kind fallback).
 */
export function monsterLore(
  templateId: string,
  koreanFallback: string,
  language: Language,
): string {
  const key = `uphero.monster.${templateId}.lore` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? koreanFallback : translated;
}

/**
 * 스킬 이름 / 설명 다국어 반환.
 *  `uphero.skill.<id>.name` / `.desc` 조회.
 */
export function skillName(
  skillId: string,
  koreanFallback: string,
  language: Language,
): string {
  const key = `uphero.skill.${skillId}.name` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? koreanFallback : translated;
}

export function skillDesc(
  skillId: string,
  koreanFallback: string,
  language: Language,
): string {
  const key = `uphero.skill.${skillId}.desc` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? koreanFallback : translated;
}

/**
 * 클래스 자원 이름 (분노/마나/기 ...).
 */
export function resourceName(classType: string, language: Language): string {
  const key = `uphero.resource.${classType}` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? "" : translated;
}

/**
 * Phase 12 i18n framework — 이벤트 텍스트 번역 헬퍼.
 *
 * ChoiceOption.labelKey / ChoiceOutcome.resultTextKey / DungeonEvent.promptKey
 * 중 설정된 것은 i18n 에서 조회, 없으면 한국어 literal 그대로 반환.
 *
 * 이벤트 데이터 자체는 변경하지 않고 번역 인프라만 준비. 실제 번역은 차후
 * i18n 파일에 key-value 추가로 점진적 진행.
 */
export function flavorText(
  fallback: string,
  key: string | undefined,
  language: Language,
): string {
  if (!key) return fallback;
  const translated = dictT(key as DictKey, language);
  return translated === key ? fallback : translated;
}

/* ────────────────────────────────────────────
 * Phase 13a — 데이터 레이어 확장 헬퍼
 *
 * 던전 / 클래스 / 카테고리 / 장비 / 특수효과 / 카드 버프 description 까지
 * 일괄 i18n 통과시키는 함수들. 컴포넌트는 *.name 직접 사용 대신 이 헬퍼들을
 * 호출하면 자동으로 현재 언어로 번역됨 (legacy save 한국어 fallback).
 * ──────────────────────────────────────────── */

/** 던전 이름 — `dungeon.name` 대신 호출 */
export function dungeonName(
  dungeonId: DungeonId,
  koreanFallback: string,
  language: Language,
): string {
  const key = `uphero.dungeon.${dungeonId}.name` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? koreanFallback : translated;
}

/** 클래스 이름 (전사 / 마법사 ...) */
export function className(classType: ClassType, language: Language): string {
  const key = `uphero.class.${classType}.name` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? classType : translated;
}

/** 클래스 패시브 한 줄 설명 */
export function classPassive(
  classType: ClassType,
  koreanFallback: string,
  language: Language,
): string {
  const key = `uphero.class.${classType}.passive` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? koreanFallback : translated;
}

/** 카테고리 라벨 (운동 / 학습 / ...) — 친화 표기 등에 사용 */
export function categoryLabel(
  category: Category,
  language: Language,
): string {
  const key = `uphero.category.${category}` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? category : translated;
}

/** Rarity prefix — "빛나는 ", "전설적 " 등 (말미 공백 포함) */
export function rarityPrefix(rarity: Rarity, language: Language): string {
  const key = `uphero.rarityPrefix.${rarity}` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? "" : translated;
}

/** Affix stat label — "민첩", "체력", ... 그리고 " of {stat}" 풀네임 */
export function affixStatLabel(
  stat: string,
  language: Language,
): string {
  const key = `uphero.affixStat.${stat}` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? stat : translated;
}

export function affixSuffix(stat: string, language: Language): string {
  const statName = affixStatLabel(stat, language);
  // affixSuffix 키는 " of {stat}" 형식
  const tmpl = dictT("uphero.affixSuffix" as DictKey, language);
  return tmpl.replace("{stat}", statName);
}

/**
 * 장비 baseName i18n. 컴포넌트는 `equipment.name` 대신 이 헬퍼로 표시.
 *  - 저장된 name 에서 rarity prefix 를 떼고 base id 를 추출하기 어려우므로,
 *    호출자는 별도로 baseId 를 알고 있어야 함 (장비 템플릿 기반).
 */
export function equipmentNameById(
  baseId: string,
  koreanFallback: string,
  language: Language,
): string {
  const key = `uphero.equip.${baseId}.name` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? koreanFallback : translated;
}

/** 장비 flavor 1줄 */
export function equipmentFlavorById(
  baseId: string,
  koreanFallback: string | undefined,
  language: Language,
): string {
  if (!baseId) return koreanFallback ?? "";
  const key = `uphero.equip.${baseId}.flavor` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? (koreanFallback ?? "") : translated;
}

/** 특수효과 한 줄 — "드롭 +10%" 같은 말 */
export function describeSpecialEffect(
  type: SpecialEffect,
  value: number,
  language: Language,
): string {
  const sign = value >= 0 ? "+" : "";
  const tmpl = dictT(`uphero.special.${type}` as DictKey, language);
  // value 는 음수면 - 가 붙어있으니 sign 은 + 만 붙임
  return tmpl
    .replace("{sign}", sign)
    .replace("{value}", String(value));
}

/**
 * 카드 버프 description 다국어 빌드.
 *
 * 카드 버프는 effects 배열 (stat / special / affinity) 로 구성되며,
 * 한국어에선 "STR +6 · VIT +3 · 운동 던전 1.3배" 식으로 합성됨.
 * 다국어로 풀려면 각 effect 를 언어별로 빌드 후 ` · ` 로 join.
 */
export function describeCardBuff(
  buff: CardBuff,
  language: Language,
): string {
  const parts: string[] = [];

  for (const eff of buff.effects) {
    if (eff.kind === "stat") {
      // stat: { str: 6, vit: 3 } → "STR +6 · VIT +3"
      // 단 모든 스탯이 동일 값이면 "모든 스탯 +N" 패턴
      const entries = Object.entries(eff.stats).filter(([, v]) => v != null);
      if (entries.length === 0) continue;

      const allSame =
        entries.length >= 5 &&
        entries.every(([, v]) => v === entries[0][1]);

      if (allSame && entries[0][1] != null) {
        const tmpl = dictT(
          "uphero.cardBuff.allStats" as DictKey,
          language,
        );
        parts.push(tmpl.replace("{value}", String(entries[0][1])));
      } else {
        for (const [k, v] of entries) {
          if (v == null || v === 0) continue;
          const sign = v > 0 ? "+" : "";
          const isCrit = k === "crit";
          parts.push(`${k.toUpperCase()} ${sign}${v}${isCrit ? "%" : ""}`);
        }
      }
    } else if (eff.kind === "special") {
      parts.push(describeSpecialEffect(eff.type, eff.value, language));
    } else if (eff.kind === "affinity") {
      const cat = categoryLabel(eff.category as Category, language);
      const tmpl = dictT(
        "uphero.cardBuff.affinity" as DictKey,
        language,
      );
      parts.push(
        tmpl.replace("{category}", cat).replace("{mult}", String(eff.multiplier)),
      );
    }
  }

  return parts.join(" · ");
}

/** Phase 13b — 주간 affix 이름 + 설명 다국어 */
export function weeklyAffixName(
  affixId: string,
  koreanFallback: string,
  language: Language,
): string {
  const key = `uphero.affix.${affixId}.name` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? koreanFallback : translated;
}

export function weeklyAffixDescription(
  affixId: string,
  koreanFallback: string,
  language: Language,
): string {
  const key = `uphero.affix.${affixId}.description` as DictKey;
  const translated = dictT(key, language);
  return translated === key ? koreanFallback : translated;
}
