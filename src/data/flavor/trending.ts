/**
 * Up Hero — trending 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const TRENDING_EVENTS: DungeonEvent[] = [
    {
      prompt: "반짝이는 포털이 열렸다.",
      promptKey: "uphero.flavor.trd.0.prompt",
      options: [
        {
          label: "뛰어들기",
          labelKey: "uphero.flavor.trd.0.opt0.label",
          outcomes: [
            {
              weight: 50,
              resultText: "예상치 못한 곳으로 왔다! 두 층 건너뛴다.",
              resultTextKey: "uphero.flavor.trd.0.opt0.out0.result",
              effects: [
                { kind: "skipFloors", count: 2 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "차원의 균열에 휩쓸렸다.",
              resultTextKey: "uphero.flavor.trd.0.opt0.out1.result",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "damage", amount: 20 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 20,
              resultText: "포털 깊숙이 들어가 막대한 보물을 가져왔다.",
              resultTextKey: "uphero.flavor.trd.0.opt0.out2.result",
              effects: [
                { kind: "skipFloors", count: 3 },
                { kind: "reward", coins: 40 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "조심스레 피하기",
          labelKey: "uphero.flavor.trd.0.opt1.label",
          outcomes: [
            {
              weight: 80,
              resultText: "포털 가장자리의 반짝이를 수확했다.",
              resultTextKey: "uphero.flavor.trd.0.opt1.out0.result",
              effects: [
                { kind: "reward", coins: 20 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "포털 주변에서 차원 조각을 주웠다.",
              resultTextKey: "uphero.flavor.trd.0.opt1.out1.result",
              effects: [
                { kind: "reward", coins: 40, xp: 10 },
                { kind: "time", delta: -4 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "공중에 떠 있는 화면에 알 수 없는 슬로건이 번쩍거린다.",
      promptKey: "uphero.flavor.trd.1.prompt",
      options: [
        {
          label: "슬로건 따라하기",
          labelKey: "uphero.flavor.trd.1.opt0.label",
          outcomes: [
            {
              weight: 50,
              resultText: "화면이 웃는 듯 흔들린다 — 보상 분출!",
              resultTextKey: "uphero.flavor.trd.1.opt0.out0.result",
              effects: [
                { kind: "reward", coins: 30, xp: 20 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 30,
              resultText: "슬로건이 기계음으로 비웃는다.",
              resultTextKey: "uphero.flavor.trd.1.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 8 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "화면이 열리며 숨겨진 데이터를 내놓았다.",
              resultTextKey: "uphero.flavor.trd.1.opt0.out2.result",
              effects: [
                { kind: "reward", coins: 70, xp: 40 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "화면을 끈다",
          labelKey: "uphero.flavor.trd.1.opt1.label",
          outcomes: [
            {
              weight: 80,
              resultText: "고요가 돌아왔다.",
              resultTextKey: "uphero.flavor.trd.1.opt1.out0.result",
              effects: [
                { kind: "time", delta: -1 },
                { kind: "runCurse", stat: "agi", pct: 5, floors: 3 },
              ],
            },
            {
              weight: 20,
              resultText: "화면이 꺼지며 작은 칩 하나를 남겼다.",
              resultTextKey: "uphero.flavor.trd.1.opt1.out1.result",
              effects: [
                { kind: "reward", coins: 15 },
                { kind: "time", delta: -1 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "바이럴 밈이 공간을 지배한다. 따라 웃어야 할까?",
      promptKey: "uphero.flavor.trd.2.prompt",
      options: [
        {
          label: "함께 웃기",
          labelKey: "uphero.flavor.trd.2.opt0.label",
          outcomes: [
            {
              weight: 60,
              resultText: "기분 전환. 에너지가 돈다.",
              resultTextKey: "uphero.flavor.trd.2.opt0.out0.result",
              effects: [
                { kind: "heal", amount: 20 },
                { kind: "reward", xp: 25 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "억지 웃음으로 혼란스러워진다.",
              resultTextKey: "uphero.flavor.trd.2.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 6 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 15,
              resultText: "진심 어린 웃음이 공간을 물들였다.",
              resultTextKey: "uphero.flavor.trd.2.opt0.out2.result",
              effects: [
                { kind: "heal", amount: 40 },
                { kind: "reward", coins: 20, xp: 35 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
        {
          label: "무시",
          labelKey: "uphero.flavor.trd.2.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "유행이 지나간다.",
              resultTextKey: "uphero.flavor.trd.2.opt1.out0.result",
              effects: [
                { kind: "time", delta: -2 },
                { kind: "runCurse", stat: "dex", pct: 5, floors: 3 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "이상한 상자가 발광한다.",
      promptKey: "uphero.flavor.trd.3.prompt",
      options: [
        {
          label: "열어보기",
          labelKey: "uphero.flavor.trd.3.opt0.label",
          outcomes: [
            {
              weight: 50,
              resultText: "이상한 보물이 쏟아져 나왔다.",
              resultTextKey: "uphero.flavor.trd.3.opt0.out0.result",
              effects: [
                { kind: "reward", coins: 50, xp: 30 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 30,
              resultText: "상자가 폭발했다!",
              resultTextKey: "uphero.flavor.trd.3.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 20 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "초차원의 보물고였다.",
              resultTextKey: "uphero.flavor.trd.3.opt0.out2.result",
              effects: [
                { kind: "reward", coins: 100, xp: 50 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "폭발 위험 감수하고 피하기",
          labelKey: "uphero.flavor.trd.3.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "조심스레 지나쳤다.",
              resultTextKey: "uphero.flavor.trd.3.opt1.out0.result",
              effects: [
                { kind: "time", delta: -2 },
                { kind: "runCurse", stat: "agi", pct: 5, floors: 3 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "고대 룬 벽에 미세한 왜곡 하나가 숨어 일렁인다.",
      promptKey: "uphero.flavor.trd.4.prompt",
      options: [
        {
          label: "왜곡 지점을 찾아낸다",
          labelKey: "uphero.flavor.trd.4.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "spot_diff",
            difficulty: 3,
            successEffects: [
              { kind: "reward", xp: 80, coins: 45 },
              { kind: "time", delta: -2 },
            ],
            failEffects: [
              { kind: "damage", amount: 22 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "왜곡 속 비밀 룬이 깨어나 마나를 내어주었다.",
          resultTextKey: "uphero.flavor.trd.4.opt0.out0.result",
        },
        {
          label: "룬을 건드리지 않고 돌아간다",
          labelKey: "uphero.flavor.trd.4.opt1.label",
          outcomes: [
            {
              weight: 70,
              resultText: "룬이 잠잠해지며 희미한 반향만 남는다.",
              resultTextKey: "uphero.flavor.trd.4.opt1.out0.result",
              effects: [
                { kind: "time", delta: -2 },
                { kind: "runCurse", stat: "dex", pct: 5, floors: 3 },
              ],
            },
            {
              weight: 30,
              resultText: "벽 틈새에서 떨어진 마나 조각을 주웠다.",
              resultTextKey: "uphero.flavor.trd.4.opt1.out1.result",
              effects: [
                { kind: "reward", coins: 20, xp: 10 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "하늘이 찢기며 별똥별 소나기가 쏟아진다.",
      promptKey: "uphero.flavor.trd.5.prompt",
      options: [
        {
          label: "좌우로 피하며 별빛을 모은다",
          labelKey: "uphero.flavor.trd.5.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "dodge_drops",
            difficulty: 3,
            successEffects: [
              { kind: "reward", xp: 90, coins: 50 },
              { kind: "time", delta: -2 },
            ],
            failEffects: [
              { kind: "damage", amount: 25 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "별빛 소나기를 가르며 천상의 보상을 손에 넣었다.",
          resultTextKey: "uphero.flavor.trd.5.opt0.out0.result",
        },
        {
          label: "방벽 뒤로 몸을 숨긴다",
          labelKey: "uphero.flavor.trd.5.opt1.label",
          outcomes: [
            {
              weight: 75,
              resultText: "별똥별이 잦아들 때까지 버텨냈다.",
              resultTextKey: "uphero.flavor.trd.5.opt1.out0.result",
              effects: [
                { kind: "time", delta: -3 },
                { kind: "runBuff", stat: "agi", pct: 5, floors: 5 },
              ],
            },
            {
              weight: 25,
              resultText: "방벽에 박힌 별 조각을 긁어냈다.",
              resultTextKey: "uphero.flavor.trd.5.opt1.out1.result",
              effects: [
                { kind: "reward", coins: 25, xp: 15 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "시공의 균열이 열리기 직전, 신호가 점멸하기 시작한다.",
      promptKey: "uphero.flavor.trd.6.prompt",
      options: [
        {
          label: "신호가 바뀌는 순간 뛰어든다",
          labelKey: "uphero.flavor.trd.6.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "reaction_tap",
            difficulty: 3,
            successEffects: [
              { kind: "reward", xp: 70, coins: 40 },
              { kind: "heal", amount: 15 },
              { kind: "time", delta: -2 },
            ],
            failEffects: [
              { kind: "damage", amount: 20 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "완벽한 타이밍으로 균열을 통과해 시간의 보상을 거머쥐었다.",
          resultTextKey: "uphero.flavor.trd.6.opt0.out0.result",
        },
        {
          label: "균열이 닫힐 때까지 기다린다",
          labelKey: "uphero.flavor.trd.6.opt1.label",
          outcomes: [
            {
              weight: 60,
              resultText: "균열은 사라졌지만 흐릿한 잔상만 남았다.",
              resultTextKey: "uphero.flavor.trd.6.opt1.out0.result",
              effects: [
                { kind: "time", delta: -3 },
                { kind: "runBuff", stat: "agi", pct: 5, floors: 5 },
              ],
            },
            {
              weight: 30,
              resultText: "잔잔한 시간의 결을 느끼며 회복되었다.",
              resultTextKey: "uphero.flavor.trd.6.opt1.out1.result",
              effects: [
                { kind: "heal", amount: 20 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 10,
              resultText: "균열의 끝자락에서 떨어진 시간 조각을 주웠다.",
              resultTextKey: "uphero.flavor.trd.6.opt1.out2.result",
              effects: [
                { kind: "reward", coins: 30, xp: 20 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
      ],
    },
];
