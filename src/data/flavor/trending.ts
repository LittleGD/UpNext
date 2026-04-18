/**
 * Up Hero — trending 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const TRENDING_EVENTS: DungeonEvent[] = [
    {
      prompt: "반짝이는 포털이 열렸다.",
      options: [
        {
          label: "뛰어들기",
          outcomes: [
            {
              weight: 50,
              resultText: "예상치 못한 곳으로 왔다! 두 층 건너뛴다.",
              effects: [
                { kind: "skipFloors", count: 2 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "차원의 균열에 휩쓸렸다.",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "damage", amount: 20 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 20,
              resultText: "포털 깊숙이 들어가 막대한 보물을 가져왔다.",
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
          outcomes: [
            {
              weight: 80,
              resultText: "포털 가장자리의 반짝이를 수확했다.",
              effects: [
                { kind: "reward", coins: 20 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "포털 주변에서 차원 조각을 주웠다.",
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
      options: [
        {
          label: "슬로건 따라하기",
          outcomes: [
            {
              weight: 50,
              resultText: "화면이 웃는 듯 흔들린다 — 보상 분출!",
              effects: [
                { kind: "reward", coins: 30, xp: 20 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 30,
              resultText: "슬로건이 기계음으로 비웃는다.",
              effects: [
                { kind: "damage", amount: 8 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "화면이 열리며 숨겨진 데이터를 내놓았다.",
              effects: [
                { kind: "reward", coins: 70, xp: 40 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "화면을 끈다",
          outcomes: [
            {
              weight: 80,
              resultText: "고요가 돌아왔다.",
              effects: [{ kind: "time", delta: -1 }],
            },
            {
              weight: 20,
              resultText: "화면이 꺼지며 작은 칩 하나를 남겼다.",
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
      options: [
        {
          label: "함께 웃기",
          outcomes: [
            {
              weight: 60,
              resultText: "기분 전환. 에너지가 돈다.",
              effects: [
                { kind: "heal", amount: 20 },
                { kind: "reward", xp: 25 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "억지 웃음으로 혼란스러워진다.",
              effects: [
                { kind: "damage", amount: 6 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 15,
              resultText: "진심 어린 웃음이 공간을 물들였다.",
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
          outcomes: [
            {
              weight: 100,
              resultText: "유행이 지나간다.",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "이상한 상자가 발광한다.",
      options: [
        {
          label: "열어보기",
          outcomes: [
            {
              weight: 50,
              resultText: "이상한 보물이 쏟아져 나왔다.",
              effects: [
                { kind: "reward", coins: 50, xp: 30 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 30,
              resultText: "상자가 폭발했다!",
              effects: [
                { kind: "damage", amount: 20 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "초차원의 보물고였다.",
              effects: [
                { kind: "reward", coins: 100, xp: 50 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "폭발 위험 감수하고 피하기",
          outcomes: [
            {
              weight: 100,
              resultText: "조심스레 지나쳤다.",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
];
