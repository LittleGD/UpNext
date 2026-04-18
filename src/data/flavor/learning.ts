/**
 * Up Hero — learning 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const LEARNING_EVENTS: DungeonEvent[] = [
    {
      prompt: "수수께끼 문이 나타났다.",
      options: [
        {
          label: "수수께끼 도전",
          outcomes: [
            {
              weight: 60,
              resultText: "정답을 맞혀 지혜를 얻었다!",
              effects: [
                { kind: "reward", xp: 50 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "풀다가 머리가 지끈거렸다.",
              effects: [
                { kind: "damage", amount: 5 },
                { kind: "reward", xp: 10 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 10,
              resultText: "최고 등급의 답을 제시했다. 문이 환하게 빛난다.",
              effects: [
                { kind: "reward", xp: 100, coins: 50 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "뒤로 돌아가기",
          outcomes: [
            {
              weight: 100,
              resultText: "다른 길을 찾는다.",
              effects: [{ kind: "time", delta: -10 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "먼지 덮인 책을 발견했다.",
      options: [
        {
          label: "읽어보기",
          outcomes: [
            {
              weight: 65,
              resultText: "지식과 동전을 함께 얻었다.",
              effects: [
                { kind: "reward", xp: 30, coins: 10 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "책의 저주가 영웅을 괴롭힌다.",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 10,
              resultText: "금서였다. 깊은 통찰이 열렸다.",
              effects: [
                { kind: "reward", xp: 60, coins: 30 },
                { kind: "time", delta: -4 },
              ],
            },
          ],
        },
        {
          label: "조심스레 덮기",
          outcomes: [
            {
              weight: 100,
              resultText: "건드리지 않고 지나간다.",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    // 수수께끼 퀴즈 — 유저가 실제 3지선다로 답을 골라 "미니게임" 형식.
    // 정답: XP 보상, 오답: 체력 손실. 무작위로 정답 위치 섞기보다 일관성 위해 고정.
    {
      prompt: "수수께끼: \"아침엔 네 발, 낮엔 두 발, 저녁엔 세 발.\" 정답은?",
      options: [
        {
          label: "짐승",
          outcomes: [
            {
              weight: 100,
              resultText: "틀렸다. 문이 웃는 듯 흔들린다.",
              effects: [
                { kind: "damage", amount: 8 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "인간",
          outcomes: [
            {
              weight: 100,
              resultText: "정답. 문이 환하게 열린다.",
              effects: [
                { kind: "reward", xp: 60 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
        {
          label: "시간",
          outcomes: [
            {
              weight: 100,
              resultText: "틀렸다. 그림자가 길어진다.",
              effects: [
                { kind: "damage", amount: 8 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "노인이 묻는다: \"많이 쥘수록 줄어드는 것은?\"",
      options: [
        {
          label: "금화",
          outcomes: [
            {
              weight: 100,
              resultText: "노인이 고개를 저었다.",
              effects: [
                { kind: "damage", amount: 6 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "모래",
          outcomes: [
            {
              weight: 100,
              resultText: "정답. 노인이 잔잔히 웃었다.",
              effects: [
                { kind: "reward", xp: 50, coins: 15 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
        {
          label: "시간",
          outcomes: [
            {
              weight: 100,
              resultText: "아쉽다. 노인이 한숨을 쉰다.",
              effects: [
                { kind: "reward", xp: 15 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "석판의 수수께끼: \"부르면 오지만, 잡으면 사라지는 것?\"",
      options: [
        {
          label: "바람",
          outcomes: [
            {
              weight: 100,
              resultText: "절반만 맞았다. 석판이 흐려진다.",
              effects: [
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "빛",
          outcomes: [
            {
              weight: 100,
              resultText: "틀렸다. 석판이 어두워진다.",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "소리",
          outcomes: [
            {
              weight: 100,
              resultText: "정답! 석판이 환히 빛났다.",
              effects: [
                { kind: "reward", xp: 70, coins: 20 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "학자의 유령이 공책을 내민다: \"필사하시겠습니까?\"",
      options: [
        {
          label: "필사한다",
          outcomes: [
            {
              weight: 55,
              resultText: "유령이 만족한 듯 고개를 끄덕인다.",
              effects: [
                { kind: "reward", xp: 45 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 30,
              resultText: "공책의 저주가 손가락을 조였다.",
              effects: [
                { kind: "damage", amount: 12 },
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -6 },
              ],
            },
            {
              weight: 15,
              resultText: "숨겨진 공식을 발견했다.",
              effects: [
                { kind: "reward", xp: 90, coins: 25 },
                { kind: "time", delta: -5 },
              ],
            },
          ],
        },
        {
          label: "공손히 거절",
          outcomes: [
            {
              weight: 100,
              resultText: "유령이 사라지며 미소를 남겼다.",
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
      options: [
        {
          label: "백발 현자의 말을 듣는다",
          outcomes: [
            {
              weight: 70,
              resultText: "지혜로운 조언이었다. 경험이 깊어진다.",
              effects: [
                { kind: "reward", xp: 40 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "말장난이었다.",
              effects: [{ kind: "time", delta: -3 }],
            },
          ],
        },
        {
          label: "젊은 현자의 말을 듣는다",
          outcomes: [
            {
              weight: 60,
              resultText: "새로운 관점이 열렸다.",
              effects: [
                { kind: "reward", xp: 35, coins: 10 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 40,
              resultText: "치기 어린 조언이었다.",
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
