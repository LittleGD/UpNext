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
import {
  NARRATIVE_POOL,
  TREASURE_DESCRIPTIONS,
  NARRATIVE_POOL_IDS,
  TREASURE_IDS,
  REST_IDS,
} from "./flavor/narrative";
import { FITNESS_EVENTS } from "./flavor/fitness";
import { LEARNING_EVENTS } from "./flavor/learning";
import { MINDFULNESS_EVENTS } from "./flavor/mindfulness";
import { NUTRITION_EVENTS } from "./flavor/nutrition";
import { SOCIAL_EVENTS } from "./flavor/social";
import { PRODUCTIVITY_EVENTS } from "./flavor/productivity";
import { WELLNESS_EVENTS } from "./flavor/wellness";
import { TRENDING_EVENTS } from "./flavor/trending";
import { UNIVERSAL_EVENTS } from "./flavor/universal";
import { SLOT_EVENT, SLOT_EVENT_CHANCE } from "./flavor/slot";

/** 재export — narrative / treasure pool (legacy fallback) + i18n key arrays */
export {
  NARRATIVE_POOL,
  TREASURE_DESCRIPTIONS,
  UNIVERSAL_EVENTS,
  NARRATIVE_POOL_IDS,
  TREASURE_IDS,
  REST_IDS,
};

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

/** 랜덤 narrative 하나 선택 — 한국어 legacy fallback (i18n key 미보유 경로 전용) */
export function pickNarrative(dungeonId: DungeonId): string {
  const pool = NARRATIVE_POOL[dungeonId];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 랜덤 보물 설명 — 한국어 legacy fallback */
export function pickTreasureDescription(): string {
  return TREASURE_DESCRIPTIONS[
    Math.floor(Math.random() * TREASURE_DESCRIPTIONS.length)
  ];
}

/**
 * Phase 14 i18n — 같은 index 의 narrative i18n key + 한국어 fallback 쌍을 반환.
 *   호출자 (upHeroCombat) 는 key 를 로그 엔트리의 `narrativeKey` 로 저장하고,
 *   한국어 fallback 을 `text` 로 저장한다. CombatLog 가 현재 언어로 풀이한다.
 */
export function pickNarrativeWithKey(dungeonId: DungeonId): {
  key: string;
  text: string;
} {
  const idx = Math.floor(Math.random() * NARRATIVE_POOL[dungeonId].length);
  return {
    key: NARRATIVE_POOL_IDS[dungeonId][idx],
    text: NARRATIVE_POOL[dungeonId][idx],
  };
}

/**
 * Phase 14 i18n — 보물 설명 i18n key + 한국어 fallback 쌍.
 */
export function pickTreasureWithKey(): { key: string; text: string } {
  const idx = Math.floor(Math.random() * TREASURE_DESCRIPTIONS.length);
  return {
    key: TREASURE_IDS[idx],
    text: TREASURE_DESCRIPTIONS[idx],
  };
}

/**
 * Phase 11a — 시간 회복 이벤트 flavor.
 * treasure 이벤트의 35% 확률 variant 에서 사용. 세계관 보존을 위해 던전 무관
 * 공용 문구 8개. 끝에 "— 시간 +N" 이 자동 append 되므로 본문은 "휴식처" 맥락만.
 */
export const REST_DESCRIPTIONS = [
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
 * Phase 14 i18n — 휴식처 설명 i18n key + 한국어 fallback 쌍.
 */
export function pickRestWithKey(): { key: string; text: string } {
  const idx = Math.floor(Math.random() * REST_DESCRIPTIONS.length);
  return {
    key: REST_IDS[idx],
    text: REST_DESCRIPTIONS[idx],
  };
}

/**
 * Phase 12 — 캠프 홈 분위기 텍스트 pool (i18n keys).
 *
 * 이전에는 한국어 literal 배열이었으나, Phase 12 i18n 작업에서 각 라인을
 *   `uphero.camp.ambience.1` ~ `.15` 로 분리. 이 배열은 key 만 반환하고,
 *   실제 표시는 컴포넌트에서 `t()` 로 현재 언어 조회.
 */
const CAMP_AMBIENCE_KEYS = [
  "uphero.camp.ambience.1",
  "uphero.camp.ambience.2",
  "uphero.camp.ambience.3",
  "uphero.camp.ambience.4",
  "uphero.camp.ambience.5",
  "uphero.camp.ambience.6",
  "uphero.camp.ambience.7",
  "uphero.camp.ambience.8",
  "uphero.camp.ambience.9",
  "uphero.camp.ambience.10",
  "uphero.camp.ambience.11",
  "uphero.camp.ambience.12",
  "uphero.camp.ambience.13",
  "uphero.camp.ambience.14",
  "uphero.camp.ambience.15",
] as const;

/**
 * 직전 key 를 `exclude` 로 넘기면 연속 중복을 회피한다.
 * 반환값은 i18n key. 컴포넌트에서 `t(key)` 로 현재 언어 조회.
 */
export function pickCampAmbience(exclude?: string): string {
  if (!exclude || CAMP_AMBIENCE_KEYS.length <= 1) {
    return CAMP_AMBIENCE_KEYS[
      Math.floor(Math.random() * CAMP_AMBIENCE_KEYS.length)
    ];
  }
  const filtered = CAMP_AMBIENCE_KEYS.filter((k) => k !== exclude);
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export { CAMP_AMBIENCE_KEYS };

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
    | {
        dungeonId: DungeonId;
        recentEventPrompts?: string[];
        /**
         * 굴림틀을 후보에 넣어도 되는가. 호출자(전투 로직)가 코인 잔액과 굴림
         * 상한을 보고 판정해 넘긴다. false 면 굴림틀은 아예 뽑히지 않는다 —
         * 돌릴 수 없는 장치를 띄우면 "선택지 없는 선택지" 가 되기 때문이다.
         */
        slotAvailable?: boolean;
      },
): DungeonEvent {
  const dungeonId =
    typeof sessionOrDungeon === "string"
      ? sessionOrDungeon
      : sessionOrDungeon.dungeonId;
  const recent =
    typeof sessionOrDungeon === "string"
      ? []
      : (sessionOrDungeon.recentEventPrompts ?? []);
  const slotAvailable =
    typeof sessionOrDungeon === "string"
      ? false
      : (sessionOrDungeon.slotAvailable ?? false);

  // 굴림틀은 던전/범용 pool 어디에도 넣지 않고 여기서 따로 저울질한다. pool 에
  //   섞으면 던전마다 등장률이 갈리고 (던전 pool 크기가 제각각) LRU 필터에
  //   휩쓸려 확률이 흐려진다. 상한·잔액 게이트도 pool 안에서는 표현할 수 없다.
  if (slotAvailable && !recent.includes(SLOT_EVENT.prompt)) {
    if (Math.random() < SLOT_EVENT_CHANCE) return SLOT_EVENT;
  }

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
