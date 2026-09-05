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
import { SELL_PRICE } from "@/types/uphero";
import { getEquipmentBaseName } from "@/data/upHeroEquipment";
import { placeAllIntoBag, trayOverflow } from "@/lib/upHeroBag";

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
 * 탐험 정산의 가방 반영 — 드롭을 격자 가방에 넣고, 정리 대기(트레이)가 넘치면
 * 초과분을 자동 판매한다. 순수 함수라 결과 모달의 미리보기도 같은 값을 쓴다.
 *
 * 넣는 순서는 `placeAllIntoBag` 의 배열 순서 first-fit, 넘침 선별은
 * `trayOverflow` 의 "최저 등급 먼저, 같은 등급이면 오래된 것 먼저" 다.
 * 판매가는 `SELL_PRICE` 한 곳에서만 온다 — 판매가 개편이 이 한 줄만 바꾸면 되게 둔다.
 *
 * @param rows 현재 영웅 레벨 기준 보드 행 수 (`bagRows`)
 * @returns inventory = 정산 후 인벤토리, sold = 자동 판매된 아이템, coins = 환급 코인
 */
export function settleBagAfterSession(
  inventory: Equipment[],
  keptDrops: Equipment[],
  rows: number,
): { inventory: Equipment[]; sold: Equipment[]; coins: number } {
  const withDrops = placeAllIntoBag(inventory, keptDrops, rows);
  // 판매 후보는 **이번 드롭만**. 이미 갖고 있던 아이템은 트레이가 넘쳐도 팔지 않는다
  //   (격자 도입 전 저장본의 넘침을 첫 탐험이 청산해 버리면 안 된다).
  const { keep, sell } = trayOverflow(
    withDrops,
    rows,
    undefined,
    keptDrops.map((d) => d.id),
  );
  const coins = sell.reduce((sum, item) => sum + (SELL_PRICE[item.rarity] ?? 0), 0);
  return { inventory: keep, sold: sell, coins };
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

  const sessionFloor = heroDied
    ? Math.floor(session.currentFloor / DUNGEON_CHECKPOINT_INTERVAL) *
      DUNGEON_CHECKPOINT_INTERVAL
    : session.currentFloor;

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
