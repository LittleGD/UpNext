/**
 * Up Hero — mindfulness 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const MINDFULNESS_EVENTS: DungeonEvent[] = [
    {
      prompt: "명상의 샘이 있다.",
      options: [
        {
          label: "기도하기",
          outcomes: [
            {
              weight: 70,
              resultText: "내면의 평화가 HP 를 회복시킨다.",
              effects: [
                { kind: "heal", amount: 50 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "깊은 명상 상태에 빠졌다.",
              effects: [
                { kind: "heal", amount: 80 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 10,
              resultText: "샘의 정령이 지혜를 속삭였다.",
              effects: [
                { kind: "heal", amount: 20 },
                { kind: "reward", xp: 20 },
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
              resultText: "고개 숙여 지나간다.",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "그림자가 말을 건다: 진실을 보고 싶은가?",
      options: [
        {
          label: "예",
          outcomes: [
            {
              weight: 70,
              resultText: "진실이 드러난다. 보스의 위치를 알게 되었다.",
              effects: [{ kind: "revealBoss" }, { kind: "time", delta: -3 }],
            },
            {
              weight: 30,
              resultText: "진실의 무게가 영웅을 짓누른다.",
              effects: [
                { kind: "revealBoss" },
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -4 },
              ],
            },
          ],
        },
        {
          label: "아니오",
          outcomes: [
            {
              weight: 80,
              resultText: "거절하자 그림자가 사라지며 지혜를 남겼다.",
              effects: [
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -1 },
              ],
            },
            {
              weight: 20,
              resultText: "그림자가 떠나며 영혼을 다독였다.",
              effects: [
                { kind: "heal", amount: 15 },
                { kind: "reward", xp: 10 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
      ],
    },
];
