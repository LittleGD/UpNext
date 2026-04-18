/**
 * Up Hero — 전투 해소 + 세션 로그 생성기.
 *
 * 설계:
 *  - tickSession() 1 호출 = 1 "step" (narrative / encounter / combat round / floor / event 중 하나)
 *  - choice 만나면 session.status = "awaitingChoice" 로 정지, 사용자 resolveChoice 호출 대기
 *  - 전투 공식: damage = max(1, atk - def + random[-3..3]) / 회피 (agi 기반) / 크리 (random)
 */

import type {
  ClassType,
  CombatOutcome,
  CombatSession,
  CardBuff,
  Hero,
  HeroBaseStats,
  LogEntry,
  Monster,
  Equipment,
  ChoiceOption,
  ChoiceEffect,
  SessionEndReason,
  SpecialEffect,
} from "@/types/uphero";
import {
  computeEffectiveStats,
  CLASS_RESOURCE,
  CLASS_RESOURCE_MAX,
  type ResourceEvent,
} from "@/types/uphero";
import { createMonsterForFloor } from "@/data/upHeroMonsters";
import {
  pickNarrative,
  pickTreasureDescription,
  pickEvent,
  pickRestDescription,
} from "@/data/upHeroFlavor";
import { rollEquipmentDrop, rollDropRarity } from "@/data/upHeroEquipment";
import { DUNGEONS } from "@/data/upHeroDungeons";
import {
  heroAttackNarrative,
  monsterAttackNarrative,
} from "@/lib/upHeroNarrative";
import { maybeFireSkill, advanceSkillCounters } from "@/lib/classSkills";
import {
  collectTalismanMods,
  applyTalismanSkillStartEffects,
  emptyTalismanMods,
  type TalismanModifiers,
} from "@/lib/talismanSkills";
import { getWeeklyAffixById } from "@/data/weeklyAffixes";

/**
 * Phase 4c.1 → 11a rebalance — 탐험 시간 리소스.
 *
 * 이전 밸런스 (baseTime=100, floor=5, combat=2, boss=8) 는 F30 까지 도달 자체가
 * 거의 불가능 ("던전 끝까지 제시간안에 절대 못감"). 또한 보스전 rounds 가 8/round
 * 로 소모되어 보스 싸우다 중도 time-out 이 빈번.
 *
 * 새 밸런스 (시뮬레이션 기준 F30 도달 margin 30+ 남음):
 *   - baseTime 220 (기존 100 에서 +120).
 *   - combatRound 1 (기존 2)
 *   - boss 0 (기존 8) — 보스전은 시간 일시정지. "정면 승부" 로 격상.
 *   - floor 3 (기존 5) — 29 floor 이동 = 87 time (기존 145 → 40% 절감).
 *   - narrative 1 / encounter 2 / treasure 1 / choice 1 (세부 완화).
 *
 * 추가로 treasure 이벤트 35% 확률 "휴식처" 변주 (+10~15 time 회복). F30 끝까지
 * 정석 플레이로 도달하려면 이 회복 이벤트에 의존하게 돼서 리소스 관리 긴장감 유지.
 */
const BASE_EXPEDITION_TIME = 220;
const TIME_COST = {
  narrative: 1,
  encounter: 2,
  treasure: 1,
  floor: 3,
  combatRound: 1,
  boss: 0, // 보스전은 시간 소모 없음 — 정면 승부
  choice: 1,
} as const;

/**
 * 세션 시작 — 빈 log 로 생성.
 *
 * Phase 4b.3: activeBuffs 를 hero 스냅샷에 적용.
 *  - stat 버프: baseStats 에 합산 (affinity 던전이면 multiplier 배)
 *  - healStart: maxHp + hp 증가
 *  - xpBoost/coinBoost/dropRate/critBonus/monsterFrequency 는 tick 중 참조용으로 activeBuffs 에 저장
 */
export interface CreateSessionOptions {
  /** Phase 11c — NG+ 레벨 스냅샷. createMonsterForFloor / rollDropRarity 에서 참조. */
  ngPlusLevel?: number;
  /** Phase 11c — 주간 악몽 던전 모드 여부. */
  isWeeklyVariant?: boolean;
  /** Phase 11c — 주간 affix id (isWeeklyVariant=true 일 때만 의미). */
  weeklyAffixId?: string;
}

export function createSession(
  dungeonId: CombatSession["dungeonId"],
  hero: Hero,
  startFloor: number,
  activeBuffs?: CardBuff[],
  options?: CreateSessionOptions,
): CombatSession {
  const buffedHero = applyStatAndHealBuffs(hero, activeBuffs ?? [], dungeonId);
  // Phase 11c R4 — affix apply 를 class start effects 앞으로 이동. 이유:
  //   priest 의 `+50 flat HP` + iron_will 의 `×1.3 maxHp` 가 순서에 따라 불공평.
  //   기존: priest_bonus 50 포함한 HP 에 ×1.3 적용 → priest 만 초과 이득.
  //   신규: iron_will ×1.3 먼저 → 그다음 모든 클래스 동일하게 priest +50 flat.
  // Phase 11b — talisman passive skill modifier 집계는 class effect 전에도 계산 가능
  //   (hero.equipped.talisman 기반). 아래에서 재사용.
  const talismanMods = collectTalismanMods(buffedHero);

  const maxTime = BASE_EXPEDITION_TIME;
  const session: CombatSession = {
    dungeonId,
    startFloor,
    currentFloor: startFloor,
    log: [
      {
        type: "narrative",
        text: `${DUNGEONS[dungeonId].name} — Floor ${startFloor} 에 도착했다.`,
        timestamp: Date.now(),
      },
      {
        type: "floor",
        from: 0,
        to: startFloor,
        timestamp: Date.now(),
      },
    ],
    hero: buffedHero, // class start 는 affix 적용 뒤에.
    rewards: { xp: 0, coins: 0, drops: [] },
    status: "active",
    speed: 1,
    activeBuffs: activeBuffs && activeBuffs.length > 0 ? activeBuffs : undefined,
    time: maxTime,
    maxTime,
    talismanMods,
    extraDropAvailable: talismanMods.extraDropChance > 0,
    talismanAgiStack: 0,
    roundCounter: 0,
    // Phase 11c — NG+ / weekly variant flags 저장.
    ngPlusLevel: options?.ngPlusLevel ?? 0,
    isWeeklyVariant: options?.isWeeklyVariant,
    weeklyAffixId: options?.weeklyAffixId,
    startedAt: Date.now(),
  };

  // Phase 11c — weekly affix 적용 (glass_cannon / time_pressure / iron_will 등).
  //   session 생성 후 mutate 방식. runtime affix 는 affixId 기반 런타임 분기.
  if (options?.isWeeklyVariant && options.weeklyAffixId) {
    const affix = getWeeklyAffixById(options.weeklyAffixId);
    if (affix) affix.apply(session);
  }

  // Phase 5c.2 — class start 효과 (priest +50 maxHp, illusionist crit) 를 affix 뒤에.
  //   R4 순서 변경으로 priest +50 은 "모든 클래스가 받는 flat +50" 으로 정규화.
  session.hero = applyClassStartEffects(session.hero);

  // Phase 11b — talisman start 효과 (startHpMult/Flat, startXp) 는 class start 뒤 (최후).
  //   "안식" skill (startHpMult 110%) 은 affix + class 결과에 곱해져 최종 HP 결정.
  applyTalismanSkillStartEffects(session, talismanMods);

  return session;
}

/** 세션의 talismanMods 를 안전하게 꺼냄 (undefined 대응). */
function sessionMods(s: CombatSession): TalismanModifiers {
  return s.talismanMods ?? emptyTalismanMods();
}

