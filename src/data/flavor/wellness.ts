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
      prompt: "치유의 전나무 숲. 수액이 반짝인다.",
      options: [
        {
          label: "수액 채집",
          outcomes: [
            {
              weight: 60,
              resultText: "향긋한 수액이 상처를 아물게 한다.",
              effects: [
                { kind: "heal", amount: 35 },
                { kind: "reward", coins: 15 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 25,
              resultText: "나무가 분노해 가지로 때렸다.",
              effects: [
                { kind: "damage", amount: 12 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 15,
              resultText: "요정의 축복이 깃든 수액을 얻었다.",
              effects: [
                { kind: "heal", amount: 70 },
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "경의만 표한다",
          outcomes: [
            {
              weight: 100,
              resultText: "숲이 잔잔히 숨쉰다.",
              effects: [
                { kind: "heal", amount: 10 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "어둠 속에 고양이 한 마리. 눈빛이 따뜻하다.",
      options: [
        {
          label: "쓰다듬기",
          outcomes: [
            {
              weight: 70,
              resultText: "고양이가 울며 마음을 달래주었다.",
              effects: [
                { kind: "heal", amount: 25 },
                { kind: "reward", xp: 10 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 20,
              resultText: "고양이가 앞길을 인도했다.",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "time", delta: -1 },
              ],
            },
            {
              weight: 10,
              resultText: "고양이가 변신! 수호 정령이었다.",
              effects: [
                { kind: "heal", amount: 60 },
                { kind: "reward", xp: 40 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
        {
          label: "모른 척 지나간다",
          outcomes: [
            {
              weight: 100,
              resultText: "고양이가 따라오지 않는다.",
              effects: [{ kind: "time", delta: -1 }],
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
    // Phase 12 R3 — pool 다양성 확장 (4 → 6).
    //   기존이 온천/수액/고양이/잠 4 개라 healing-centric 치우침.
    //   "같이 쉬는 타인" (동반자) / "소리 치유" (청각 이미지) 2 개 추가로 질감 보강.
    {
      prompt: "돌 위에 앉은 산책자가 인사를 건넨다.",
      options: [
        {
          label: "잠시 함께 쉰다",
          outcomes: [
            {
              weight: 55,
              resultText: "숨을 나누며 마음이 가벼워진다.",
              effects: [
                { kind: "heal", amount: 28 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 30,
              resultText: "산책자가 길을 지름길로 알려준다.",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 15,
              resultText: "사실은 늙은 현자였다. 조언이 폐부를 스친다.",
              effects: [
                { kind: "heal", amount: 20 },
                { kind: "reward", xp: 35 },
                { kind: "time", delta: -5 },
              ],
            },
          ],
        },
        {
          label: "눈인사만 건넨다",
          outcomes: [
            {
              weight: 100,
              resultText: "각자의 발걸음을 이어간다.",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "멀리서 풍경 소리가 들린다. 바람 따라 멜로디가 실려온다.",
      options: [
        {
          label: "소리를 쫓아간다",
          outcomes: [
            {
              weight: 55,
              resultText: "작은 풍경 아래 한참을 멈춘다. 호흡이 잔잔해진다.",
              effects: [
                { kind: "heal", amount: 22 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "소리를 낸 자는 악기 장인. 작은 호루라기를 건넨다.",
              effects: [
                { kind: "reward", coins: 35, xp: 15 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 15,
              resultText: "미궁의 환청이었다. 길을 잃을 뻔했다.",
              effects: [
                { kind: "damage", amount: 8 },
                { kind: "time", delta: -6 },
              ],
            },
          ],
        },
        {
          label: "무시하고 간다",
          outcomes: [
            {
              weight: 100,
              resultText: "소리가 점점 멀어진다.",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
];
