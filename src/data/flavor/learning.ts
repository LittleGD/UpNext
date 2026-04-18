/**
 * Up Hero — learning 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const LEARNING_EVENTS: DungeonEvent[] = [
    {
      prompt: "수수께끼 문이 나타났다.",
      promptKey: "uphero.flavor.lrn.0.prompt",
      options: [
        {
          label: "수수께끼 도전",
          labelKey: "uphero.flavor.lrn.0.opt0.label",
          outcomes: [
            {
              weight: 60,
              resultText: "정답을 맞혀 지혜를 얻었다!",
              resultTextKey: "uphero.flavor.lrn.0.opt0.out0.result",
              effects: [
                { kind: "reward", xp: 50 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "풀다가 머리가 지끈거렸다.",
              resultTextKey: "uphero.flavor.lrn.0.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 5 },
                { kind: "reward", xp: 10 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 10,
              resultText: "최고 등급의 답을 제시했다. 문이 환하게 빛난다.",
              resultTextKey: "uphero.flavor.lrn.0.opt0.out2.result",
              effects: [
                { kind: "reward", xp: 100, coins: 50 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "뒤로 돌아가기",
          labelKey: "uphero.flavor.lrn.0.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "다른 길을 찾는다.",
              resultTextKey: "uphero.flavor.lrn.0.opt1.out0.result",
              effects: [{ kind: "time", delta: -10 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "먼지 덮인 책을 발견했다.",
      promptKey: "uphero.flavor.lrn.1.prompt",
      options: [
        {
          label: "읽어보기",
          labelKey: "uphero.flavor.lrn.1.opt0.label",
          outcomes: [
            {
              weight: 65,
              resultText: "지식과 동전을 함께 얻었다.",
              resultTextKey: "uphero.flavor.lrn.1.opt0.out0.result",
              effects: [
                { kind: "reward", xp: 30, coins: 10 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "책의 저주가 영웅을 괴롭힌다.",
              resultTextKey: "uphero.flavor.lrn.1.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 10,
              resultText: "금서였다. 깊은 통찰이 열렸다.",
              resultTextKey: "uphero.flavor.lrn.1.opt0.out2.result",
              effects: [
                { kind: "reward", xp: 60, coins: 30 },
                { kind: "time", delta: -4 },
              ],
            },
          ],
        },
        {
          label: "조심스레 덮기",
          labelKey: "uphero.flavor.lrn.1.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "건드리지 않고 지나간다.",
              resultTextKey: "uphero.flavor.lrn.1.opt1.out0.result",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    // Phase 12e — 수수께끼 퀴즈 3지선다 → 실제 인터랙티브 미니게임.
    //   각 event 는 "도전" 선택 시 startMinigame effect 로 모달 launch.
    //   성공 → XP/coin 보상 + 시간 -2, 실패 → HP 손상 + 시간 -3.
    //   "도망" 선택 시 기존 time -10 페널티 유지.
    {
      prompt: "수수께끼의 문: 기억의 그림이 흩뿌려져 있다. 같은 쌍을 찾아 문을 열어라.",
      promptKey: "uphero.flavor.lrn.2.prompt",
      options: [
        {
          label: "도전",
          labelKey: "uphero.flavor.lrn.2.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "pair_match",
            difficulty: 2,
            successEffects: [
              { kind: "reward", xp: 60, coins: 20 },
              { kind: "time", delta: -2 },
            ],
            failEffects: [
              { kind: "damage", amount: 10 },
              { kind: "time", delta: -4 },
            ],
          },
          resultText: "그림을 쳐다본다...",
          resultTextKey: "uphero.flavor.lrn.2.opt0.out0.result",
        },
        {
          label: "뒤로 돌아가기",
          labelKey: "uphero.flavor.lrn.2.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "다른 길을 찾는다.",
              resultTextKey: "uphero.flavor.lrn.2.opt1.out0.result",
              effects: [{ kind: "time", delta: -10 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "석판의 수수께끼: 고대 주문이 깜빡인다. 순서를 기억하라.",
      promptKey: "uphero.flavor.lrn.3.prompt",
      options: [
        {
          label: "도전",
          labelKey: "uphero.flavor.lrn.3.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "sequence_memo",
            difficulty: 2,
            successEffects: [
              { kind: "reward", xp: 70, coins: 20 },
              { kind: "time", delta: -2 },
            ],
            failEffects: [
              { kind: "damage", amount: 10 },
              { kind: "time", delta: -3 },
            ],
          },
          resultText: "주문을 외운다...",
          resultTextKey: "uphero.flavor.lrn.3.opt0.out0.result",
        },
        {
          label: "지나치기",
          labelKey: "uphero.flavor.lrn.3.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "다음으로.",
              resultTextKey: "uphero.flavor.lrn.3.opt1.out0.result",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "학자의 도면: 오래된 파이프가 막혔다. 연결을 복원해야 한다.",
      promptKey: "uphero.flavor.lrn.4.prompt",
      options: [
        {
          label: "도전",
          labelKey: "uphero.flavor.lrn.4.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "pipe_connect",
            difficulty: 2,
            successEffects: [
              { kind: "reward", xp: 80, coins: 25 },
              { kind: "time", delta: -3 },
            ],
            failEffects: [
              { kind: "damage", amount: 12 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "파이프에 손을 댄다...",
          resultTextKey: "uphero.flavor.lrn.4.opt0.out0.result",
        },
        {
          label: "너무 어려워 보인다",
          labelKey: "uphero.flavor.lrn.4.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "다른 길을 찾는다.",
              resultTextKey: "uphero.flavor.lrn.4.opt1.out0.result",
              effects: [{ kind: "time", delta: -3 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "학자의 유령이 공책을 내민다: \"필사하시겠습니까?\"",
      promptKey: "uphero.flavor.lrn.5.prompt",
      options: [
        {
          label: "필사한다",
          labelKey: "uphero.flavor.lrn.5.opt0.label",
          outcomes: [
            {
              weight: 55,
              resultText: "유령이 만족한 듯 고개를 끄덕인다.",
              resultTextKey: "uphero.flavor.lrn.5.opt0.out0.result",
              effects: [
                { kind: "reward", xp: 45 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 30,
              resultText: "공책의 저주가 손가락을 조였다.",
              resultTextKey: "uphero.flavor.lrn.5.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 12 },
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -6 },
              ],
            },
            {
              weight: 15,
              resultText: "숨겨진 공식을 발견했다.",
              resultTextKey: "uphero.flavor.lrn.5.opt0.out2.result",
              effects: [
                { kind: "reward", xp: 90, coins: 25 },
                { kind: "time", delta: -5 },
              ],
            },
          ],
        },
        {
          label: "공손히 거절",
          labelKey: "uphero.flavor.lrn.5.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "유령이 사라지며 미소를 남겼다.",
              resultTextKey: "uphero.flavor.lrn.5.opt1.out0.result",
              effects: [
                { kind: "reward", xp: 10 },
                { kind: "time", delta: -1 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "두 명의 현자가 서로 다른 가르침을 준다.",
      promptKey: "uphero.flavor.lrn.6.prompt",
      options: [
        {
          label: "백발 현자의 말을 듣는다",
          labelKey: "uphero.flavor.lrn.6.opt0.label",
          outcomes: [
            {
              weight: 70,
              resultText: "지혜로운 조언이었다. 경험이 깊어진다.",
              resultTextKey: "uphero.flavor.lrn.6.opt0.out0.result",
              effects: [
                { kind: "reward", xp: 40 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "말장난이었다.",
              resultTextKey: "uphero.flavor.lrn.6.opt0.out1.result",
              effects: [{ kind: "time", delta: -3 }],
            },
          ],
        },
        {
          label: "젊은 현자의 말을 듣는다",
          labelKey: "uphero.flavor.lrn.6.opt1.label",
          outcomes: [
            {
              weight: 60,
              resultText: "새로운 관점이 열렸다.",
              resultTextKey: "uphero.flavor.lrn.6.opt1.out0.result",
              effects: [
                { kind: "reward", xp: 35, coins: 10 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 40,
              resultText: "치기 어린 조언이었다.",
              resultTextKey: "uphero.flavor.lrn.6.opt1.out1.result",
              effects: [
                { kind: "reward", xp: 10 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
      ],
    },
];