/**
 * Phase 12d — 클래스 자원 획득. 각 이벤트 (attack/hit/dodge/heal 등) 시 호출.
 *   classType null 이면 no-op. 없는 클래스는 해당 이벤트 gain 0 → no-op.
 *   cap = CLASS_RESOURCE_MAX (100).
 *
 *   usage: `gainClassResource(s, "attack")` — combat.ts 각 hook 에서 호출.
 */
export function gainClassResource(
  s: CombatSession,
  event: ResourceEvent,
): void {
  const cls = s.hero.classType;
  if (!cls) return;
  const spec = CLASS_RESOURCE[cls];
  const amount = spec.gain[event];
  if (!amount) return;
  const cur = s.classResource ?? 0;
  s.classResource = Math.min(CLASS_RESOURCE_MAX, cur + amount);
}

/**
 * Phase 4c.1 — 시간 소모 헬퍼.
 * delta 는 음수(소모) 또는 양수(회복). 0 이하로 떨어지면 세션 종료.
 * 반환값 true = 세션이 시간 소진으로 종료됨.
 *
 * Phase 5c.2: chronomancer class 는 소모량 (음수 delta) 에 0.75x 곱.
 * 회복 (양수 delta) 은 그대로 반영.
 *
 * Phase 5c-fix #5: chronomancer 0.75x 가 -3.75 같은 소수점 값을 만들어
 * s.time 이 fractional 로 누적되던 문제 해결. round 처리로 정수 유지.
 */
function consumeTime(s: CombatSession, delta: number): boolean {
  let effectiveDelta = delta;
  if (delta < 0) {
    // Phase 11b — chronomancer class mult × talisman timeCostMult.
    //   예: chronomancer (0.75) + productivity +5 (절약 0.95) → 0.7125 소모.
    const mods = sessionMods(s);
    effectiveDelta = Math.round(
      delta * classTimeMult(s.hero.classType) * mods.timeCostMult,
    );
    // 최소 -1 보장 — multi mult 로 -1 이 0 에 반올림되면 cost 가 사라져버림
    if (delta < 0 && effectiveDelta === 0) effectiveDelta = -1;
  }
  s.time = Math.max(0, Math.min(s.maxTime, s.time + effectiveDelta));
  if (s.time <= 0 && s.status === "active") {
    endSession(s, "timeExpired", "탐험 시간이 소진됐다");
    return true;
  }
  return false;
}

/**
 * 세션 종료 — 로그에 sessionEnd 엔트리 추가하고 status=completed.
 * reason 별로 SessionResultModal 과 CombatLog 가 문구를 다르게 렌더.
 */
function endSession(
  s: CombatSession,
  reason: SessionEndReason,
  detail?: string,
): void {
  s.log.push({
    type: "sessionEnd",
    reason,
    detail,
    timestamp: Date.now(),
  });
  s.status = "completed";
}

/**
 * Buff 의 stat / healStart 효과를 hero snapshot 에 반영.
 *  - stat buff: baseStats 의 각 키에 합산
 *  - affinity 가 같은 카테고리 던전이면 그 buff 의 stat 만 multiplier 적용
 *  - healStart: maxHp 와 hp 둘 다 증가 (세션 끝까지 유지되는 내구력 버프)
 */
function applyStatAndHealBuffs(
  hero: Hero,
  buffs: CardBuff[],
  dungeonId: CombatSession["dungeonId"],
): Hero {
  const newBaseStats: HeroBaseStats = { ...hero.baseStats };
  let totalHealStart = 0;

  for (const buff of buffs) {
    // 이 buff 에 affinity 효과가 있고 현재 던전과 같은 카테고리면 stat 를 곱셈
    const affinity = buff.effects.find(
      (e): e is { kind: "affinity"; category: CombatSession["dungeonId"]; multiplier: number } =>
        e.kind === "affinity",
    );
    const mult =
      affinity && affinity.category === dungeonId ? affinity.multiplier : 1;

    for (const effect of buff.effects) {
      if (effect.kind === "stat") {
        for (const [k, v] of Object.entries(effect.stats)) {
          if (v == null) continue;
          const key = k as keyof HeroBaseStats;
          newBaseStats[key] += Math.round((v as number) * mult);
        }
      }
      if (effect.kind === "special" && effect.type === "healStart") {
        totalHealStart += effect.value;
      }
      // critBonus special → baseStats.crit 에 합산 (rollHeroOutcome 이 stats.crit 사용)
      if (effect.kind === "special" && effect.type === "critBonus") {
        newBaseStats.crit += effect.value;
      }
    }
  }

  const newMaxHp = hero.maxHp + totalHealStart;
  return {
    ...hero,
    baseStats: newBaseStats,
    maxHp: newMaxHp,
    hp: newMaxHp, // 세션 시작 시 full HP + healStart 보너스 포함
  };
}

/* ══════════════════════════════════════════════════════════════════════
 * Phase 5c.2 — Class 패시브 스킬
 *
 * 8 class × 1 패시브 (MVP). 일부는 세션 시작 시점 (priest/illusionist/
 * chronomancer), 나머지는 runtime 루프에서 반영 (warrior/mage/monk/druid/bard).
 * ══════════════════════════════════════════════════════════════════════ */

const WARRIOR_REGEN_PER_ROUND = 2; // HP +2/round
const MAGE_XP_MULT = 1.2;
const MONK_DODGE_BONUS = 0.1;
const DRUID_HEAL_MULT = 1.3;
const BARD_COIN_MULT = 1.25;
const CHRONOMANCER_TIME_MULT = 0.75; // 25% 감소
/**
 * Phase 11c R4 R2 — priest 의 start HP bonus 를 flat 50 → 20% percentage 로 변경.
 *   이유: glass_cannon (maxHp ×0.75) 같은 percentage affix 와 결합 시 flat +50 이
 *   페널티를 사실상 상쇄해 priest 만 affix 무력화. % 면 glass_cannon priest 도
 *   동일하게 -25% 체감 (페널티 + 보너스 모두 비율 적용).
 */
const PRIEST_START_HP_MULT = 1.2;
const ILLUSIONIST_CRIT_BONUS = 8; // percentage points (on stats.crit)

/**
 * 세션 시작 시점 class 패시브 적용.
 * - priest: maxHp + 50 (hp 는 max 로 초기화됨)
 * - illusionist: baseStats.crit + 8
 * - chronomancer: maxTime 은 여기서 건드리지 않음 (consumeTime 에서 cost 조정)
 *
 * classType null 이면 no-op. Pure — 원본 hero mutate 안함.
 */
function applyClassStartEffects(hero: Hero): Hero {
  const cls = hero.classType;
  if (!cls) return hero;
  const newHero = { ...hero, baseStats: { ...hero.baseStats } };
  if (cls === "priest") {
    // Phase 11c R4 R2 — percentage 로 변경. affix 와 공평하게 스케일.
    newHero.maxHp = Math.round(newHero.maxHp * PRIEST_START_HP_MULT);
    newHero.hp = newHero.maxHp;
  }
  if (cls === "illusionist") {
    newHero.baseStats.crit += ILLUSIONIST_CRIT_BONUS;
  }
  return newHero;
}

/** xp 보상 배율 (mage +20%) — idle accrual 에서도 사용하려고 export */
export function classXpMult(cls: ClassType | null): number {
  return cls === "mage" ? MAGE_XP_MULT : 1;
}

/** coin 보상 배율 (bard +25%) — idle accrual 에서도 사용하려고 export */
export function classCoinMult(cls: ClassType | null): number {
  return cls === "bard" ? BARD_COIN_MULT : 1;
}

