/**
 * Up Hero — Session reward pure helpers.
 *
 * Phase 5a.2: 이전에 useUpHeroStore.acknowledgeSessionEnd 에 번들로 있던
 * 5개 side-effect 를 pure state-transformer 로 분리.
 * 각 함수는 input → output 만 반환하고 외부 store 나 localStorage 에 손대지 않음.
 * 테스트 가능성 + 재사용성 확보.
 */

import type {
  CombatSession,
  Codex,
  DungeonProgress,
  Equipment,
  LogEntry,
  SessionEndReason,
} from "@/types/uphero";
import { getEquipmentBaseName } from "@/data/upHeroEquipment";

/**
 * 사망 시 drops 절반 유실 계산.
 * reason === "heroDied" / "defeat" (legacy) 면 `floor(N/2)` 만 유지.
 * 나머지 reason (bossDefeated/timeExpired/heroAbandoned) 은 전량 유지.
 */
export function calculateKeptDrops(session: CombatSession): Equipment[] {
  const lastEntry = session.log[session.log.length - 1];
  const reason: SessionEndReason | undefined =
    lastEntry?.type === "sessionEnd" ? lastEntry.reason : undefined;
  const heroDied = reason === "heroDied" || reason === "defeat";
  if (!heroDied) return session.rewards.drops;
  return session.rewards.drops.slice(
    0,
    Math.floor(session.rewards.drops.length / 2),
  );
}

/**
 * log 를 순회해서 실제 처치한 보스 floor 집합 반환.
 * Phase 4c-fix: reason 이 heroDied 여도 log 에 boss victory entry 가 있으면
 * 그 floor 는 기록. "boss" entry 다음에 "victory" 가 오는 패턴을 찾는다.
 *
 * @param existing 기존에 저장된 bossesDefeated 배열 (seed)
 * @returns 정렬된 번호 배열 (기존 + 이번 세션 새로 처치)
 */
export function calculateBossesDefeated(
  log: LogEntry[],
  existing: number[],
): number[] {
  const killedBossFloors = new Set<number>(existing);
  let lastBossFloor: number | null = null;
  for (const entry of log) {
    if (entry.type === "boss") lastBossFloor = entry.floor;
    if (
      entry.type === "victory" &&
      entry.monster.isBoss &&
      lastBossFloor != null
    ) {
      killedBossFloors.add(lastBossFloor);
      lastBossFloor = null;
    }
  }
  return [...killedBossFloors].sort((a, b) => a - b);
}

/**
 * log 에서 발견한 몬스터/보스/장비 템플릿을 기존 codex 에 누적.
 *
 * 저장 형식:
 * - monsters / bosses: monster.name (템플릿 이름, unique)
 * - equipment: template baseName (rarity prefix 제거한 이름, Phase 5b.2)
 */
export function calculateCodexDelta(log: LogEntry[], current: Codex): Codex {
  const monsters = new Set(current.monsters);
  const bosses = new Set(current.bosses);
  const equipment = new Set(current.equipment);
  for (const entry of log) {
    if (entry.type === "encounter") {
      if (entry.monster.isBoss) bosses.add(entry.monster.name);
      else monsters.add(entry.monster.name);
    }
    if (entry.type === "drop") {
      equipment.add(getEquipmentBaseName(entry.equipment));
    }
  }
  return {
    monsters: [...monsters],
    bosses: [...bosses],
    equipment: [...equipment],
  };
}

/**
 * 던전 진행 상황 갱신 — 도달 floor max + 처치한 보스 floor 반영.
 */
export function calculateDungeonProgress(
  session: CombatSession,
  existing: DungeonProgress | undefined,
  newBossesDefeated: number[],
): DungeonProgress {
  const reached = Math.max(
    existing?.floorReached ?? 0,
    session.currentFloor,
  );
  return {
    dungeonId: session.dungeonId,
    floorReached: reached,
    bossesDefeated: newBossesDefeated,
  };
}
