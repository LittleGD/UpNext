/**
 * Up Hero — 이벤트/narrative 공용 facade.
 *
 * Phase 4c.3 refactor: 이전에 1,359 LoC 단일 파일이었던 EVENT_POOL /
 * UNIVERSAL_EVENTS / NARRATIVE_POOL 을 src/data/flavor/ 디렉터리로 분리.
 * 외부 모듈 (upHeroCombat 등) 은 여전히 이 파일에서만 import 하므로
 * 공개 API 는 불변. 유지보수 시 한 던전만 고치면 되도록 분할한 셈.
 */

import type { DungeonId, ChoiceOption } from "@/types/uphero";
import type { DungeonEvent } from "./flavor/_types";
import { NARRATIVE_POOL, TREASURE_DESCRIPTIONS } from "./flavor/narrative";
import { FITNESS_EVENTS } from "./flavor/fitness";
import { LEARNING_EVENTS } from "./flavor/learning";
import { MINDFULNESS_EVENTS } from "./flavor/mindfulness";
import { NUTRITION_EVENTS } from "./flavor/nutrition";
import { SOCIAL_EVENTS } from "./flavor/social";
import { PRODUCTIVITY_EVENTS } from "./flavor/productivity";
import { WELLNESS_EVENTS } from "./flavor/wellness";
import { TRENDING_EVENTS } from "./flavor/trending";
import { UNIVERSAL_EVENTS } from "./flavor/universal";

/** 재export — narrative / treasure pool */
export { NARRATIVE_POOL, TREASURE_DESCRIPTIONS, UNIVERSAL_EVENTS };

/** 던전별 이벤트 맵 — 기존 EVENT_POOL 과 동일한 shape */
export const EVENT_POOL: Record<DungeonId, DungeonEvent[]> = {
  fitness: FITNESS_EVENTS,
  learning: LEARNING_EVENTS,
  mindfulness: MINDFULNESS_EVENTS,
  nutrition: NUTRITION_EVENTS,
  social: SOCIAL_EVENTS,
  productivity: PRODUCTIVITY_EVENTS,
  wellness: WELLNESS_EVENTS,
  trending: TRENDING_EVENTS,
};