/** heal 효과 배율 (druid +30%) — heal choice effect 적용 시 사용 */
function classHealMult(cls: ClassType | null): number {
  return cls === "druid" ? DRUID_HEAL_MULT : 1;
}

/** 시간 소모 배율 (chronomancer 0.75) — consumeTime 음수 delta 에만 적용 */
function classTimeMult(cls: ClassType | null): number {
  return cls === "chronomancer" ? CHRONOMANCER_TIME_MULT : 1;
}

/** dodge 가산량 (monk +0.1 확률) — rollEnemyOutcome 에서 사용 */
function classDodgeBonus(cls: ClassType | null): number {
  return cls === "monk" ? MONK_DODGE_BONUS : 0;
}

/** round 당 hp regen (warrior +2) — executeCombatRound 끝에서 적용 */
function classHpRegen(cls: ClassType | null): number {
  return cls === "warrior" ? WARRIOR_REGEN_PER_ROUND : 0;
}

/**
 * 세션 진행 — 다음 step 1개 실행.
 * 반환값: 업데이트된 session (불변).
 * session.status 가 "awaitingChoice" 또는 "completed" 면 외부에서 tick 중단 필요.
 */
export function tickSession(session: CombatSession): CombatSession {
  if (session.status !== "active") return session;

  // 내부 state 로 working copy 만들기
  const s: CombatSession = {
    ...session,
    log: [...session.log],
    hero: { ...session.hero },
    rewards: {
      ...session.rewards,
      drops: [...session.rewards.drops],
    },
  };

  const dungeon = DUNGEONS[s.dungeonId];
  const stats = computeEffectiveStats(s.hero);

  // 진행 단계 결정 — 최근 log 기반
  const lastEntry = s.log[s.log.length - 1];

  // 최근이 victory/narrative/treasure/floor 면: 다음 동작 결정
  // 1) 10F 도달한 직후면 boss
  // 2) 낮은 확률로 event (choice)
  // 3) 중간 확률로 narrative / treasure
  // 4) 기본: encounter → 전투 시작

  // 진행 중 전투 (encounter 후 hero/enemy alive) 면 전투 한 round
  if (lastEntry?.type === "encounter" || lastEntry?.type === "combat") {
    // 마지막 encounter 의 monster 찾기
    const encounterIdx = findLastEncounterIndex(s.log);
    if (encounterIdx >= 0) {
      const monster = (s.log[encounterIdx] as { type: "encounter"; monster: Monster }).monster;
      const combatState = computeCombatState(s.log, encounterIdx, monster, s.hero.hp);

      if (combatState.heroHp <= 0) {
        // Phase 12d — priest 부활 (revivePending) 체크. 사용 시 1회 소모.
        if (s.revivePending) {
          s.revivePending = false;
          const revivedHp = Math.round(s.hero.maxHp * 0.5);
          // computeCombatState 는 log 기반 cumulative → 기존 누적 피해 offset
          //   하기 위해 synthetic 음수 damage entry (enemy attacker) 로 HP 복원.
          //   필요량 = revivedHp - combatState.heroHp (음수였을 수치).
          const offset = revivedHp - combatState.heroHp;
          s.log.push({
            type: "combat",
            attacker: "enemy",
            damage: -offset, // 음수 damage = heal (computeCombatState 에서 heroHp += offset)
            outcome: "miss",
            narrative: "성스러운 빛이 영웅을 부활시킨다",
            timestamp: Date.now(),
          });
          s.hero.hp = revivedHp;
          s.log.push({
            type: "skill",
            classType: "priest",
            skillName: "부활",
            narrative: `영웅이 부활한다 — HP +${revivedHp}`,
            timestamp: Date.now(),
          });
        } else {
          // 영웅 패배 — 어떤 몬스터에게 쓰러졌는지 detail 로 기록
          s.hero.hp = 0;
          endSession(s, "heroDied", `${monster.name} 에게 쓰러졌다`);
          return s;
        }
      }
      if (combatState.monsterHp <= 0) {
        // 몬스터 처치 — victory. Phase 4b.3: xpBoost/coinBoost 반영
        // Phase 5c.2: mage class → XP +20%, bard class → coin +25%
        // Phase 6b: bard 노래 (nextCoinMult) 있으면 이번 victory 한정 추가 곱, 후 소모
        // Phase 11b: talisman 카리스마 (coinMult) × class × buff 모두 곱.
        const tMods = sessionMods(s);
        // Phase 11c-balance — weekly affix xpMult (풍요의 수확 XP -25%) 반영.
        const xpMult =
          (1 + getBuffBoost(s.activeBuffs, "xpBoost") / 100) *
          classXpMult(s.hero.classType) *
          (s.xpMult ?? 1);
        let coinMult =
          (1 + getBuffBoost(s.activeBuffs, "coinBoost") / 100) *
          classCoinMult(s.hero.classType) *
          tMods.coinMult;
        if (s.nextCoinMult && s.nextCoinMult > 1) {
          coinMult *= s.nextCoinMult;
          s.nextCoinMult = undefined;
        }
        const gainedXp = Math.round(monster.xpReward * xpMult);
        const gainedCoin = Math.round(monster.coinReward * coinMult);
        s.log.push({
          type: "victory",
          monster,
          xp: gainedXp,
          coins: gainedCoin,
          timestamp: Date.now(),
        });
        s.rewards.xp += gainedXp;
        s.rewards.coins += gainedCoin;
        s.hero.hp = combatState.heroHp;
        // Phase 12d — 처치 시 자원 획득 (bard 영감, priest 신앙 등).
        gainClassResource(s, "victory");

        // 보스 처치면 드롭 확정 + 높은 등급
        if (monster.isBoss) {
          // Phase 11c — NG+ legend bonus 도 가산. chaos_treasures affix 시 flatten.
          const rarity = rollDropRarity(
            s.currentFloor + 10,
            tMods.legendDropBonus + (s.ngPlusLevel ?? 0) * 0.02,
            s.flattenDropRarity ?? false,
          );
          const eq = rollEquipmentDrop(s.dungeonId, s.currentFloor, rarity, dungeon.affinity);
          s.log.push({ type: "drop", equipment: eq, timestamp: Date.now() });
          s.rewards.drops.push(eq);
          // Phase 11b — "시간 도둑" (prd+10) 효과: 보스 처치 시 time +N.
          //   세션 종료되는 F30 보스에도 적용되긴 하나 실제 이익 없음 (endSession 직후).
          //   중간 보스 (F10/F20) 에서는 실제 시간 확보 가능.
          if (tMods.bossTimeRecover > 0) {
            consumeTime(s, tMods.bossTimeRecover);
          }
          // 보스 처치 → 세션 종료. detail 로 보스 이름.
          endSession(s, "bossDefeated", `${monster.name} 을(를) 쓰러뜨렸다`);
          return s;
        }

        // 일반 몬스터 drop 확률 — base 30% + dropRate buff %
        const dropChance = 0.3 + getBuffBoost(s.activeBuffs, "dropRate") / 100;
        if (Math.random() < dropChance) {
          const rarity = rollDropRarity(
            s.currentFloor,
            tMods.legendDropBonus + (s.ngPlusLevel ?? 0) * 0.02,
            s.flattenDropRarity ?? false,
          );
          const eq = rollEquipmentDrop(s.dungeonId, s.currentFloor, rarity, dungeon.affinity);
          s.log.push({ type: "drop", equipment: eq, timestamp: Date.now() });
          s.rewards.drops.push(eq);
        }
        // Phase 11b — "군중의 총애" (soc+10) 보너스 drop: 세션당 1회, 승리 시 25% roll.
        //   초기화는 createSession 의 extraDropAvailable=true. 한 번 발동되면 false.
        if (
          s.extraDropAvailable &&
          tMods.extraDropChance > 0 &&
          Math.random() < tMods.extraDropChance
        ) {
          s.extraDropAvailable = false;
          const bonusRarity = rollDropRarity(
            s.currentFloor + 5,
            tMods.legendDropBonus + (s.ngPlusLevel ?? 0) * 0.02,
            s.flattenDropRarity ?? false,
          );
          const bonusEq = rollEquipmentDrop(
            s.dungeonId,
            s.currentFloor,
            bonusRarity,
            dungeon.affinity,
          );
          s.log.push({ type: "drop", equipment: bonusEq, timestamp: Date.now() });
          s.rewards.drops.push(bonusEq);
        }
        return s;
      }

      // Phase 4b: encounter 직후 + 일반 몬스터 → encounter choice 삽입 (싸운다/도망/이벤트)
      // 보스는 기존대로 바로 전투.
      const hasPostEncounterEntries = s.log.length > encounterIdx + 1;
      if (lastEntry.type === "encounter" && !monster.isBoss && !hasPostEncounterEntries) {
        pushEncounterChoice(s, monster, stats);
        return s;
      }

      // --- 다음 전투 round ---
      executeCombatRound(s, monster, stats);
      // 전투 round 당 시간 소모 (보스는 더 많이)
      const cost = monster.isBoss ? TIME_COST.boss : TIME_COST.combatRound;
      consumeTime(s, -cost);
      return s;
    }
  }

  // 전투 중이 아닐 때: 다음 floor 로 가거나 새 이벤트/encounter 생성.
  // Phase 4c.1 이후 세션 종료 조건은 (a) 시간 소진 (b) 보스 처치 (c) 영웅 사망
  // (d) 사용자 포기 중 하나. 자연 종료 (N floors) 는 제거됨 — 시간이 리소스.

  // BOSS 연출 직후 (resumeSession 로 status=active 로 복귀한 다음 tick) — encounter 로 진입
  if (lastEntry?.type === "boss") {
    s.log.push({
      type: "encounter",
      monster: lastEntry.monster,
      timestamp: Date.now(),
    });
    return s;
  }

  // 다음 단계 확률:
  // - 25% choice 이벤트
  // - 15% narrative (분위기)
  // - 10% treasure
  // - 50% encounter

  // 단, 10F/20F/30F 에 도달 직전이면 boss 로 분기
  const nextFloor = s.currentFloor + 1;
  const isBossFloor = nextFloor % 10 === 0 && nextFloor <= 30;

  // 층 이동
  if (lastEntry?.type === "victory" || lastEntry?.type === "drop" || lastEntry?.type === "treasure" || lastEntry?.type === "narrative") {
    // 층 진입
    s.log.push({
      type: "floor",
      from: s.currentFloor,
      to: nextFloor,
      timestamp: Date.now(),
    });
    s.currentFloor = nextFloor;
    // Phase 12d — 층 이동 시 자원 (chronomancer 시간 파편, druid 자연력).
    gainClassResource(s, "floor");
    // Phase 4c.1 — 층 이동마다 시간 소모
    if (consumeTime(s, -TIME_COST.floor)) return s;

    // 보스 floor 면 boss 엔트리만 push 하고 세션 일시 정지 (BossBanner 연출 동안)
    // encounter 는 사용자가 연출을 본 후 resumeSession() 호출 시 다음 tick 에서 push
    //
    // Phase 11c R4 bugfix — 같은 floor 에 이미 boss 엔트리가 있으면 중복 push 금지.
    //   BossBanner 연출 중 paused→active handoff race 에서 tick 이 한 번 더 실행되면
    //   같은 floor 에 boss 2번 찍혀 "보스 재등장" 현상.
    if (isBossFloor) {
      const hasExistingBoss = s.log.some(
        (e) => e.type === "boss" && e.floor === nextFloor,
      );
      if (hasExistingBoss) return s;
      const boss = createMonsterForFloor(s.dungeonId, nextFloor, true, {
        ngPlusLevel: s.ngPlusLevel ?? 0,
        hpMult: s.monsterHpMult ?? 1,
        atkMult: s.monsterAtkMult ?? 1,
      });
      s.log.push({ type: "boss", monster: boss, floor: nextFloor, timestamp: Date.now() });
      s.status = "paused";
      return s;
    }
    return s;
  }

  // 일반 층 안에서 이벤트/몬스터 고르기
  // 긴장감을 위해 choice 비중을 25% 로 상향 (이전 10%)
  // Phase 4b.3: monsterFrequency buff 는 encounter 확률 조정. 음수값 = 조우 감소.
  //   기본 encounter = 50% (roll >= 0.5). buff 반영 시 threshold 이동.
  const monsterFreqDelta = getBuffBoost(s.activeBuffs, "monsterFrequency") / 100;
  // encounter threshold = 0.5 - delta. delta -10 (음수) → threshold 0.6 (encounter 40%)
  const encounterThreshold = Math.max(0.3, Math.min(0.7, 0.5 - monsterFreqDelta));

  const roll = Math.random();
  if (roll < 0.25) {
    // choice 이벤트 — 사용자 선택 필요 (시간 소모는 resolveChoice 에서)
    const ev = pickEvent(s.dungeonId);
    const logIdx = s.log.length;
    s.log.push({
      type: "choice",
      prompt: ev.prompt,
      options: ev.options,
      timestamp: Date.now(),
    });
    s.status = "awaitingChoice";
    s.pendingChoiceIndex = logIdx;
    return s;
  }
  if (roll < 0.4) {
    // narrative
    s.log.push({
      type: "narrative",
      text: pickNarrative(s.dungeonId),
      timestamp: Date.now(),
    });
    consumeTime(s, -TIME_COST.narrative);
    return s;
  }
  if (roll < encounterThreshold) {
    // treasure — Phase 4b.3: coinBoost 반영. Phase 5c.2: bard +25%.
    // Phase 11a rebalance — 35% 확률로 "휴식처" 변주: 코인 대신 시간 회복 (+10~15).
    //   시간 밸런스가 빡빡한 중후반 F20+ 구간에서 핵심 자원. 평균 3-4 탐험 1회 등장.
    //   Phase 11c R1 — long_march affix 시 +30% → 65%.
    const restChance = 0.35 + (s.restChanceBonus ?? 0);
    const isRest = Math.random() < restChance;
    if (isRest) {
      const recoverAmount = 10 + Math.floor(Math.random() * 6); // 10~15 회복
      const restDesc = pickRestDescription();
      s.log.push({
        type: "treasure",
        coins: 0,
        description: `${restDesc} — 시간 +${recoverAmount}`,
        timestamp: Date.now(),
      });
      // 시간 회복 — consumeTime 에 양수 전달 (음수 = 소모, 양수 = 회복).
      consumeTime(s, recoverAmount);
      return s;
    }

    const coinMult =
      (1 + getBuffBoost(s.activeBuffs, "coinBoost") / 100) *
      classCoinMult(s.hero.classType);
    const coins = Math.round((5 + Math.floor(Math.random() * 16)) * coinMult);
    s.log.push({
      type: "treasure",
      coins,
      description: pickTreasureDescription(),
      timestamp: Date.now(),
    });
    s.rewards.coins += coins;
    consumeTime(s, -TIME_COST.treasure);
    return s;
  }

  // 나머지: encounter (monsterFreqDelta 만큼 확률 증감)
  const monster = createMonsterForFloor(s.dungeonId, s.currentFloor, false, {
    ngPlusLevel: s.ngPlusLevel ?? 0,
    hpMult: s.monsterHpMult ?? 1,
    atkMult: s.monsterAtkMult ?? 1,
  });
  s.log.push({ type: "encounter", monster, timestamp: Date.now() });
  consumeTime(s, -TIME_COST.encounter);
  return s;
}

