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
import { computeEffectiveStats } from "@/types/uphero";
import { createMonsterForFloor } from "@/data/upHeroMonsters";
import { pickNarrative, pickTreasureDescription, pickEvent } from "@/data/upHeroFlavor";
import { rollEquipmentDrop, rollDropRarity } from "@/data/upHeroEquipment";
import { DUNGEONS } from "@/data/upHeroDungeons";
import {
  heroAttackNarrative,
  monsterAttackNarrative,
} from "@/lib/upHeroNarrative";
import { maybeFireSkill, advanceSkillCounters } from "@/lib/classSkills";

/**
 * Phase 4c.1 — 탐험 시간 리소스 밸런스.
 * baseTime=100 에 1 탐험당 평균 ~6 정도 소모 → 15~18 층 진행 가능.
 * 10F 미니보스까진 대체로 여유, 30F 최종 보스는 빡빡 (이벤트 결과에 따라 변동).
 */
const BASE_EXPEDITION_TIME = 100;
const TIME_COST = {
  narrative: 2,
  encounter: 3,
  treasure: 2,
  floor: 5,
  combatRound: 2, // 영웅+몬스터 1 round 세트
  boss: 8, // 보스 전투 round 당 추가 소모
  choice: 1, // choice 해소 자체
} as const;

/**
 * 세션 시작 — 빈 log 로 생성.
 *
 * Phase 4b.3: activeBuffs 를 hero 스냅샷에 적용.
 *  - stat 버프: baseStats 에 합산 (affinity 던전이면 multiplier 배)
 *  - healStart: maxHp + hp 증가
 *  - xpBoost/coinBoost/dropRate/critBonus/monsterFrequency 는 tick 중 참조용으로 activeBuffs 에 저장
 */
