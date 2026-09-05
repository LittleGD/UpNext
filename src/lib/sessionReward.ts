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
  DungeonId,
  DungeonProgress,
  Equipment,
  LogEntry,
  SessionEndReason,
} from "@/types/uphero";
import { getEquipmentBaseName } from "@/data/upHeroEquipment";
import { isBossFloor } from "@/lib/upHeroCombat";

/**
 * 사망 시 drops 유실 계산.
 * reason === "heroDied" / "defeat" (legacy) 면 drops 감산.
 *   - N >= 2: `floor(N/2)` 만 유지 (절반 유실).
 *   - N === 1: 50% 확률로 유지, 50% 확률로 유실.
 *     (기존 floor(1/2)=0 은 항상 0개라 "1개밖에 못 얻었는데 무조건 날아감"
 *     이라 체감이 너무 가혹했던 문제 완화.)
 * 나머지 reason (bossDefeated/timeExpired/heroAbandoned) 은 전량 유지.
 */
export function calculateKeptDrops(session: CombatSession): Equipment[] {
  const lastEntry = session.log[session.log.length - 1];
  const reason: SessionEndReason | undefined =
    lastEntry?.type === "sessionEnd" ? lastEntry.reason : undefined;
  const heroDied = reason === "heroDied" || reason === "defeat";
  if (!heroDied) return session.rewards.drops;
  const drops = session.rewards.drops;
  if (drops.length === 1) {
    return Math.random() < 0.5 ? drops : [];
  }
  return drops.slice(0, Math.floor(drops.length / 2));
}

/**
 * log 를 순회해서 실제 처치한 보스 floor 집합 반환.
 * Phase 4c-fix: reason 이 heroDied 여도 log 에 boss victory entry 가 있으면
 * 그 floor 는 기록. "boss" entry 다음에 "victory" 가 오는 패턴을 찾는다.
 * Phase 16 (Track C) — 층 값에 상한이 없다 (F40/F50/... 도 그대로 기록).
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
export function calculateCodexDelta(
  log: LogEntry[],
  current: Codex,
  rewardDrops: Equipment[] = [],
): Codex {
  const monsters = new Set(current.monsters);
  const bosses = new Set(current.bosses);
  const equipment = new Set(current.equipment);
  for (const entry of log) {
    if (entry.type === "encounter") {
      if (entry.monster.isBoss) bosses.add(entry.monster.name);
      else monsters.add(entry.monster.name);
    }
    if (entry.type === "drop" && !entry.equipment.photoId) {
      equipment.add(getEquipmentBaseName(entry.equipment));
    }
  }
  // Phase 6-E (Track E, 피드백 18) — session.rewards.drops 와 합집합. 로그는
  //   SESSION_LOG 상한으로 앞부분이 잘리지만 drops 는 전부 남아 있다. 사진 부적은
  //   템플릿이 없으므로 도감에 넣지 않는다.
  for (const eq of rewardDrops) {
    if (eq.photoId) continue;
    equipment.add(getEquipmentBaseName(eq));
  }
  return {
    monsters: [...monsters],
    bosses: [...bosses],
    equipment: [...equipment],
  };
}

/**
 * Phase 6-E (Track E, 피드백 22) — 가방 상한 분배.
 * room = max(0, cap - inventoryCount); 앞에서부터 room 개는 가방으로, 나머지는
 * overflowDrops 로. 순서를 바꾸지 않는다 (드롭 순 = 로그 순).
 * iOS SessionReward.splitDropsByCap 미러.
 */
export function splitDropsByCap(
  inventoryCount: number,
  drops: Equipment[],
  cap: number,
): { fits: Equipment[]; overflow: Equipment[] } {
  const room = Math.max(0, cap - inventoryCount);
  return { fits: drops.slice(0, room), overflow: drops.slice(room) };
}

/**
 * 로그라이크 체크포인트 단위 — 30층마다 진행이 저장된다.
 * 사망 시 현재 floor 를 이 단위로 내림 → 마지막 체크포인트까지만 영구 저장.
 */
export const DUNGEON_CHECKPOINT_INTERVAL = 30;

/**
 * 던전 진행 상황 갱신 — 도달 floor max + 처치한 보스 floor 반영.
 *
 * 로그라이크 규칙: 사망 시 (heroDied/defeat) 현재 floor 를 그대로 저장하지 않고
 * 30 단위 체크포인트로 내려서 저장한다. 예) F45 에서 사망 → 체크포인트 F30 저장.
 * 기존 최고기록은 절대 후퇴하지 않으므로 (Math.max) 이전 플레이의 성취는 유지된다.
 * 보스 처치 기록은 영구 — 로그라이크에서도 일회성이 아니라 Codex/재도전 unlock 용이다.
 *
 * Phase 16 (Track C, 피드백 19/26/31) — 보스층은 그 보스를 처치했을 때만 은행에
 * 들어간다. 보스층 (10 의 배수) 에서 포기/시간초과/사망으로 끝났는데 그 층의
 * 보스가 bossesDefeated 에 없으면 floorReached 는 한 층 뒤 (bossFloor - 1) 로
 * 저장된다. 이전엔 F20 에서 포기 → floorReached 20 → 다음 런 F21 시작 → F20 보스
 * 영구 스킵이었다. 사망 체크포인트 (F30 보스에게 죽으면 30) 도 같은 규칙으로
 * 29 가 된다. bestFloorReached 는 진짜 도달치를 그대로 보존한다.
 */
