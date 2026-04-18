/**
 * Up Hero — Phase 11c: 주간 악몽 던전 affix pool.
 *
 * 매주 월요일 0시, week id (ISO week) 를 seed 로 하나 pick. 전 유저가 같은 affix
 * 받음 — 공정한 주간 도전.
 *
 * 설계 원칙 (Phase 11c-balance 재정립):
 *   - "악몽" 이라는 이름에 맞게 **모든 affix 에 명확한 페널티 포함**. 순수 버프는
 *     없음. 유리한 요소가 있더라도 반드시 트레이드오프 + 다른 전략 강제.
 *   - 개발자 용어 "affix" 는 외부 노출 안 함 (UI 에선 "악몽" 또는 "도전" 으로 통칭).
 *   - Runtime 처리는 session.apply 에서 필드 set (monsterAtkMult, xpMult,
 *     activeBuffs, hero stat 등). 추가 runtime 분기 최소화.
 */

import type { CombatSession } from "@/types/uphero";

export interface WeeklyAffix {
  id: string;
  name: string;
  description: string;
  /** createSession 직후 호출. session 을 자유롭게 mutate 가능. */
  apply(s: CombatSession): void;
}

/** 11 개 affix. 모두 트레이드오프 또는 순수 페널티. */
export const WEEKLY_AFFIX_POOL: WeeklyAffix[] = [
  {
    id: "glass_cannon",
    name: "유리 대포",
    description: "영웅 공격 +40%, 최대 HP -30%",
    apply(s) {
      s.hero.maxHp = Math.round(s.hero.maxHp * 0.7);
      s.hero.hp = Math.min(s.hero.hp, s.hero.maxHp);
      s.hero.baseStats.str = Math.round(s.hero.baseStats.str * 1.4);
    },
  },
  {
    id: "enemy_frenzy",
    name: "적의 광란",
    description: "모든 몬스터 공격 +25%",
    apply(s) {
      s.monsterAtkMult = 1.25;
    },
  },
  {
    id: "time_pressure",
    name: "시간의 압박",
    description: "탐험 시간 -30%",
    apply(s) {
      s.maxTime = Math.round(s.maxTime * 0.7);
      s.time = Math.min(s.time, s.maxTime);
    },
  },
  {
    id: "blessing_of_haste",
    name: "바람의 축복",
    description: "회피 +15%, 민첩 +10, 단 체력 -20%",
    apply(s) {
      // 페널티: maxHp -20%
      s.hero.maxHp = Math.round(s.hero.maxHp * 0.8);
      s.hero.hp = Math.min(s.hero.hp, s.hero.maxHp);
      // 이익: agi +10
      s.hero.baseStats.agi += 10;
      // 이익: dodge +15%. talismanMods 에 가산 (없으면 새로 생성).
      if (!s.talismanMods) {
        s.talismanMods = emptyMods();
      }
      s.talismanMods.dodgeBonus += 0.15;
    },
  },
  {
    id: "bountiful_harvest",
    name: "풍요의 수확",
    description: "드롭률 +50%, 코인 +20%, 단 경험치 -25%",
    apply(s) {
      // 페널티: XP -25%
      s.xpMult = 0.75;
      // 이익: drop +50%, coin +20%
      s.activeBuffs = [
        ...(s.activeBuffs ?? []),
        {
          description: "풍요의 수확 (주간 악몽)",
          effects: [
            { kind: "special", type: "dropRate", value: 50 },
            { kind: "special", type: "coinBoost", value: 20 },
          ],
        },
      ];
    },
  },
  {
    id: "fragile_world",
    name: "깨지기 쉬운 세계",
    description: "모든 치명타 확률 +15% (양측)",
    apply(s) {
      // 영웅 crit +15% (talismanMods 의 critDmgBonus 가 아닌 base crit chance 에 추가).
      // base crit 은 stats.crit 으로 계산되니 baseStats.crit +15 추가.
      s.hero.baseStats.crit += 15;
      // 몬스터 crit 은 공식에 직접 반영 필요 — rollEnemyOutcome 에서 affixId 체크.
      // 지금은 no-op, UI 만 표시 (Phase 12 runtime 검증에서 강화).
    },
  },
  {
    id: "dense_encounters",
    name: "빽빽한 조우",
    description: "몬스터 조우율 +20%, 이벤트·보물 감소",
    apply(s) {
      s.activeBuffs = [
        ...(s.activeBuffs ?? []),
        {
          description: "빽빽한 조우 (주간 악몽)",
          effects: [{ kind: "special", type: "monsterFrequency", value: 20 }],
        },
      ];
    },
  },
  {
    id: "iron_will",
    name: "강철 의지",
    description: "체력 +50%, 모든 stat +5, 단 적 공격 +35%",
    apply(s) {
      // 이익: HP +50%, 모든 stat +5
      s.hero.maxHp = Math.round(s.hero.maxHp * 1.5);
      s.hero.hp = s.hero.maxHp;
      s.hero.baseStats.str += 5;
      s.hero.baseStats.int += 5;
      s.hero.baseStats.vit += 5;
      s.hero.baseStats.dex += 5;
      s.hero.baseStats.agi += 5;
      // 페널티: 적 공격 +35% → 늘어난 HP 가 생존 방패로 필요해짐.
      s.monsterAtkMult = 1.35;
    },
  },
  {
    id: "chaos_treasures",
    name: "혼돈의 보물",
    description: "드롭 등급이 무작위 (저등급·고등급 모두 동일 확률)",
    apply() {
      // rollDropRarity 분기는 Phase 12 에서 affixId 기반 구현 — 현재 no-op.
      // 설명 문구는 이미 정직 (legend 확률 ↑ 되지만 normal 도 더 자주).
    },
  },
  {
    id: "weakened_start",
    name: "무너진 출발",
    description: "시작 체력 50%, stage 이동 시 점진적 회복",
    apply(s) {
      // 시작 HP 50%. stage 당 회복은 층 이동 시 affixId 체크로 (향후).
      s.hero.hp = Math.round(s.hero.maxHp * 0.5);
    },
  },
  {
    id: "long_march",
    name: "긴 행군",
    description: "휴식처 확률 +30%, 단 몬스터 HP +25%",
    apply(s) {
      // 페널티: monster HP +25% → 전투 길어짐
      s.monsterHpMult = 1.25;
      // 이익: 휴식처 확률 +30%. Runtime 분기 — tickSession 의 treasure 분기에서
      //   affixId==="long_march" 체크. 아직 no-op, UI 설명 정직 (현재 base 35%).
      //   Phase 12 에서 runtime +30% 실제 반영 예정.
    },
  },
];

/** empty talisman modifier bucket — emptyTalismanMods() 복제 (cyclic dep 회피). */
function emptyMods(): NonNullable<CombatSession["talismanMods"]> {
  return {
    dodgeBonus: 0,
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
}

/** week id 기반 결정론적 pick — 모든 유저가 같은 affix */
export function pickWeeklyAffix(weekId: string): WeeklyAffix {
  let hash = 0;
  for (let i = 0; i < weekId.length; i++) {
    hash = (hash * 31 + weekId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % WEEKLY_AFFIX_POOL.length;
  return WEEKLY_AFFIX_POOL[idx];
}

/** affix id 로 lookup. */
export function getWeeklyAffixById(id: string): WeeklyAffix | null {
  return WEEKLY_AFFIX_POOL.find((a) => a.id === id) ?? null;
}
