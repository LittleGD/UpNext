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
      prompt: "떠들썩한 술집에서 영웅을 초대한다.",
      options: [
        {
          label: "이야기 나누기",
          outcomes: [
            {
              weight: 55,
              resultText: "흥미로운 모험담이 오갔다.",
              effects: [
                { kind: "reward", xp: 30 },
                { kind: "heal", amount: 10 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 25,
              resultText: "취객이 시비를 걸었다.",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "reward", xp: 15 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 20,
              resultText: "친구가 될 노병을 만났다.",
              effects: [
                { kind: "reward", xp: 40, coins: 25 },
                { kind: "heal", amount: 20 },
                { kind: "time", delta: -5 },
              ],
            },
          ],
        },
        {
          label: "조용히 나가기",
          outcomes: [
            {
              weight: 100,
              resultText: "조용한 밤을 택했다.",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "광장에서 관악단이 큰 소리로 연주한다.",
      options: [
        {
          label: "팁 던지기 (10 코인)",
          outcomes: [
            {
              weight: 65,
              resultText: "분위기에 녹아들어 기력이 돋는다.",
              effects: [
                { kind: "reward", coins: -10, xp: 25 },
                { kind: "heal", amount: 15 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "관악단 리더의 호응이 특별했다.",
              effects: [
                { kind: "reward", coins: -10, xp: 45 },
                { kind: "heal", amount: 25 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 15,
              resultText: "동전이 실수로 멀리 굴러갔다.",
              effects: [
                { kind: "reward", coins: -10 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "귀 막고 지나간다",
          outcomes: [
            {
              weight: 100,
              resultText: "시끄러움이 신경을 긁는다.",
              effects: [
                { kind: "damage", amount: 3 },
                { kind: "time", delta: -2 },
              ],
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
