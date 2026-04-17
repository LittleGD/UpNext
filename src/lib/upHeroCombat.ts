/**
 * Up Hero — 전투 해소 + 세션 로그 생성기.
 *
 * 설계:
 *  - tickSession() 1 호출 = 1 "step" (narrative / encounter / combat round / floor / event 중 하나)
 *  - choice 만나면 session.status = "awaitingChoice" 로 정지, 사용자 resolveChoice 호출 대기
 *  - 전투 공식: damage = max(1, atk - def + random[-3..3]) / 회피 (agi 기반) / 크리 (random)
 */

import type {
  CombatSession,
  Hero,
  LogEntry,
  Monster,
  Dungeon,
  Equipment,
  ChoiceOption,
  ChoiceEffect,
} from "@/types/uphero";
import { computeEffectiveStats } from "@/types/uphero";
import { createMonsterForFloor } from "@/data/upHeroMonsters";
import { pickNarrative, pickTreasureDescription, pickEvent } from "@/data/upHeroFlavor";
import { rollEquipmentDrop, rollDropRarity } from "@/data/upHeroEquipment";
import { DUNGEONS } from "@/data/upHeroDungeons";

/** 세션 시작 — 빈 log 로 생성 */
export function createSession(
  dungeonId: CombatSession["dungeonId"],
  hero: Hero,
  startFloor: number,
): CombatSession {
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
    hero: { ...hero, hp: hero.maxHp }, // 세션 시작 시 full HP
    rewards: { xp: 0, coins: 0, drops: [] },
    status: "active",
    speed: 1,
    startedAt: Date.now(),
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
        // 몬스터 처치 — victory
        s.log.push({
          type: "victory",
          monster,
          xp: monster.xpReward,
          coins: monster.coinReward,
          timestamp: Date.now(),
        });
        s.rewards.xp += monster.xpReward;
        s.rewards.coins += monster.coinReward;
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

        // 일반 몬스터: 30% drop
        if (Math.random() < 0.3) {
          const rarity = rollDropRarity(s.currentFloor);
          const eq = rollEquipmentDrop(s.dungeonId, s.currentFloor, rarity, dungeon.affinity);
          s.log.push({ type: "drop", equipment: eq, timestamp: Date.now() });
          s.rewards.drops.push(eq);
        }
        return s;
      }

      // 다음 전투 round
      const heroCritical = Math.random() < 0.1;
      const heroDodge = Math.random() < Math.min(0.2, stats.agi * 0.005);
      const enemyDodge = Math.random() < Math.min(0.15, monster.level * 0.005);

      // 영웅 공격
      if (enemyDodge) {
        s.log.push({
          type: "combat",
          attacker: "hero",
          damage: 0,
          dodged: true,
          timestamp: Date.now(),
        });
      } else {
        const dmg = Math.max(
          1,
          stats.str + Math.floor(Math.random() * 7) - 3 - monster.def,
        );
        const actualDmg = heroCritical ? dmg * 2 : dmg;
        s.log.push({
          type: "combat",
          attacker: "hero",
          damage: actualDmg,
          critical: heroCritical,
          timestamp: Date.now(),
        });
      }

      // 적 공격 (영웅이 회피 못하면)
      if (heroDodge) {
        s.log.push({
          type: "combat",
          attacker: "enemy",
          damage: 0,
          dodged: true,
          timestamp: Date.now(),
        });
      } else {
        const dmg = Math.max(
          1,
          monster.atk + Math.floor(Math.random() * 5) - 2 - Math.floor(stats.vit / 2),
        );
        s.log.push({
          type: "combat",
          attacker: "enemy",
          damage: dmg,
          timestamp: Date.now(),
        });
      }
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
  if (roll < 0.5) {
    // treasure
    const coins = 5 + Math.floor(Math.random() * 16);
    s.log.push({
      type: "treasure",
      coins,
      description: pickTreasureDescription(),
      timestamp: Date.now(),
    });
    s.rewards.coins += coins;
    return s;
  }

  // 나머지: encounter
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
      // 다음 floor 를 보스 floor 로 강제
      // (간단화: 바로 10F 로 점프 아니고, 다음 tick 에서 encounter 가 boss 로 나옴)
      // Phase 1-2 MVP 에서는 narrative 로만 처리
      session.log.push({
        type: "narrative",
        text: "보스의 기운이 느껴진다.",
        timestamp: Date.now(),
      });
      break;
    case "nothing":
      break;
  }
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
    if (e.dodged) continue;
    if (e.attacker === "hero") monsterHp -= e.damage;
    else heroHp -= e.damage;
  }
  return { heroHp: Math.max(0, heroHp), monsterHp: Math.max(0, monsterHp) };
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