/** 랜덤 narrative 하나 선택 */
export function pickNarrative(dungeonId: DungeonId): string {
  const pool = NARRATIVE_POOL[dungeonId];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 랜덤 보물 설명 */
export function pickTreasureDescription(): string {
  return TREASURE_DESCRIPTIONS[
    Math.floor(Math.random() * TREASURE_DESCRIPTIONS.length)
  ];
}

/**
 * Phase 11a — 시간 회복 이벤트 flavor.
 * treasure 이벤트의 35% 확률 variant 에서 사용. 세계관 보존을 위해 던전 무관
 * 공용 문구 8개. 끝에 "— 시간 +N" 이 자동 append 되므로 본문은 "휴식처" 맥락만.
 */
const REST_DESCRIPTIONS = [
  "모닥불을 발견했다",
  "조용한 샘터에서 숨을 고른다",
  "이끼가 낀 바위에 앉아 잠시 쉰다",
  "바람이 잦은 은신처에 들었다",
  "별빛이 스며드는 동굴에서 한숨 돌린다",
  "낮은 돌담 아래 등을 기댔다",
  "오래된 여행자 표식 옆에서 쉰다",
  "마른 장작을 태워 온기를 챙겼다",
] as const;

export function pickRestDescription(): string {
  return REST_DESCRIPTIONS[
    Math.floor(Math.random() * REST_DESCRIPTIONS.length)
  ];
}

/**
 * Phase 12 — 캠프 홈 분위기 텍스트 pool.
 *
 * 이전에는 "모닥불이 조용히 타오른다" 한 줄 하드코딩 → 캠프에 들를 때마다 같은
 * 문구 → "정지 화면" 느낌. 유저 피드백: "가끔 다른 걸로도 바뀌면 더 재밌을 것
 * 같아." 15 줄의 pool 에서 매 mount 시 랜덤 선택 + 일정 주기로 교체해 "시간이
 * 흐르는 쉼터" 감각. fire-flicker 애니메이션과 어울리도록 불 / 밤 / 여행자 톤
 * 유지 (사이버/테크 톤 배제).
 */
const CAMP_AMBIENCE = [
  "모닥불이 조용히 타오른다",
  "장작이 탁, 하고 튀었다",
  "재 속에서 붉은 숨이 깜빡인다",
  "연기가 느리게 하늘로 번진다",
  "불씨 하나가 바람을 따라 올라갔다",
  "주전자가 나지막이 끓고 있다",
  "지도를 다시 펼쳐본다",
  "천막 너머로 별이 번진다",
  "바람이 먼 곳에서 불어온다",
  "밤이 한 겹 더 깊어졌다",
  "발자국 소리가 멀어진다",
  "무기의 날을 한 번 갈아둔다",
  "오늘의 피로가 천천히 가신다",
  "모닥불 그림자가 길게 늘어진다",
  "여행자의 일기에 한 줄을 적는다",
] as const;

/**
 * 직전 문구를 `exclude` 로 넘기면 연속 중복을 회피한다. pool 1 개 이하 edge
 *   case 는 그대로 반환 (무한 루프 방지).
 */
export function pickCampAmbience(exclude?: string): string {
  if (!exclude || CAMP_AMBIENCE.length <= 1) {
    return CAMP_AMBIENCE[Math.floor(Math.random() * CAMP_AMBIENCE.length)];
  }
  const filtered = CAMP_AMBIENCE.filter((line) => line !== exclude);
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export { CAMP_AMBIENCE };

/**
 * 랜덤 이벤트 — 던전 고유 이벤트 + 범용 이벤트 를 섞어서 풍부하게.
 * 60% 던전 고유, 40% 범용.
 */
/**
 * Phase 12 R1 — session 또는 dungeonId 받기. recentEventPrompts (LRU 3) 에 포함된
 *   이벤트는 제외해 연속 반복 완화. pool 전체가 recent 인 엣지 케이스는 원래 pool.
 */
export function pickEvent(
  sessionOrDungeon:
    | DungeonId
    | { dungeonId: DungeonId; recentEventPrompts?: string[] },
): DungeonEvent {
  const dungeonId =
    typeof sessionOrDungeon === "string"
      ? sessionOrDungeon
      : sessionOrDungeon.dungeonId;
  const recent =
    typeof sessionOrDungeon === "string"
      ? []
      : (sessionOrDungeon.recentEventPrompts ?? []);

  const useDungeon = Math.random() < 0.6;
  const pool = useDungeon ? EVENT_POOL[dungeonId] : UNIVERSAL_EVENTS;
  // Phase 12 R2 — 작은 pool 에서 LRU 고갈 방지. pool 크기 기준 max(1, pool-1) 개만 제외.
  //   예: pool 4 + recent 3 전부 pool 원소 → 필터 결과 1 남음 (OK). pool 3 은 최대 2 만 제외.
  const maxExclude = Math.max(1, pool.length - 1);
  const excludeSet = new Set(recent.slice(-maxExclude));
  const filtered = pool.filter((ev) => !excludeSet.has(ev.prompt));
  const effective = filtered.length > 0 ? filtered : pool;
  return effective[Math.floor(Math.random() * effective.length)];
}

/**
 * 낮은 HP 전투 중 도망 선택지 — 전투 긴장감 강화용.
 * (현재 사용되지 않는 helper — 추후 Phase 에서 activation)
 */
export function buildRetreatChoice(currentFloor: number): {
  prompt: string;
  options: ChoiceOption[];
} {
  return {
    prompt: "영웅이 휘청인다. 더 싸우면 위험하다.",
    options: [
      {
        label: "마지막 일격",
        effect: { kind: "nothing" },
        resultText: "이를 악물고 전투를 이어간다!",
      },
      {
        label: "후퇴 — 캠프로",
        effect: { kind: "damage", amount: 0 },
        resultText: `F${currentFloor} 에서 후퇴. 획득한 보상은 유지된다.`,
      },
    ],
  };
}
