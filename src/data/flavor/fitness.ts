/**
 * Up Hero — fitness 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const FITNESS_EVENTS: DungeonEvent[] = [
    {
      prompt: "가파른 절벽이 앞을 막는다.",
      promptKey: "uphero.flavor.fit.0.prompt",
      options: [
        {
          label: "점프로 넘기 (위험)",
          labelKey: "uphero.flavor.fit.0.opt0.label",
          outcomes: [
            {
              weight: 65,
              resultText: "영웅이 도약해 절벽을 뛰어넘었다! 한 층 건너뛴다.",
              resultTextKey: "uphero.flavor.fit.0.opt0.out0.result",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "발을 헛디뎌 크게 부딪혔다.",
              resultTextKey: "uphero.flavor.fit.0.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 20 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 10,
              resultText: "절벽 아래 숨겨진 동전 더미를 발견했다!",
              resultTextKey: "uphero.flavor.fit.0.opt0.out2.result",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "reward", coins: 40 },
                { kind: "time", delta: -1 },
              ],
            },
          ],
        },
        {
          label: "돌아서 우회",
          labelKey: "uphero.flavor.fit.0.opt1.label",
          outcomes: [
            {
              weight: 80,
              resultText: "안전하게 우회했다.",
              resultTextKey: "uphero.flavor.fit.0.opt1.out0.result",
              effects: [{ kind: "time", delta: -10 }],
            },
            {
              weight: 20,
              resultText: "우회길에서 잊혀진 배낭을 발견했다.",
              resultTextKey: "uphero.flavor.fit.0.opt1.out1.result",
              effects: [
                { kind: "reward", coins: 25 },
                { kind: "time", delta: -10 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "절벽 위 흔들다리. 리듬에 맞춰 건너야 떨어지지 않는다.",
      promptKey: "uphero.flavor.fit.1.prompt",
      options: [
        {
          label: "건너기",
          labelKey: "uphero.flavor.fit.1.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "sequence_memo",
            difficulty: 2,
            // Phase 12 R2 — 기존 skipFloors 보너스 제거 (다른 미니게임 대비 과보상).
            //   xp 65 + coin 25 로 3 미니게임 균형.
            successEffects: [
              { kind: "reward", xp: 65, coins: 25 },
              { kind: "time", delta: -2 },
            ],
            failEffects: [
              { kind: "damage", amount: 15 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "걸음 소리를 맞춰 본다...",
          resultTextKey: "uphero.flavor.fit.1.opt0.out0.result",
        },
        {
          label: "돌아서 내려가기",
          labelKey: "uphero.flavor.fit.1.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "안전하지만 느린 길.",
              resultTextKey: "uphero.flavor.fit.1.opt1.out0.result",
              effects: [{ kind: "time", delta: -10 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "산악인의 시신 옆에 금괴가 있다.",
      promptKey: "uphero.flavor.fit.2.prompt",
      options: [
        {
          label: "경례하고 가져가기",
          labelKey: "uphero.flavor.fit.2.opt0.label",
          outcomes: [
            {
              weight: 75,
              resultText: "고개를 숙인 뒤 금괴를 챙겼다.",
              resultTextKey: "uphero.flavor.fit.2.opt0.out0.result",
              effects: [
                { kind: "reward", coins: 50, xp: 10 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "금괴에 함정이 걸려 있었다.",
              resultTextKey: "uphero.flavor.fit.2.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "reward", coins: 30 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "건드리지 않기",
          labelKey: "uphero.flavor.fit.2.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "경의를 표하자 몸이 가벼워졌다.",
              resultTextKey: "uphero.flavor.fit.2.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 30 },
                { kind: "reward", xp: 5 },
                { kind: "time", delta: -1 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "폭풍이 몰아친다.",
      promptKey: "uphero.flavor.fit.3.prompt",
      options: [
        {
          label: "밀고 나가기",
          labelKey: "uphero.flavor.fit.3.opt0.label",
          outcomes: [
            {
              weight: 50,
              resultText: "바람에 맞아 상처 입었지만 전진했다.",
              resultTextKey: "uphero.flavor.fit.3.opt0.out0.result",
              effects: [
                { kind: "damage", amount: 20 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "휘청이다가 잊혀진 가방에 부딪혔다.",
              resultTextKey: "uphero.flavor.fit.3.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "reward", coins: 15 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 20,
              resultText: "이를 악물고 버틴 영웅이 성장했다.",
              resultTextKey: "uphero.flavor.fit.3.opt0.out2.result",
              effects: [
                { kind: "damage", amount: 5 },
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "대피 (시간 소모)",
          labelKey: "uphero.flavor.fit.3.opt1.label",
          outcomes: [
            {
              weight: 85,
              resultText: "동굴에서 폭풍이 지나가길 기다렸다.",
              resultTextKey: "uphero.flavor.fit.3.opt1.out0.result",
              effects: [{ kind: "time", delta: -15 }],
            },
            {
              weight: 15,
              resultText: "동굴 구석에서 오래된 동전 주머니를 발견했다.",
              resultTextKey: "uphero.flavor.fit.3.opt1.out1.result",
              effects: [
                { kind: "reward", coins: 40 },
                { kind: "time", delta: -15 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "두 갈래 등반 경로가 보인다.",
      promptKey: "uphero.flavor.fit.4.prompt",
      options: [
        {
          label: "⬈ 가파른 직선",
          labelKey: "uphero.flavor.fit.4.opt0.label",
          outcomes: [
            {
              weight: 55,
              resultText: "힘든 길이었지만 보물을 발견했다.",
              resultTextKey: "uphero.flavor.fit.4.opt0.out0.result",
              effects: [
                { kind: "reward", coins: 25, xp: 15 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "미끄러져 바위에 부딪혔다.",
              resultTextKey: "uphero.flavor.fit.4.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 15 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 15,
              resultText: "정상에서 잊혀진 자의 유산을 발견!",
              resultTextKey: "uphero.flavor.fit.4.opt0.out2.result",
              effects: [
                { kind: "reward", coins: 60, xp: 30 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "⬊ 완만한 우회",
          labelKey: "uphero.flavor.fit.4.opt1.label",
          outcomes: [
            {
              weight: 70,
              resultText: "여유로운 걸음으로 기력을 회복했다.",
              resultTextKey: "uphero.flavor.fit.4.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 15 },
                { kind: "time", delta: -8 },
              ],
            },
            {
              weight: 30,
              resultText: "길이 더 길었다. 예상보다 오래 걸린다.",
              resultTextKey: "uphero.flavor.fit.4.opt1.out1.result",
              effects: [{ kind: "time", delta: -12 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "바위 아래 깊은 크레바스.",
      promptKey: "uphero.flavor.fit.5.prompt",
      options: [
        {
          label: "로프로 내려가기",
          labelKey: "uphero.flavor.fit.5.opt0.label",
          outcomes: [
            {
              weight: 50,
              resultText: "아래 숨겨진 동전 더미를 발견!",
              resultTextKey: "uphero.flavor.fit.5.opt0.out0.result",
              effects: [
                { kind: "reward", coins: 80 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 30,
              resultText: "로프가 끊어지며 추락했다.",
              resultTextKey: "uphero.flavor.fit.5.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 25 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "크레바스 바닥에서 고대 유물을 찾았다.",
              resultTextKey: "uphero.flavor.fit.5.opt0.out2.result",
              effects: [
                { kind: "reward", coins: 150, xp: 20 },
                { kind: "time", delta: -5 },
              ],
            },
          ],
        },
        {
          label: "줄이 끊어질까 두렵다",
          labelKey: "uphero.flavor.fit.5.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "포기하고 다시 위로.",
              resultTextKey: "uphero.flavor.fit.5.opt1.out0.result",
              effects: [{ kind: "time", delta: -8 }],
            },
          ],
        },
      ],
    },
];