export function createSession(
  dungeonId: CombatSession["dungeonId"],
  hero: Hero,
  startFloor: number,
  activeBuffs?: CardBuff[],
): CombatSession {
  const buffedHero = applyStatAndHealBuffs(hero, activeBuffs ?? [], dungeonId);
  // Phase 5c.2 — class 패시브 중 session start 효과 적용 (priest maxHp,
  // illusionist crit). chronomancer 는 runtime consumeTime 에서.
  const classedHero = applyClassStartEffects(buffedHero);
  const maxTime = BASE_EXPEDITION_TIME;
  return {
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
    hero: classedHero,
    rewards: { xp: 0, coins: 0, drops: [] },
    status: "active",
    speed: 1,
    activeBuffs: activeBuffs && activeBuffs.length > 0 ? activeBuffs : undefined,
    time: maxTime,
    maxTime,
    startedAt: Date.now(),
  };
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
    effectiveDelta = Math.round(delta * classTimeMult(s.hero.classType));
    // 최소 -1 보장 — classTimeMult 로 -1 이 0 에 반올림되면 cost 가 사라져버림
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
const PRIEST_START_HP_BONUS = 50;
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
    newHero.maxHp += PRIEST_START_HP_BONUS;
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
        // 영웅 패배 — 어떤 몬스터에게 쓰러졌는지 detail 로 기록
        s.hero.hp = 0;
        endSession(s, "heroDied", `${monster.name} 에게 쓰러졌다`);
        return s;
      }
      if (combatState.monsterHp <= 0) {
        // 몬스터 처치 — victory. Phase 4b.3: xpBoost/coinBoost 반영
        // Phase 5c.2: mage class → XP +20%, bard class → coin +25%
        // Phase 6b: bard 노래 (nextCoinMult) 있으면 이번 victory 한정 추가 곱, 후 소모
        const xpMult =
          (1 + getBuffBoost(s.activeBuffs, "xpBoost") / 100) *
          classXpMult(s.hero.classType);
        let coinMult =
          (1 + getBuffBoost(s.activeBuffs, "coinBoost") / 100) *
          classCoinMult(s.hero.classType);
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

        // 보스 처치면 드롭 확정 + 높은 등급
        if (monster.isBoss) {
          const rarity = rollDropRarity(s.currentFloor + 10); // 보스는 rarity 상승
          const eq = rollEquipmentDrop(s.dungeonId, s.currentFloor, rarity, dungeon.affinity);
          s.log.push({ type: "drop", equipment: eq, timestamp: Date.now() });
          s.rewards.drops.push(eq);
          // 보스 처치 → 세션 종료. detail 로 보스 이름.
          endSession(s, "bossDefeated", `${monster.name} 을(를) 쓰러뜨렸다`);
          return s;
        }

        // 일반 몬스터 drop 확률 — base 30% + dropRate buff %
        const dropChance = 0.3 + getBuffBoost(s.activeBuffs, "dropRate") / 100;
        if (Math.random() < dropChance) {
          const rarity = rollDropRarity(s.currentFloor);
          const eq = rollEquipmentDrop(s.dungeonId, s.currentFloor, rarity, dungeon.affinity);
          s.log.push({ type: "drop", equipment: eq, timestamp: Date.now() });
          s.rewards.drops.push(eq);
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
    // Phase 4c.1 — 층 이동마다 시간 소모
    if (consumeTime(s, -TIME_COST.floor)) return s;

    // 보스 floor 면 boss 엔트리만 push 하고 세션 일시 정지 (BossBanner 연출 동안)
    // encounter 는 사용자가 연출을 본 후 resumeSession() 호출 시 다음 tick 에서 push
    if (isBossFloor) {
      const boss = createMonsterForFloor(s.dungeonId, nextFloor, true);
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
  const monster = createMonsterForFloor(s.dungeonId, s.currentFloor, false);
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
  if (option.outcomes && option.outcomes.length > 0) {
    const outcome = pickWeighted(option.outcomes);
    s.log.push({
      type: "narrative",
      text: `> ${option.label} → ${outcome.resultText}`,
      timestamp: Date.now(),
    });
    for (const effect of outcome.effects) {
      applyChoiceEffect(s, effect);
      // 효과 중에 세션이 끝났으면 더 이상 뒤 효과 적용 X
      if (s.status === "completed") break;
    }
  } else {
    // Legacy: 결과 narrative + 단일 effect
    if (option.resultText) {
      s.log.push({
        type: "narrative",
        text: `> ${option.label} → ${option.resultText}`,
        timestamp: Date.now(),
      });
    }
    if (option.effect) applyChoiceEffect(s, option.effect);
  }

  // 세션이 이미 종료됐으면 (damage effect 가 hero HP 0 만들었거나) 그대로 리턴
  if (s.status === "completed") return s;

  // choice 해소 자체의 시간 소모
  if (consumeTime(s, -TIME_COST.choice)) return s;

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
      const healed = Math.round(
        effect.amount * classHealMult(session.hero.classType),
      );
      session.hero.hp = Math.min(
        session.hero.maxHp,
        session.hero.hp + healed,
      );
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
        const outcome = rollEnemyOutcome(
          monster,
          stats,
          classDodgeBonus(session.hero.classType),
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
  // Phase 6b — combat round 시작 전 액티브 스킬 발동 시도
  maybeFireSkill(s, monster);

  // 영웅 공격
  const heroOutcome = rollHeroOutcome(stats, monster);
  let heroDmg =
    heroOutcome === "miss" || heroOutcome === "dodge"
      ? 0
      : computeHeroDamage(stats, monster, heroOutcome === "crit");

  // Phase 6b — warrior 강타: 다음 공격 damage 2배 후 소모
  if (heroDmg > 0 && s.nextHeroDamageMult && s.nextHeroDamageMult > 1) {
    heroDmg = Math.round(heroDmg * s.nextHeroDamageMult);
    s.nextHeroDamageMult = undefined;
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

  // 몬스터 공격 — Phase 5c.2: monk class 는 dodge 확률 추가 (stats.agi 보강)
  // Phase 6b: monk 선정 중이면 강제 dodge, illusionist 환영 중이면 강제 miss.
  let enemyOutcome: CombatOutcome;
  if (s.forcedEnemyMisses && s.forcedEnemyMisses > 0) {
    enemyOutcome = "miss";
    s.forcedEnemyMisses -= 1;
    if (s.forcedEnemyMisses <= 0) delete s.forcedEnemyMisses;
  } else if (s.forcedDodgeRounds && s.forcedDodgeRounds > 0) {
    enemyOutcome = "dodge";
  } else {
    enemyOutcome = rollEnemyOutcome(
      monster,
      stats,
      classDodgeBonus(s.hero.classType),
    );
  }
  const enemyDmg =
    enemyOutcome === "miss" || enemyOutcome === "dodge"
      ? 0
      : computeEnemyDamage(monster, stats, enemyOutcome === "crit");
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

  // Phase 5c.2: warrior class → round 끝에 HP +2 회복 (최대치 cap)
  const regen = classHpRegen(s.hero.classType);
  if (regen > 0 && s.hero.hp > 0) {
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + regen);
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

function findLastEncounterIndex(log: LogEntry[]): number {
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
 * @param dodgeBonus Phase 5c.2 — monk class 일 때 +0.1 dodge 추가. 기본 0.
 */
function rollEnemyOutcome(
  monster: Monster,
  stats: HeroBaseStats,
  dodgeBonus = 0,
): CombatOutcome {
  // 공격자(몬스터) 실수 — 초반 floor 에서 허당치게 (base 8%, floor 60 에서 2% 바닥)
  const missChance = Math.max(0.02, 0.08 - monster.level * 0.001);
  if (Math.random() < missChance) return "miss";
  // 방어자(영웅) 회피 — agi scaling + class bonus. cap 0.35 (monk 최대값).
  const dodgeChance = Math.min(0.35, stats.agi * 0.006 + dodgeBonus);
  if (Math.random() < dodgeChance) return "dodge";
  // 공격자(몬스터) 크리 — level scaling
  const critChance = Math.min(0.25, 0.03 + monster.level * 0.004);
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

/** 몬스터 데미지 — crit 시 1.7배 */
function computeEnemyDamage(
  monster: Monster,
  stats: HeroBaseStats,
  crit: boolean,
): number {
  const base = Math.max(
    1,
    monster.atk + Math.floor(Math.random() * 5) - 2 - Math.floor(stats.vit / 2),
  );
  return crit ? Math.floor(base * 1.7) : base;
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
