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
import { emptyTalismanMods } from "@/lib/talismanSkills";

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
    description: "영웅 공격 +40%, 최대 HP -25%",
    apply(s) {
      // Phase 11c R2 — HP -30% 는 F30 weekly 에서 보스 1 타에 즉사 확정. -25% 로 완화
      //   (vit DR 감안 시 생존 가능). str +40% 유지 (이번 affix 의 정체성).
      s.hero.maxHp = Math.round(s.hero.maxHp * 0.75);
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
        s.talismanMods = emptyTalismanMods();
      }
      s.talismanMods.dodgeBonus += 0.15;
    },
  },
  {
    id: "bountiful_harvest",
    name: "풍요의 수확",
    description: "드롭률 +50%, 코인 +20%, 단 몬스터 HP +20%",
    apply(s) {
      // Phase 11c R4 — 이전 페널티 "XP -25%" 는 weekly F30 단일 보스전에서 효과 거의 없음
      //   (40-60 XP 중 12 감소). 동일 강도의 "몬스터 HP +20%" 로 전환 — 전투 시간
      //   길어져 time 자원 직접 체감 페널티.
      s.monsterHpMult = (s.monsterHpMult ?? 1) * 1.2;
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
      // 영웅 crit +15 — baseStats.crit 에 누적 (1 포인트 = 1% crit).
      s.hero.baseStats.crit += 15;
      // Phase 11c R1 — 몬스터 crit +15% runtime: rollEnemyOutcome 에서 참조.
      s.monsterCritBonus = 0.15;
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
    description: "체력 +30%, 단 적 공격 +35%",
    apply(s) {
      // Phase 11c R4 — atk 배율을 다른 affix 와 톤 통일 (iron_will 1.35, enemy_frenzy 1.25,
      //   weakened_start 1.15). 이전 1.5× 는 혼자 튀는 수치였고, R2 분석에서 "HP
      //   여유로 net buff" 였다가 R3 에서 잡혔는데 여전히 공격 배율만 outlier.
      //   "페널티+대형보상" 밴드의 상단 (1.35) 으로 수렴.
      s.hero.maxHp = Math.round(s.hero.maxHp * 1.3);
      s.hero.hp = s.hero.maxHp;
      s.monsterAtkMult = (s.monsterAtkMult ?? 1) * 1.35;
    },
  },
  {
    id: "chaos_treasures",
    name: "혼돈의 보물",
    description: "드롭 등급이 무작위 (저등급·고등급 모두 동일 확률)",
    apply(s) {
      // Phase 11c R1 — rollDropRarity 에서 flag 체크 → 4 등급 균등 분배.
      s.flattenDropRarity = true;
    },
  },
  {
    id: "weakened_start",
    name: "무너진 출발",
    description: "시작 체력 70%, 몬스터 공격 +15%",
    apply(s) {
      // Phase 11c R2 — 기존 50% 는 F30 weekly (stage 이동 없음) 에서 보스 1타 즉사.
      //   "점진적 회복" 도 runtime 미구현 → 순수 페널티. 70% 로 완화 + 대신 적 공격
      //   +15% 로 페널티 방향 전환 — F1-F30 일반 탐험에서도 일관된 난이도.
      s.hero.hp = Math.round(s.hero.maxHp * 0.7);
      s.monsterAtkMult = (s.monsterAtkMult ?? 1) * 1.15;
    },
  },
  {
    id: "long_march",
    name: "긴 행군",
    description: "휴식처 확률 +20%, 단 몬스터 HP +25%",
    apply(s) {
      // 페널티: monster HP +25% → 전투 길어짐
      s.monsterHpMult = 1.25;
      // Phase 11c R2 — 기존 +30% + chronomancer (time 0.75×) 조합 시 시간 자원 순증.
      //   +20% 로 조정 (기본 35% + 20% = 55%) → 시간 tradeoff 유지.
      s.restChanceBonus = 0.2;
    },
  },
];

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
