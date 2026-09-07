/**
 * Up Hero — 룬 상자(rune chest) 분기 이벤트.
 *
 * 별도 화면이 아니라 기존 `pickEvent` → `ChoicePanel` → `resolveChoice` 흐름에
 * 그대로 얹히는 이벤트다. 다른 이벤트와 다른 점은 딱 하나, 선택 결과를
 * `ChoiceResultModal` 대신 상자 연출 모달(`RuneChestModal`)이 받는다는 것.
 *
 * 도상/문구 규칙 — 2026-09 애플 2.3.6(개인 계정 simulated gambling 금지) 대응으로
 * 이 이벤트에서 도박 신호를 전부 걷어냈다. 돌아가는 드럼·레버·"대박"·"아깝다"·
 * 확률표는 쓰지 않는다. 상자와 자물쇠, 걸쇠를 맞추는 손의 어휘만 쓴다.
 * 근거는 `@/lib/upHeroSlot` 상단 주석.
 *
 * 파일·상수 이름의 slot 어휘는 와이어 호환(선택 효과 kind `spinSlot`, 저장 키
 * `shopDaily.slotSpins`) 때문에 남아 있다. 유저에게는 보이지 않는다.
 */

import type { DungeonEvent } from "./_types";
import { SLOT_SPIN_COST } from "@/lib/upHeroSlot";

/**
 * prompt literal 은 LRU (`session.recentEventPrompts`) 의 키로도 쓰이므로
 * 상수로 고정한다. `isSlotEvent` 가 이 값으로 판별한다.
 */
export const SLOT_EVENT_PROMPT =
  "무너진 사당 안쪽, 룬이 새겨진 낡은 상자 하나가 자물쇠를 문 채 놓여 있다.";

/**
 * choice 이벤트가 떴을 때 그것이 룬 상자일 확률.
 *
 * tick 당 choice 확률이 0.25 이므로 실제로는 tick 의 약 3%. 풀 클리어 런
 * (수백 tick) 에서 서너 번 마주치는 빈도라 `SLOT_DAILY_SPIN_CAP` 3 과 대략
 * 맞물린다. 더 흔해지면 "던전이 아니라 상자를 열러 들어가는" 게임이 된다.
 */
export const SLOT_EVENT_CHANCE = 0.12;

export const SLOT_EVENT: DungeonEvent = {
  prompt: SLOT_EVENT_PROMPT,
  promptKey: "uphero.slot.event.prompt",
  options: [
    {
      label: `코인 ${SLOT_SPIN_COST} 을 물리고 자물쇠를 맞춘다`,
      labelKey: "uphero.slot.option.spin",
      labelParams: { cost: SLOT_SPIN_COST },
      // resultText 를 일부러 비운다 — 비어 있으면 resolveChoice 가 일반
      //   choiceResult 를 push 하지 않고, spinSlot 효과가 상자 결과 엔트리를
      //   직접 push 한다. 결과 모달이 두 번 뜨는 것을 구조적으로 막는다.
      effect: { kind: "spinSlot", cost: SLOT_SPIN_COST },
    },
    {
      label: "손대지 않고 지나간다",
      labelKey: "uphero.slot.option.skip",
      effect: { kind: "nothing" },
      resultText: "먼지 앉은 자물쇠를 뒤로 하고 걸음을 옮겼다.",
      resultTextKey: "uphero.slot.result.skip",
    },
  ],
};

/** 이 이벤트가 룬 상자인가. prompt literal 이 판별 키. */
export function isSlotEvent(ev: { prompt: string }): boolean {
  return ev.prompt === SLOT_EVENT_PROMPT;
}