/** 사용자 choice 선택 처리 → 효과 적용 + 진행 재개.
 *
 *  Phase 4c.1/4c.3:
 *  - option.outcomes 있으면 weight 기반 하나 뽑아 effects 순차 적용
 *  - 없으면 option.effect 단일 (legacy/fight/flee/nothing)
 *  - 유저는 label 만 보고 어떤 outcome 이 뽑혔는지 미리 알 수 없다
 */
export function resolveChoice(
  session: CombatSession,
  optionIndex: number,
): CombatSession {
  if (session.status !== "awaitingChoice" || session.pendingChoiceIndex == null) {
    return session;
  }
  const choiceIdx = session.pendingChoiceIndex;
  const s: CombatSession = {
    ...session,
    log: [...session.log],
    hero: { ...session.hero },
    rewards: {
      ...session.rewards,
      drops: [...session.rewards.drops],
    },
  };

  const choiceEntry = s.log[choiceIdx] as {
    type: "choice";
    prompt: string;
    options: ChoiceOption[];
    resolvedIndex?: number;
    timestamp: number;
  };
  const option = choiceEntry.options[optionIndex];
  if (!option) return s;

  // choice 엔트리에 선택 표시
  s.log[choiceIdx] = { ...choiceEntry, resolvedIndex: optionIndex };

  // outcomes 우선 — weight 기반 분기. 없으면 legacy effect.
  // Phase 11c R1 — narrative prefix 매칭 대신 explicit "choiceResult" variant.
  // Phase 11c R4 — effectSummary 필드로 구체 수치 노출.
  if (option.outcomes && option.outcomes.length > 0) {
    const outcome = pickWeighted(option.outcomes);
    const summary = summarizeEffects(outcome.effects);
    s.log.push({
      type: "choiceResult",
      text: `> ${option.label} → ${outcome.resultText}`,
      effectSummary: summary || undefined,
      timestamp: Date.now(),
    });
    for (const effect of outcome.effects) {
      applyChoiceEffect(s, effect);
      // 효과 중에 세션이 끝났으면 더 이상 뒤 효과 적용 X
      if (s.status === "completed") break;
    }
  } else {
    // Legacy: 결과 narrative + 단일 effect
    const legacyEffects = option.effect ? [option.effect] : [];
    const summary = summarizeEffects(legacyEffects);
    if (option.resultText) {
      s.log.push({
        type: "choiceResult",
        text: `> ${option.label} → ${option.resultText}`,
        effectSummary: summary || undefined,
        timestamp: Date.now(),
      });
    }
    if (option.effect) applyChoiceEffect(s, option.effect);
  }

  // 세션이 이미 종료됐으면 (damage effect 가 hero HP 0 만들었거나) 그대로 리턴
  if (s.status === "completed") return s;

  // choice 해소 자체의 시간 소모
  if (consumeTime(s, -TIME_COST.choice)) return s;

  // Phase 12d — choice 해소 시 자원 (chronomancer 시간 파편).
  gainClassResource(s, "choice");

  s.status = "active";
  s.pendingChoiceIndex = undefined;
  return s;
}

