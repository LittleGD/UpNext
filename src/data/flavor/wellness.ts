/**
 * Up Hero — wellness 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const WELLNESS_EVENTS: DungeonEvent[] = [
    {
      prompt: "따뜻한 온천이 기다린다.",
      options: [
        {
          label: "몸 담그기",
          outcomes: [
            {
              weight: 65,
              resultText: "피로가 씻겨나간다. HP 대폭 회복.",
              effects: [
                { kind: "heal", amount: 60 },
                { kind: "time", delta: -8 },
              ],
            },
            {
              weight: 25,
              resultText: "온천의 정령이 영웅을 가득 채웠다.",
              effects: [
                { kind: "heal", amount: 100 },
                { kind: "time", delta: -10 },
              ],
            },
            {
              weight: 10,
              resultText: "물이 너무 뜨거워 살짝 데였다.",
              effects: [
                { kind: "heal", amount: 40 },
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -6 },
              ],
            },
          ],
        },
        {
          label: "계속 가기",
          outcomes: [
            {
              weight: 100,
              resultText: "미련을 뒤로 하고 간다.",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "잠들고 싶은 유혹.",
      options: [
        {
          label: "잠들기 (위험)",
          outcomes: [
            {
              weight: 50,
              resultText: "깨어나니 장비를 잃었다.",
              effects: [
                { kind: "damage", amount: 40 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 30,
              resultText: "깊이 잠들었다. 몸이 완전히 회복되었다.",
              effects: [
                { kind: "heal", amount: 100 },
                { kind: "time", delta: -15 },
              ],
            },
            {
              weight: 20,
              resultText: "악몽을 꾸다 깨어났다.",
              effects: [
                { kind: "damage", amount: 20 },
                { kind: "reward", coins: -30 },
                { kind: "time", delta: -10 },
              ],
            },
          ],
        },
        {
          label: "깨어있기",
          outcomes: [
            {
              weight: 75,
              resultText: "의지력으로 이겨냈다.",
              effects: [
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "깊은 호흡으로 정신을 가다듬었다.",
              effects: [
                { kind: "heal", amount: 10 },
                { kind: "reward", xp: 10 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
      ],
    },
];
