/**
 * Up Hero — Phase 11c: 주간 악몽 던전 affix pool.
 *
 * 매주 월요일 0시, week id (ISO week) 를 seed 로 하나 pick. 전 유저가 같은 affix
 * 받음 — 공정한 주간 도전. affix 는 session 전체에 걸쳐 적용되는 global modifier.
 *
 * 설계:
 *   - affix 당 session 에 적용되는 mutation 함수 (hero stat 조정, time 조정, etc).
 *   - 일부는 위협적 (데미지 증폭) 일부는 유리 (시작 HP 부스트). "도전" 과 "보상" 의
 *     균형을 weekly mix-up 으로.
 *   - 리더보드 점수는 affix 에 따라 자연스러운 분포 형성 — 어려운 주는 전체
 *     평균 점수 낮음.
 */

import type { CombatSession } from "@/types/uphero";

export interface WeeklyAffix {
  id: string;
  name: string;
  description: string;
  /** createSession 직후 호출. session 을 자유롭게 mutate 가능. */
  apply(s: CombatSession): void;
}

/** 고정된 affix 목록 (11 개). id 가 리스트의 순서에 의존하지 않아 추가/제거 자유. */
export const WEEKLY_AFFIX_POOL: WeeklyAffix[] = [
  {
    id: "glass_cannon",
    name: "유리 대포",
    description: "영웅 공격 +40%, 그러나 최대 HP -30%",
    apply(s) {
      s.hero.maxHp = Math.round(s.hero.maxHp * 0.7);
      s.hero.hp = Math.min(s.hero.hp, s.hero.maxHp);
      // str +40% — base 기반
      s.hero.baseStats.str = Math.round(s.hero.baseStats.str * 1.4);
    },
  },
  {
    id: "enemy_frenzy",
    name: "적 광란",
    description: "몬스터 공격 +25%",
    apply() {
      // monster atk 스케일은 createMonsterForFloor 에서 affixId 를 읽어 처리.
      // 여기서는 no-op — affix id 기반 런타임 lookup 이 `applyWeeklyAffixToMonster` 에서.
    },
  },
  {
    id: "time_pressure",
    name: "시간의 압박",
    description: "탐험 시간 -30% (maxTime 감소)",
    apply(s) {
      s.maxTime = Math.round(s.maxTime * 0.7);
      s.time = Math.min(s.time, s.maxTime);
    },
  },
  {
    id: "blessing_of_haste",
    name: "민첩의 축복",
    description: "영웅 회피 +15%, agi +10",
    apply(s) {
      s.hero.baseStats.agi += 10;
      // dodge bonus 는 session.talismanMods 에 직접 가산
      if (!s.talismanMods) {
        // emptyTalismanMods 가 없어 인라인 생성 — lightweight path.
        s.talismanMods = {
          dodgeBonus: 0.15,
          enemyMissBonus: 0,
          critDmgBonus: 0,
          coinMult: 1,
          timeCostMult: 1,
          healEffectMult: 1,
          hpRegenEvery2Rounds: 0,
          extraDropChance: 0,
          legendDropBonus: 0,
          bossTimeRecover: 0,
          counterChance: 0,
          lowHpDmgBonus: 0,
          agiRoundAccum: 0,
          agiRoundCap: 0,
          classSkillCdReduce: 0,
          startXp: 0,
          startHpMult: 1,
          startHpFlat: 0,
        };
      } else {
        s.talismanMods.dodgeBonus += 0.15;
      }
    },
  },
  {
    id: "bountiful_harvest",
    name: "풍요의 수확",
    description: "드롭률 +30%, 코인 +20%",
    apply(s) {
      // activeBuffs 에 dropRate buff 추가 (getBuffBoost 로 읽힘)
      s.activeBuffs = [
        ...(s.activeBuffs ?? []),
        {
          description: "풍요의 수확 (주간 affix)",
          effects: [
            { kind: "special", type: "dropRate", value: 30 },
            { kind: "special", type: "coinBoost", value: 20 },
          ],
        },
      ];
    },
  },
  {
    id: "fragile_world",
    name: "깨지기 쉬운 세계",
    description: "모든 공격 crit 확률 +15% (양측)",
    apply() {
      // createMonsterForFloor + rollHeroOutcome 에서 affixId 기반 처리.
    },
  },
  {
    id: "dense_encounters",
    name: "빽빽한 조우",
    description: "몬스터 조우율 +20%, 이벤트 -10%",
    apply(s) {
      s.activeBuffs = [
        ...(s.activeBuffs ?? []),
        {
          description: "빽빽한 조우 (주간 affix)",
          effects: [{ kind: "special", type: "monsterFrequency", value: 20 }],
        },
      ];
    },
  },
  {
    id: "iron_will",
    name: "강철 의지",
    description: "영웅 HP +50%, 모든 stat +5",
    apply(s) {
      s.hero.maxHp = Math.round(s.hero.maxHp * 1.5);
      s.hero.hp = s.hero.maxHp;
      s.hero.baseStats.str += 5;
      s.hero.baseStats.int += 5;
      s.hero.baseStats.vit += 5;
      s.hero.baseStats.dex += 5;
      s.hero.baseStats.agi += 5;
    },
  },
  {
    id: "chaos_treasures",
    name: "혼돈의 보물",
    description: "드롭 rarity 분포 무작위 (normal~legend 동일 확률)",
    apply() {
      // rollDropRarity 가 affixId 기반 분기.
    },
  },
  {
    id: "slow_start",
    name: "느린 출발",
    description: "시작 HP 50%, 그러나 stage 당 HP +5 회복",
    apply(s) {
      s.hero.hp = Math.round(s.hero.maxHp * 0.5);
      // stage regen 은 층 이동 시 추가. affixId 기반 훅.
    },
  },
  {
    id: "generous_rest",
    name: "관대한 휴식",
    description: "휴식처 확률 +20% (treasure 시 55% rest)",
    apply() {
      // tickSession 의 treasure 분기에서 affixId 읽어 rest 확률 가산.
    },
  },
];

/** week id 기반 결정론적 pick — 모든 유저가 같은 affix */
export function pickWeeklyAffix(weekId: string): WeeklyAffix {
  // 간단한 hash — week string 의 각 char code 합 + 길이.
  let hash = 0;
  for (let i = 0; i < weekId.length; i++) {
    hash = (hash * 31 + weekId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % WEEKLY_AFFIX_POOL.length;
  return WEEKLY_AFFIX_POOL[idx];
}

/** affix id 로 lookup. 저장된 id 기반 런타임 처리 시 사용. */
export function getWeeklyAffixById(id: string): WeeklyAffix | null {
  return WEEKLY_AFFIX_POOL.find((a) => a.id === id) ?? null;
}
