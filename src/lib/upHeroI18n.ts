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
import type { Monster } from "@/types/uphero";

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