/** weight 기반 랜덤 outcome pick. weight 합 0 가드. */
function pickWeighted<T extends { weight: number }>(outcomes: T[]): T {
  const total = outcomes.reduce((sum, o) => sum + Math.max(0, o.weight), 0);
  if (total <= 0) return outcomes[0];
  let roll = Math.random() * total;
  for (const o of outcomes) {
    roll -= Math.max(0, o.weight);
    if (roll <= 0) return o;
  }
  return outcomes[outcomes.length - 1];
}

/**
 * Phase 11c R4 — choice effects 를 사람이 읽기 좋은 한 줄 요약으로 포맷.
 *   narrative 는 분위기 문구 ("지혜를 전수받았다") 라 구체 수치가 빠짐 → 유저가
 *   "내 선택이 뭘 바꿨는지" 모호. summary 는 이 요약을 (XP +50, 시간 -3) 형태로
 *   ChoiceResultModal 에 별도 표시.
 *
 * heal 은 heroClass/talisman mult 가 곱해지므로 "예상 수치" (명시된 amount 기준).
 * fight/flee/revealBoss/skipFloors 같은 구조 이벤트는 summary 에서 제외.
 */
function summarizeEffects(effects: readonly ChoiceEffect[]): string {
  const parts: string[] = [];
  let totalCoins = 0;
  let totalXp = 0;
  let totalDamage = 0;
  let totalHeal = 0;
  let totalTimeDelta = 0;
  for (const e of effects) {
    if (e.kind === "reward") {
      if (e.coins) totalCoins += e.coins;
      if (e.xp) totalXp += e.xp;
    } else if (e.kind === "damage") {
      totalDamage += e.amount;
    } else if (e.kind === "heal") {
      totalHeal += e.amount;
    } else if (e.kind === "time") {
      totalTimeDelta += e.delta;
    }
  }
  if (totalXp > 0) parts.push(`경험치 +${totalXp}`);
  if (totalCoins > 0) parts.push(`코인 +${totalCoins}`);
  if (totalHeal > 0) parts.push(`체력 +${totalHeal}`);
  if (totalDamage > 0) parts.push(`체력 −${totalDamage}`);
  if (totalTimeDelta > 0) parts.push(`시간 +${totalTimeDelta}`);
  else if (totalTimeDelta < 0) parts.push(`시간 ${totalTimeDelta}`);
  return parts.join(" · ");
}

