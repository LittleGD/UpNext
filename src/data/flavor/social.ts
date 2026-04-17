/**
 * Up Hero — social 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const SOCIAL_EVENTS: DungeonEvent[] = [
    {
      prompt: "수상한 상인이 나타났다.",
      options: [
        {
          label: "물건 구매 (80코인)",
          outcomes: [
            {
              weight: 60,
              resultText: "희귀 지식을 얻었다!",
              effects: [
                { kind: "reward", coins: -80, xp: 50 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "사기였다. 품질이 낮은 물건.",
              effects: [
                { kind: "reward", coins: -80 },
                { kind: "damage", amount: 15 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 15,
              resultText: "상인이 숨겨둔 보물까지 함께 넘겨줬다!",
              effects: [
                { kind: "reward", coins: -80, xp: 120 },
                { kind: "reward", coins: 50 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "지나치기",
          outcomes: [
            {
              weight: 100,
              resultText: "지나친다.",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "음유시인이 노래한다.",
      options: [
        {
          label: "감상하기",
          outcomes: [
            {
              weight: 70,
              resultText: "노래에 마음이 치유되었다.",
              effects: [
                { kind: "heal", amount: 25 },
                { kind: "reward", xp: 10 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 20,
              resultText: "긴 서사시를 끝까지 들었다.",
              effects: [
                { kind: "heal", amount: 40 },
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -8 },
              ],
            },
            {
              weight: 10,
              resultText: "짧은 후렴구만 듣고 지나갔다.",
              effects: [{ kind: "time", delta: -3 }],
            },
          ],
        },
        {
          label: "동전 주고 가기",
          outcomes: [
            {
              weight: 75,
              resultText: "동전을 주고 축복을 받았다.",
              effects: [
                { kind: "reward", coins: -10, xp: 30 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "음유시인이 깊은 축복을 내려주었다.",
              effects: [
                { kind: "reward", coins: -10, xp: 50 },
                { kind: "heal", amount: 10 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
      ],
    },
];
