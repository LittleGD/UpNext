/**
 * Up Hero — 굴림틀(rune drum) 분기 이벤트.
 *
 * 별도 화면이 아니라 기존 `pickEvent` → `ChoicePanel` → `resolveChoice` 흐름에
 * 그대로 얹히는 이벤트다. 다른 이벤트와 다른 점은 딱 하나, 선택 결과를
 * `ChoiceResultModal` 대신 드럼 연출 모달(`SlotMachineModal`)이 받는다는 것.
 *
 * 도상/문구 규칙 — 등급 13+ (Simulated Gambling: Infrequent) 를 감수하기로 했으므로
 * 레버·"대박"·"아깝다" 류는 허용한다. 픽셀아트 결과 던전 도상(7·체리·BAR 없음)은
 * 유지하고, 도박을 권유하는 톤은 피한다. 근거는 `@/lib/upHeroSlot` 상단 주석.
 */

import type { DungeonEvent } from "./_types";
import { SLOT_SPIN_COST } from "@/lib/upHeroSlot";

/**
 * prompt literal 은 LRU (`session.recentEventPrompts`) 의 키로도 쓰이므로
 * 상수로 고정한다. `isSlotEvent` 가 이 값으로 판별한다.
 */
export const SLOT_EVENT_PROMPT =
  "무너진 사당 안쪽, 룬이 새겨진 드럼 세 개짜리 낡은 굴림틀이 아직 돌아간다.";

/**
 * choice 이벤트가 떴을 때 그것이 굴림틀일 확률.
 *
 * tick 당 choice 확률이 0.25 이므로 실제로는 tick 의 약 3%. 풀 클리어 런
 * (수백 tick) 에서 서너 번 마주치는 빈도라 `SLOT_DAILY_SPIN_CAP` 3 과 대략
 * 맞물린다. 더 흔해지면 "던전이 아니라 장치를 하러 들어가는" 게임이 된다.
 */
export const SLOT_EVENT_CHANCE = 0.12;

export const SLOT_EVENT: DungeonEvent = {
  prompt: SLOT_EVENT_PROMPT,
  promptKey: "uphero.slot.event.prompt",
  options: [
    {
      label: `코인 ${SLOT_SPIN_COST} 을 넣고 손잡이를 당긴다`,
      labelKey: "uphero.slot.option.spin",
      labelParams: { cost: SLOT_SPIN_COST },
      // resultText 를 일부러 비운다 — 비어 있으면 resolveChoice 가 일반
      //   choiceResult 를 push 하지 않고, spinSlot 효과가 드럼 결과 엔트리를
      //   직접 push 한다. 결과 모달이 두 번 뜨는 것을 구조적으로 막는다.
      effect: { kind: "spinSlot", cost: SLOT_SPIN_COST },
    },
    {
      label: "손대지 않고 지나간다",
      labelKey: "uphero.slot.option.skip",
      effect: { kind: "nothing" },
      resultText: "먼지 앉은 손잡이를 뒤로 하고 걸음을 옮겼다.",
      resultTextKey: "uphero.slot.result.skip",
    },
  ],
};

/** 이 이벤트가 굴림틀인가. prompt literal 이 판별 키. */
export function isSlotEvent(ev: { prompt: string }): boolean {
  return ev.prompt === SLOT_EVENT_PROMPT;
}