function applyChoiceEffect(session: CombatSession, effect: ChoiceEffect) {
  switch (effect.kind) {
    case "reward":
      if (effect.coins) {
        session.rewards.coins += effect.coins;
        session.log.push({
          type: "treasure",
          coins: effect.coins,
          description: "선택의 대가",
          timestamp: Date.now(),
        });
      }
      if (effect.xp) session.rewards.xp += effect.xp;
      break;
    case "damage":
      session.hero.hp = Math.max(0, session.hero.hp - effect.amount);
      if (session.hero.hp <= 0) {
        endSession(session, "heroDied", "선택의 대가로 쓰러졌다");
      }
      break;
    case "time":
      // delta 음수 = 시간 소모, 양수 = 시간 회복
      consumeTime(session, effect.delta);
      break;
    case "heal": {
      // Phase 5c.2: druid class → heal 효과 +30%
      // Phase 11b: talisman "회복력" → heal 효과 +25% (곱 중첩).
      const tMods = sessionMods(session);
      const healed = Math.round(
        effect.amount *
          classHealMult(session.hero.classType) *
          tMods.healEffectMult,
      );
      session.hero.hp = Math.min(
        session.hero.maxHp,
        session.hero.hp + healed,
      );
      // Phase 12d — heal 시 자원 (druid 자연력, priest 신앙).
      gainClassResource(session, "heal");
      break;
    }
    case "skipFloors":
      session.currentFloor += effect.count;
      session.log.push({
        type: "floor",
        from: session.currentFloor - effect.count,
        to: session.currentFloor,
        timestamp: Date.now(),
      });
      break;
    case "revealBoss":
      session.log.push({
        type: "narrative",
        text: "보스의 기운이 느껴진다.",
        timestamp: Date.now(),
      });
      break;
    case "fight": {
      // "싸운다" 선택 — encounter 된 몬스터로 즉시 첫 전투 round 진행
      const encounterIdx = findLastEncounterIndex(session.log);
      if (encounterIdx < 0) break;
      const monster = (session.log[encounterIdx] as { type: "encounter"; monster: Monster }).monster;
      const stats = computeEffectiveStats(session.hero);
      executeCombatRound(session, monster, stats);
      break;
    }
    case "flee": {
      // "도망간다" — 확률 성공 체크
      const encounterIdx = findLastEncounterIndex(session.log);
      if (encounterIdx < 0) break;
      const monster = (session.log[encounterIdx] as { type: "encounter"; monster: Monster }).monster;
      const success = Math.random() < effect.successChance;
      if (success) {
        // 도망 성공 — 몬스터 무시하고 다음 floor 진행
        // narrative 추가, 세션 계속 (다음 tick 에서 floor 전환)
        session.log.push({
          type: "narrative",
          text: `영웅이 ${monster.name} 에게서 재빠르게 도망쳤다.`,
          timestamp: Date.now(),
        });
      } else {
        // 도망 실패 — narrative + 몬스터의 기습 공격 1회
        session.log.push({
          type: "narrative",
          text: `도망치려 했지만 ${monster.name} 에게 막혔다!`,
          timestamp: Date.now(),
        });
        const stats = computeEffectiveStats(session.hero);
        // 몬스터만 공격 (기습). Phase 5c.2: monk class dodge bonus 동일 적용.
        //   Phase 11c R1: fragile_world affix 시 monsterCritBonus 전달.
        const outcome = rollEnemyOutcome(
          monster,
          stats,
          classDodgeBonus(session.hero.classType),
          0,
          session.monsterCritBonus ?? 0,
        );
        const dmg =
          outcome === "miss" || outcome === "dodge"
            ? 0
            : computeEnemyDamage(monster, stats, outcome === "crit");
        const narrative = Math.random() < shouldNarrate(outcome)
          ? monsterAttackNarrative(monster, outcome, dmg)
          : undefined;
        session.log.push({
          type: "combat",
          attacker: "enemy",
          damage: dmg,
          outcome,
          narrative,
          timestamp: Date.now(),
        });
      }
      break;
    }
    case "nothing":
      break;
  }
}

/**
 * 일반 몬스터 encounter 직후 삽입되는 선택지.
 * 옵션: 싸운다 / 도망 (확률 표시) / 랜덤 이벤트 (30% 확률로만).
 * 5초 후 자동 "싸운다".
 */
function pushEncounterChoice(
  s: CombatSession,
  monster: Monster,
  stats: { agi: number },
): void {
  // 도망 성공률: base 20% + agi × 3% - 몬스터 level × 2%. [20%, 85%] 범위
  const fleeChance = Math.min(
    0.85,
    Math.max(0.2, 0.2 + stats.agi * 0.03 - monster.level * 0.02),
  );
  const fleePct = Math.round(fleeChance * 100);

  // Phase 4c-polish — 이모지 prefix 제거 (다른 UI 가 PixelIcon 으로 통일돼
  // 이모지와 시각 언어 불일치). ChoicePanel 은 "{번호}. {label}" 로 렌더하므로
  // prefix 없어도 구분 분명.
  const options: ChoiceOption[] = [
    {
      label: "싸운다",
      effect: { kind: "fight" },
    },
    {
      label: `도망간다 (${fleePct}%)`,
      effect: { kind: "flee", successChance: fleeChance },
    },
  ];

  // 30% 확률로 랜덤 이벤트 옵션 추가 (던전 flavor 에서 1개)
  if (Math.random() < 0.3) {
    const ev = pickEvent(s.dungeonId);
    // 이벤트에서 첫 옵션 하나만 picks — 단일 추가 선택지.
    // Phase 4c.3: outcomes 있는 옵션이면 outcomes 그대로 넘긴다 (확률 분기 유지).
    const evOption = ev.options[0];
    if (evOption) {
      options.push({
        label: evOption.label,
        effect: evOption.effect,
        outcomes: evOption.outcomes,
        resultText: evOption.resultText,
      });
    }
  }

  const logIdx = s.log.length;
  s.log.push({
    type: "choice",
    variant: "encounter",
    prompt: `${monster.name} 을(를) 만났다.`,
    options,
    defaultOptionIndex: 0, // 5초 timeout 시 "싸운다"
    timeoutMs: 5000,
    timestamp: Date.now(),
  });
  s.status = "awaitingChoice";
  s.pendingChoiceIndex = logIdx;
}

/**
 * 전투 한 round (영웅 공격 + 몬스터 공격).
 * log 에 2개 combat entry push.
 */
