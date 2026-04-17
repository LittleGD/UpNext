/**
 * Up Hero — 전투 해소 + 세션 로그 생성기.
 *
 * 설계:
 *  - tickSession() 1 호출 = 1 "step" (narrative / encounter / combat round / floor / event 중 하나)
 *  - choice 만나면 session.status = "awaitingChoice" 로 정지, 사용자 resolveChoice 호출 대기
 *  - 전투 공식: damage = max(1, atk - def + random[-3..3]) / 회피 (agi 기반) / 크리 (random)
 */

import type {
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
    hero: buffedHero,
    rewards: { xp: 0, coins: 0, drops: [] },
    status: "active",
    speed: 1,
    activeBuffs: activeBuffs && activeBuffs.length > 0 ? activeBuffs : undefined,
    startedAt: Date.now(),
  };
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
        // 영웅 패배
        s.log.push({ type: "sessionEnd", reason: "defeat", timestamp: Date.now() });
        s.status = "completed";
        s.hero.hp = 0;
        return s;
      }
      if (combatState.monsterHp <= 0) {
        // 몬스터 처치 — victory. Phase 4b.3: xpBoost/coinBoost 반영
        const xpMult = 1 + getBuffBoost(s.activeBuffs, "xpBoost") / 100;
        const coinMult = 1 + getBuffBoost(s.activeBuffs, "coinBoost") / 100;
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
          // 세션 종료 (보스 도달 == 목표 달성)
          s.log.push({ type: "sessionEnd", reason: "victory", timestamp: Date.now() });
          s.status = "completed";
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
      return s;
    }
  }

  // 전투 중이 아닐 때: 다음 floor 로 가거나 새 이벤트/encounter 생성
  // 세션 종료 조건: currentFloor 가 startFloor + 10 이상이고 보스 도달 시 완료
  // (보스는 위에서 처리됨)

  // BOSS 연출 직후 (resumeSession 로 status=active 로 복귀한 다음 tick) — encounter 로 진입
  // 자연 종료 체크보다 먼저! floorsTraveled 에 걸려 잘리지 않게.
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

  // 이미 이번 세션에서 시작 층부터 여러 층 진행했다면 자연 종료 (보스 전까지 최대 10층)
  const floorsTraveled = s.currentFloor - s.startFloor;
  if (floorsTraveled >= 5 && !isBossFloor) {
    // 자연 종료 (목표 층 도달)
    s.log.push({ type: "sessionEnd", reason: "victory", timestamp: Date.now() });
    s.status = "completed";
    return s;
  }

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
    // choice 이벤트 — 사용자 선택 필요
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
    return s;
  }
  if (roll < encounterThreshold) {
    // treasure — Phase 4b.3: coinBoost 반영
    const coinMult = 1 + getBuffBoost(s.activeBuffs, "coinBoost") / 100;
    const coins = Math.round((5 + Math.floor(Math.random() * 16)) * coinMult);
    s.log.push({
      type: "treasure",
      coins,
      description: pickTreasureDescription(),
      timestamp: Date.now(),
    });
    s.rewards.coins += coins;
    return s;
  }

  // 나머지: encounter (monsterFreqDelta 만큼 확률 증감)
  const monster = createMonsterForFloor(s.dungeonId, s.currentFloor, false);
  s.log.push({ type: "encounter", monster, timestamp: Date.now() });
  return s;
}

/** 사용자 choice 선택 처리 → 효과 적용 + 진행 재개 */
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

  // 결과 narrative 기록
  if (option.resultText) {
    s.log.push({
      type: "narrative",
      text: `> ${option.label} → ${option.resultText}`,
      timestamp: Date.now(),
    });
  }

  // 효과 적용
  applyChoiceEffect(s, option.effect);

  s.status = "active";
  s.pendingChoiceIndex = undefined;
  return s;
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
        session.log.push({ type: "sessionEnd", reason: "defeat", timestamp: Date.now() });
        session.status = "completed";
      }
      break;
    case "heal":
      session.hero.hp = Math.min(session.hero.maxHp, session.hero.hp + effect.amount);
      break;
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
        // 몬스터만 공격 (기습)
        const outcome = rollEnemyOutcome(monster, stats);
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

  const options: ChoiceOption[] = [
    {
      label: "⚔ 싸운다",
      effect: { kind: "fight" },
    },
    {
      label: `🏃 도망간다 (${fleePct}%)`,
      effect: { kind: "flee", successChance: fleeChance },
    },
  ];

  // 30% 확률로 랜덤 이벤트 옵션 추가 (던전 flavor 에서 1개)
  if (Math.random() < 0.3) {
    const ev = pickEvent(s.dungeonId);
    // 이벤트에서 첫 옵션 하나만 picks — 단일 추가 선택지
    const evOption = ev.options[0];
    if (evOption) {
      options.push({
        label: `✦ ${evOption.label}`,
        effect: evOption.effect,
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
  // 영웅 공격
  const heroOutcome = rollHeroOutcome(stats, monster);
  const heroDmg =
    heroOutcome === "miss" || heroOutcome === "dodge"
      ? 0
      : computeHeroDamage(stats, monster, heroOutcome === "crit");
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

  // 몬스터 공격
  const enemyOutcome = rollEnemyOutcome(monster, stats);
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
}

/** 세션 포기 */
export function abandonSession(session: CombatSession): CombatSession {
  return {
    ...session,
    log: [...session.log, { type: "sessionEnd", reason: "abandoned", timestamp: Date.now() }],
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

/** 몬스터 공격의 outcome 판정 */
function rollEnemyOutcome(
  monster: Monster,
  stats: HeroBaseStats,
): CombatOutcome {
  // 공격자(몬스터) 실수 — 초반 floor 에서 허당치게 (base 8%, floor 60 에서 2% 바닥)
  const missChance = Math.max(0.02, 0.08 - monster.level * 0.001);
  if (Math.random() < missChance) return "miss";
  // 방어자(영웅) 회피 — agi scaling
  const dodgeChance = Math.min(0.25, stats.agi * 0.006);
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