export function calculateDungeonProgress(
  session: CombatSession,
  existing: DungeonProgress | undefined,
  newBossesDefeated: number[],
): DungeonProgress {
  const lastEntry = session.log[session.log.length - 1];
  const reason: SessionEndReason | undefined =
    lastEntry?.type === "sessionEnd" ? lastEntry.reason : undefined;
  const heroDied = reason === "heroDied" || reason === "defeat";

  let sessionFloor = heroDied
    ? Math.floor(session.currentFloor / DUNGEON_CHECKPOINT_INTERVAL) *
      DUNGEON_CHECKPOINT_INTERVAL
    : session.currentFloor;
  if (isBossFloor(sessionFloor) && !newBossesDefeated.includes(sessionFloor)) {
    sessionFloor -= 1;
  }

  const reached = Math.max(existing?.floorReached ?? 0, sessionFloor);
  // bestFloorReached: 사망/체크포인트와 무관하게 실제 도달한 floor 의 역대 최고치.
  // floorReached 가 체크포인트로 내림될 때도 best 는 진짜 도달치를 보존.
  const best = Math.max(
    existing?.bestFloorReached ?? existing?.floorReached ?? 0,
    session.currentFloor,
    reached,
  );
  return {
    dungeonId: session.dungeonId,
    floorReached: reached,
    bestFloorReached: best,
    bossesDefeated: newBossesDefeated,
  };
}

/**
 * Phase 16 (Track C, 피드백 19/26) — 재진입 시작층.
 *
 * floorReached 이하의 미처치 보스층 중 가장 낮은 층, 없으면 floorReached + 1.
 * 이미 보스를 건너뛴 저장본 (예: floorReached 21, bossesDefeated [10]) 을
 * 마이그레이션 없이 고친다 — 다음 런이 F20 에서 시작하고 createSession 이
 * 시작층 보스를 바로 스폰한다. 클라우드 상태는 건드리지 않는다.
 * iOS SessionReward.resolveStartFloor 미러.
 */
export function resolveStartFloor(progress: DungeonProgress | undefined): number {
  const reached = progress?.floorReached ?? 0;
  const defeated = progress?.bossesDefeated ?? [];
  for (let b = 10; b <= reached; b += 10) {
    if (!defeated.includes(b)) return b;
  }
  return reached + 1;
}

/* ══════════════════════════════════════════════════════════════════════
 * Phase 16 (Track C, 피드백 30) — 주간 악몽 보상
 *
 * 저장 필드 없이 파생한다: 첫 클리어 = 이 던전이 아직 weeklyVariant.clearedDungeons
 * 에 없음, 올클리어 = 이번 정산이 clearedDungeons 를 7 → 8 로 넘김.
 * clearedDungeons 는 ISO 주가 바뀌면 비워지므로 (useUpHeroStore.initialize)
 * 전환은 주당 최대 한 번. acknowledgeSessionEnd (지급) 와 SessionResultModal
 * (표시) 가 같은 함수를 호출해 "보여준 것 = 준 것" 이 보장된다.
 * iOS SessionReward.computeWeeklyClearReward 미러 (상수는 '웹 X 와 같은 값').
 * ══════════════════════════════════════════════════════════════════════ */
export const WEEKLY_FIRST_CLEAR_COINS = 600;
export const WEEKLY_FIRST_CLEAR_DESTROY_GUARDS = 1;
export const WEEKLY_ALL_CLEAR_COINS = 3000;
export const WEEKLY_ALL_CLEAR_DESTROY_GUARDS = 2;
export const WEEKLY_ALL_CLEAR_DOWN_GUARDS = 3;
/** DUNGEONS 키 개수. sessionReward.test.ts 가 DUNGEON_LIST.length 와 대조한다. */
export const WEEKLY_DUNGEON_COUNT = 8;

export interface WeeklyClearReward {
  firstClear: boolean;
  allClear: boolean;
  coins: number;
  destroyGuards: number;
  downGuards: number;
}

export function computeWeeklyClearReward(
  session: Pick<CombatSession, "isWeeklyVariant" | "dungeonId" | "log">,
  weekly: { clearedDungeons: DungeonId[] } | null | undefined,
): WeeklyClearReward | null {
  if (!session.isWeeklyVariant || !weekly) return null;
  const clearedF30 = session.log.some(
    (e) => e.type === "victory" && e.monster.isBoss && e.monster.level === 30,
  );
  if (!clearedF30) return null;
  const cleared = new Set(weekly.clearedDungeons);
  if (cleared.has(session.dungeonId)) return null;
  const allClear = cleared.size === WEEKLY_DUNGEON_COUNT - 1;
  return {
    firstClear: true,
    allClear,
    coins: WEEKLY_FIRST_CLEAR_COINS + (allClear ? WEEKLY_ALL_CLEAR_COINS : 0),
    destroyGuards:
      WEEKLY_FIRST_CLEAR_DESTROY_GUARDS +
      (allClear ? WEEKLY_ALL_CLEAR_DESTROY_GUARDS : 0),
    downGuards: allClear ? WEEKLY_ALL_CLEAR_DOWN_GUARDS : 0,
  };
}