function executeCombatRound(
  s: CombatSession,
  monster: Monster,
  stats: { str: number; vit: number; agi: number; dex: number; crit: number; int: number; slotBonus: number },
): void {
  // Phase 12d — round 시작 자원 획득 (mage 마나, druid 자연력 등).
  gainClassResource(s, "roundStart");
  // Phase 6b — combat round 시작 전 액티브 스킬 발동 시도
  const skillCdBefore = s.skillCooldown ?? 0;
  maybeFireSkill(s, monster);
  // Phase 11b — "평정" CD reduce: skill 이 이번 round 에 fire 했으면 (cooldown 증가),
  //   classSkillCdReduce 만큼 더 차감해 다음 재발동 가속.
  const tModsEarly = sessionMods(s);
  if (
    tModsEarly.classSkillCdReduce > 0 &&
    (s.skillCooldown ?? 0) > skillCdBefore
  ) {
    s.skillCooldown = Math.max(
      0,
      (s.skillCooldown ?? 0) - tModsEarly.classSkillCdReduce,
    );
  }

  // Phase 11b — talisman modifier 에서 이번 round 에 영향을 주는 값들.
  const tMods = sessionMods(s);

  // Phase 11b — "무념" round 당 agi stack 적용 (공격 / dodge 판정 전에 가산).
  //   stack 은 이전 round 까지 누적된 값을 이번 round 에 사용, 그 다음 +1.
  const agiStack = s.talismanAgiStack ?? 0;
  const effStats = {
    ...stats,
    agi: stats.agi + agiStack,
  };

  // 영웅 공격
  let heroOutcome = rollHeroOutcome(effStats, monster);
  // Phase 12d — bard "대서사시": 다음 N 공격 반드시 crit.
  if (
    s.guaranteedCritAttacks &&
    s.guaranteedCritAttacks > 0 &&
    heroOutcome !== "miss" &&
    heroOutcome !== "dodge"
  ) {
    heroOutcome = "crit";
    s.guaranteedCritAttacks -= 1;
    if (s.guaranteedCritAttacks <= 0) delete s.guaranteedCritAttacks;
  }
  let heroDmg =
    heroOutcome === "miss" || heroOutcome === "dodge"
      ? 0
      : computeHeroDamage(effStats, monster, heroOutcome === "crit");

  // Phase 6b — warrior 강타: 다음 공격 damage 2배 후 소모
  if (heroDmg > 0 && s.nextHeroDamageMult && s.nextHeroDamageMult > 1) {
    heroDmg = Math.round(heroDmg * s.nextHeroDamageMult);
    s.nextHeroDamageMult = undefined;
  }

  // Phase 12d — heroAtkBonusRounds (warrior 광폭화, bard 협연, monk 태극 등).
  //   round 단위 지속 효과. advanceSkillCounters 에서 rounds 감소.
  if (heroDmg > 0 && s.heroAtkBonusRounds && s.heroAtkBonusRounds.rounds > 0) {
    heroDmg = Math.round(heroDmg * s.heroAtkBonusRounds.mult);
  }

  // Phase 11b — "현자" crit damage +N%. hero crit 일 때만 추가 배율.
  if (heroOutcome === "crit" && heroDmg > 0 && tMods.critDmgBonus > 0) {
    heroDmg = Math.round(heroDmg * (1 + tMods.critDmgBonus));
  }

  // Phase 11b — "불굴" HP ≤ 20% 일 때 공격 +N%.
  if (
    heroDmg > 0 &&
    tMods.lowHpDmgBonus > 0 &&
    s.hero.hp > 0 &&
    s.hero.hp / s.hero.maxHp <= 0.2
  ) {
    heroDmg = Math.round(heroDmg * (1 + tMods.lowHpDmgBonus));
  }

  const heroNarrative = Math.random() < shouldNarrate(heroOutcome)
    ? heroAttackNarrative(monster, heroOutcome, heroDmg)
    : undefined;
  s.log.push({
    type: "combat",
    attacker: "hero",
    damage: heroDmg,
    outcome: heroOutcome,
    narrative: heroNarrative,
    timestamp: Date.now(),
  });
  // Phase 12d — 영웅 공격 결과에 따른 자원 획득.
  if (heroOutcome === "hit" || heroOutcome === "crit") {
    gainClassResource(s, "attack");
    if (heroOutcome === "crit") gainClassResource(s, "crit");
  }

  // 몬스터 공격 — Phase 5c.2: monk class 는 dodge 확률 추가 (stats.agi 보강)
  // Phase 6b: monk 선정 중이면 강제 dodge, illusionist 환영 중이면 강제 miss.
  // Phase 11b: talisman dodgeBonus / enemyMissBonus 추가 (각각 monk 와 stacks).
  // Phase 12d: enemyStunnedRounds (mage/druid/chrono/illus skill) — 강제 miss.
  //            heroInvulnerableRounds (monk 연화, illus 환몽) — 피해 0.
  let enemyOutcome: CombatOutcome;
  if (s.enemyStunnedRounds && s.enemyStunnedRounds > 0) {
    enemyOutcome = "miss"; // 봉인 효과는 miss 로 표현
  } else if (s.forcedEnemyMisses && s.forcedEnemyMisses > 0) {
    enemyOutcome = "miss";
    s.forcedEnemyMisses -= 1;
    if (s.forcedEnemyMisses <= 0) delete s.forcedEnemyMisses;
  } else if (s.forcedDodgeRounds && s.forcedDodgeRounds > 0) {
    enemyOutcome = "dodge";
  } else {
    enemyOutcome = rollEnemyOutcome(
      monster,
      effStats,
      classDodgeBonus(s.hero.classType) + tMods.dodgeBonus,
      tMods.enemyMissBonus,
      s.monsterCritBonus ?? 0,
    );
  }
  let enemyDmg =
    enemyOutcome === "miss" || enemyOutcome === "dodge"
      ? 0
      : computeEnemyDamage(monster, effStats, enemyOutcome === "crit");
  // Phase 12d — 무적 (heroInvulnerableRounds). 피해 0 으로 강제.
  if (s.heroInvulnerableRounds && s.heroInvulnerableRounds > 0 && enemyDmg > 0) {
    enemyDmg = 0;
    enemyOutcome = "miss";
  }
  // Phase 12d — 피해 감소 (priest 정화, druid 숲의 포옹, bard 영웅가).
  if (enemyDmg > 0 && s.heroDmgReductionRounds && s.heroDmgReductionRounds.rounds > 0) {
    enemyDmg = Math.max(1, Math.round(enemyDmg * (1 - s.heroDmgReductionRounds.reduction)));
  }

  // Phase 11b — "강단" counter-attack: 피격 (enemyDmg > 0) 시 counterChance 에
  //   monster HP 에 +1 고정 damage 를 combat log 에 추가 push. "hit" 으로 표시.
  //   monster HP 는 다음 tick 의 computeCombatState 가 계산하므로 여기선 log 만.
  let counterLogged = false;
  if (enemyDmg > 0 && tMods.counterChance > 0 && Math.random() < tMods.counterChance) {
    counterLogged = true;
  }

  const enemyNarrative = Math.random() < shouldNarrate(enemyOutcome)
    ? monsterAttackNarrative(monster, enemyOutcome, enemyDmg)
    : undefined;
  s.log.push({
    type: "combat",
    attacker: "enemy",
    damage: enemyDmg,
    outcome: enemyOutcome,
    narrative: enemyNarrative,
    timestamp: Date.now(),
  });
  // Phase 12d — 적 공격 결과에 따른 자원 획득.
  if (enemyOutcome === "dodge") gainClassResource(s, "dodge");
  else if (enemyOutcome === "hit" || enemyOutcome === "crit") {
    gainClassResource(s, "hit");
  }
  // counter attack — 짧은 narrative 와 함께 hero attack entry 추가 push
  if (counterLogged) {
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: 1,
      outcome: "hit",
      narrative: "영웅이 반사적으로 반격한다 — 1 피해",
      timestamp: Date.now(),
    });
  }

  // Phase 5c.2: warrior class → round 끝에 HP +2 회복 (최대치 cap)
  const regen = classHpRegen(s.hero.classType);
  if (regen > 0 && s.hero.hp > 0) {
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + regen);
  }

  // Phase 11b — round counter 증가 (regen 판정 전). 이전 버그: talismanAgiStack
  //   을 cap(8) 있는 agi stack 과 "round 카운터" 로 겸용 → 무념 cap 도달 후 stack=8
  //   로 고정되면 `stack % 2 === 0` 매 round true → 대지의 축복이 매 round 발동.
  //   지금은 roundCounter (무제한 증가) 와 talismanAgiStack (capped) 분리.
  const nextRoundCounter = (s.roundCounter ?? 0) + 1;
  s.roundCounter = nextRoundCounter;

  // Phase 11b — "대지의 축복" 2 round 마다 HP +N regen.
  //   roundCounter 기준 짝수에서만 발동.
  const regen2 = tMods.hpRegenEvery2Rounds;
  if (regen2 > 0 && s.hero.hp > 0 && nextRoundCounter % 2 === 0) {
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + regen2);
  }

  // Phase 11b — agi stack 증가 (다음 round 용). cap saturate.
  //   accum 없으면 갱신 불필요 (regen2 는 이제 roundCounter 기준).
  if (tMods.agiRoundAccum > 0) {
    s.talismanAgiStack = Math.min(
      tMods.agiRoundCap,
      agiStack + tMods.agiRoundAccum,
    );
  }

  // Phase 6b — round 종료 시 쿨다운 감소 + 지속 스킬 카운터 감소
  advanceSkillCounters(s);
}

/** 세션 포기 — 사용자가 자발적으로 캠프 복귀 선택 */
export function abandonSession(session: CombatSession): CombatSession {
  return {
    ...session,
    log: [
      ...session.log,
      {
        type: "sessionEnd",
        reason: "heroAbandoned",
        detail: `F${session.currentFloor} 에서 캠프로 복귀`,
        timestamp: Date.now(),
      },
    ],
    status: "completed",
  };
}

// --- helpers ---

export function findLastEncounterIndex(log: LogEntry[]): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.type === "encounter") return i;
    if (e.type === "victory" || e.type === "sessionEnd") return -1;
  }
  return -1;
}

/** encounter 이후 combat log 들을 합쳐 현재 hero/monster HP 계산 */
function computeCombatState(
  log: LogEntry[],
  encounterIdx: number,
  monster: Monster,
  currentHeroHp: number,
): { heroHp: number; monsterHp: number } {
  let heroHp = currentHeroHp;
  let monsterHp = monster.hp;
  for (let i = encounterIdx + 1; i < log.length; i++) {
    const e = log[i];
    if (e.type !== "combat") continue;
    // damage 0 이면 miss/dodge — HP 에 영향 없음
    if (e.damage === 0) continue;
    if (e.attacker === "hero") monsterHp -= e.damage;
    else heroHp -= e.damage;
  }
  return { heroHp: Math.max(0, heroHp), monsterHp: Math.max(0, monsterHp) };
}

// ─────────────────────────────────────────────────────────
// Phase 3 — 치명타 / 회피 / 미스 롤 + 데미지 공식
// 판정 순서: miss → dodge → crit → hit (각 독립 롤)
// ─────────────────────────────────────────────────────────

/** 영웅 공격의 outcome 판정 */
function rollHeroOutcome(
  stats: HeroBaseStats,
  monster: Monster,
): CombatOutcome {
  // 공격자(영웅) 실수 — 낮은 dex 일수록 빗나감 (base 5%, dex 60 에서 2% 바닥)
  const missChance = Math.max(0.02, 0.05 - stats.dex * 0.0005);
  if (Math.random() < missChance) return "miss";
  // 방어자(몬스터) 회피 — 고층 몬스터 더 잘 피함
  const dodgeChance = Math.min(0.2, monster.level * 0.005);
  if (Math.random() < dodgeChance) return "dodge";
  // 공격자(영웅) 크리 — dex scaling + 장비 crit 보너스 (Phase 4a)
  //   stats.crit 은 장비에서만 합산 (영웅 base = 0)
  //   1 포인트 = +1% crit 확률
  const critChance = Math.min(0.5, 0.05 + stats.dex * 0.003 + stats.crit * 0.01);
  if (Math.random() < critChance) return "crit";
  return "hit";
}

/**
 * 몬스터 공격의 outcome 판정.
 * @param dodgeBonus Phase 5c.2 — monk class + Phase 11b talisman dodgeBonus 합산. 기본 0.
 * @param enemyMissBonus Phase 11b — talisman "변덕" 등 적 miss 확률 가산.
 * @param monsterCritBonus Phase 11c R1 — "깨지기 쉬운 세계" affix runtime. 몬스터 crit +0.15.
 */
function rollEnemyOutcome(
  monster: Monster,
  stats: HeroBaseStats,
  dodgeBonus = 0,
  enemyMissBonus = 0,
  monsterCritBonus = 0,
): CombatOutcome {
  // 공격자(몬스터) 실수 — 초반 floor 에서 허당치게 (base 8%, floor 60 에서 2% 바닥)
  //   Phase 11b talisman "변덕" → enemyMissBonus 추가.
  const missChance = Math.max(0.02, 0.08 - monster.level * 0.001) + enemyMissBonus;
  if (Math.random() < missChance) return "miss";
  // 방어자(영웅) 회피 — agi scaling + class bonus + talisman bonus. cap 0.45 (monk + 변덕 최대).
  const dodgeChance = Math.min(0.45, stats.agi * 0.006 + dodgeBonus);
  if (Math.random() < dodgeChance) return "dodge";
  // 공격자(몬스터) 크리 — level scaling + affix bonus (cap 0.4 로 올림, fragile_world 대비).
  const critChance = Math.min(0.4, 0.03 + monster.level * 0.004 + monsterCritBonus);
  if (Math.random() < critChance) return "crit";
  return "hit";
}

/** 영웅 데미지 — crit 시 1.8배 */
function computeHeroDamage(
  stats: HeroBaseStats,
  monster: Monster,
  crit: boolean,
): number {
  const base = Math.max(
    1,
    stats.str + Math.floor(Math.random() * 7) - 3 - monster.def,
  );
  return crit ? Math.floor(base * 1.8) : base;
}

/**
 * 몬스터 데미지 — crit 시 1.7배.
 *
 * Phase 11c-balance fix: 이전 공식은 flat `-vit/2` 로 감산이라 NG+ scale × 1.5+
 * 이후 monster.atk 가 1000+ 로 뛸 때 vit 감산이 무의미해져 영웅이 1-hit kill 당함
 * (NG+2 F30 에서 클리어 수학적 불가능).
 *
 * 새 공식: **퍼센트 기반 damage reduction (DR)** + flat vit 감산 병용.
 *   DR = min(0.6, vit / (vit + 40))   ← cap 60%, vit 60 에서 60% 가까이
 *   rawDmg = monster.atk + random(0..4) - 2
 *   finalDmg = max(1, rawDmg × (1 - DR) - floor(vit / 4))
 *   crit ×1.7 (변경 없음)
 *
 * Lv30 vit 39 기준 DR ≈ 50% → NG+2 atk 1000 → 500 × (1 - 0.5) = 250 (여전히 아프지만
 * maxHp 390 에서 1.5hit 소요, 생존 가능).
 */
function computeEnemyDamage(
  monster: Monster,
  stats: HeroBaseStats,
  crit: boolean,
): number {
  const vit = Math.max(0, stats.vit);
  // Phase 11c R4 R2 — DR 공식 한번 더 하향. `vit/(vit+30)` 0.7 → `vit/(vit+25)` 0.75.
  //   NG+2 보스 crit 이 여전히 maxHp 대부분을 깎던 문제 해결.
  //   Lv30 vit 39: 39/64 = 61% (vs 이전 56%). cap 0.75 여유.
  //   Lv50 vit 59: 59/84 = 70%.
  //   maxHp 성장 (×10 → ×12, Lv30 448 로) 과 결합해 NG+2 crit 도 2-hit 생존 보장.
  const dr = Math.min(0.75, vit / (vit + 25));
  const rawDmg = monster.atk + Math.floor(Math.random() * 5) - 2;
  const base = Math.max(
    1,
    Math.round(rawDmg * (1 - dr)) - Math.floor(vit / 4),
  );
  const finalDmg = Math.max(1, base);
  // Phase 11c R4 R3 — 몬스터 crit 배율 1.7 → 1.4. Lv30 기준 maxHp 448 에서 NG+1
  //   crit 이 542 (1.7×) 로 1-hit 나던 문제 해결. 신규: 319 × 1.4 = 446 → 1.0 hit
  //   마진. 영웅 crit 은 1.8× 유지 — "치명타는 영웅의 특권" 디자인 내러티브.
  return crit ? Math.floor(finalDmg * 1.4) : finalDmg;
}

/**
 * narrative 생성 확률.
 * hit (일반) 는 3턴당 1개 꼴 (33%) 로 낮춰 시각적 리듬 일관화.
 * crit / miss / dodge 는 특수 상황이므로 항상 narrative.
 */
function shouldNarrate(outcome: CombatOutcome): number {
  return outcome === "hit" ? 0.33 : 1.0;
}

/**
 * Phase 4b.3 — activeBuffs 에서 특정 special effect 값 합산.
 * 여러 buff 가 같은 special type 을 가지면 합쳐서 반영.
 * (critBonus 는 baseStats.crit 로 이미 반영되므로 여기서는 미사용)
 *
 * @returns 값 (0 = 없음, 음수 가능 — monsterFrequency 감소)
 */
function getBuffBoost(
  buffs: CardBuff[] | undefined,
  type: SpecialEffect,
): number {
  if (!buffs) return 0;
  let total = 0;
  for (const buff of buffs) {
    for (const effect of buff.effects) {
      if (effect.kind === "special" && effect.type === type) {
        total += effect.value;
      }
    }
  }
  return total;
}

/** 드롭 리스트 중 신규 장비만 (중복 방지) */
export function dedupeDrops(drops: Equipment[]): Equipment[] {
  const seen = new Set<string>();
  return drops.filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}
