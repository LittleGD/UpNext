/**
 * Up Hero — mindfulness 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const MINDFULNESS_EVENTS: DungeonEvent[] = [
    {
      prompt: "명상의 샘이 있다.",
      promptKey: "uphero.flavor.mnd.0.prompt",
      options: [
        {
          label: "기도하기",
          labelKey: "uphero.flavor.mnd.0.opt0.label",
          outcomes: [
            {
              weight: 70,
              resultText: "내면의 평화가 HP 를 회복시킨다.",
              resultTextKey: "uphero.flavor.mnd.0.opt0.out0.result",
              effects: [
                { kind: "heal", amount: 50 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "깊은 명상 상태에 빠졌다.",
              resultTextKey: "uphero.flavor.mnd.0.opt0.out1.result",
              effects: [
                { kind: "heal", amount: 80 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 10,
              resultText: "샘의 정령이 지혜를 속삭였다.",
              resultTextKey: "uphero.flavor.mnd.0.opt0.out2.result",
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
          labelKey: "uphero.flavor.mnd.0.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "고개 숙여 지나간다.",
              resultTextKey: "uphero.flavor.mnd.0.opt1.out0.result",
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
      prompt: "기억의 연못. 물결 위에 떠오른 그림자가 흐려진다. 같은 쌍을 찾아라.",
      promptKey: "uphero.flavor.mnd.1.prompt",
      options: [
        {
          label: "응시한다",
          labelKey: "uphero.flavor.mnd.1.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "pair_match",
            difficulty: 2,
            successEffects: [
              { kind: "reward", xp: 65 },
              { kind: "heal", amount: 25 },
              { kind: "time", delta: -2 },
            ],
            failEffects: [
              { kind: "damage", amount: 8 },
              { kind: "time", delta: -4 },
            ],
          },
          resultText: "잔상이 엉킨다...",
          resultTextKey: "uphero.flavor.mnd.1.opt0.out0.result",
        },
        {
          label: "고개를 돌린다",
          labelKey: "uphero.flavor.mnd.1.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "기억을 두고 떠난다.",
              resultTextKey: "uphero.flavor.mnd.1.opt1.out0.result",
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
      prompt: "바위에 앉은 수행자가 호흡법을 전수해 주겠다고 한다.",
      promptKey: "uphero.flavor.mnd.2.prompt",
      options: [
        {
          label: "배운다",
          labelKey: "uphero.flavor.mnd.2.opt0.label",
          outcomes: [
            {
              weight: 70,
              resultText: "깊은 호흡이 정신을 가다듬었다.",
              resultTextKey: "uphero.flavor.mnd.2.opt0.out0.result",
              effects: [
                { kind: "heal", amount: 25 },
                { kind: "reward", xp: 30 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 30,
              resultText: "집중이 흐트러져 진전이 없었다.",
              resultTextKey: "uphero.flavor.mnd.2.opt0.out1.result",
              effects: [
                { kind: "time", delta: -5 },
                { kind: "runBuff", stat: "agi", pct: 5, floors: 5 },
              ],
            },
          ],
        },
        {
          label: "조용히 인사",
          labelKey: "uphero.flavor.mnd.2.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "수행자가 가볍게 끄덕였다.",
              resultTextKey: "uphero.flavor.mnd.2.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 10 },
                { kind: "time", delta: -1 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "종소리가 울리는 오래된 사당을 발견했다.",
      promptKey: "uphero.flavor.mnd.3.prompt",
      options: [
        {
          label: "종을 울린다",
          labelKey: "uphero.flavor.mnd.3.opt0.label",
          outcomes: [
            {
              weight: 55,
              resultText: "맑은 종소리가 마음을 씻었다.",
              resultTextKey: "uphero.flavor.mnd.3.opt0.out0.result",
              effects: [
                { kind: "heal", amount: 40 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 25,
              resultText: "너무 크게 울려 수호자가 깨어났다.",
              resultTextKey: "uphero.flavor.mnd.3.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 15 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 20,
              resultText: "세 번의 종소리에 길이 열렸다.",
              resultTextKey: "uphero.flavor.mnd.3.opt0.out2.result",
              effects: [
                { kind: "heal", amount: 20 },
                { kind: "skipFloors", count: 1 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
        {
          label: "지켜보기만 한다",
          labelKey: "uphero.flavor.mnd.3.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "정적이 마음을 평온하게 한다.",
              resultTextKey: "uphero.flavor.mnd.3.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 15 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "그림자가 말을 건다: 진실을 보고 싶은가?",
      promptKey: "uphero.flavor.mnd.4.prompt",
      options: [
        {
          label: "예",
          labelKey: "uphero.flavor.mnd.4.opt0.label",
          outcomes: [
            {
              weight: 70,
              resultText: "진실이 드러난다. 보스의 위치를 알게 되었다.",
              resultTextKey: "uphero.flavor.mnd.4.opt0.out0.result",
              effects: [{ kind: "revealBoss" }, { kind: "time", delta: -3 }],
            },
            {
              weight: 30,
              resultText: "진실의 무게가 영웅을 짓누른다.",
              resultTextKey: "uphero.flavor.mnd.4.opt0.out1.result",
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
          labelKey: "uphero.flavor.mnd.4.opt1.label",
          outcomes: [
            {
              weight: 80,
              resultText: "거절하자 그림자가 사라지며 지혜를 남겼다.",
              resultTextKey: "uphero.flavor.mnd.4.opt1.out0.result",
              effects: [
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -1 },
              ],
            },
            {
              weight: 20,
              resultText: "그림자가 떠나며 영혼을 다독였다.",
              resultTextKey: "uphero.flavor.mnd.4.opt1.out1.result",
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
    {
      prompt: "정화의 제단 앞. 향불 연기가 피어오른다. 숨을 깊이 모아 참아라.",
      promptKey: "uphero.flavor.mnd.5.prompt",
      options: [
        {
          label: "호흡을 모은다",
          labelKey: "uphero.flavor.mnd.5.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "breath_hold",
            difficulty: 2,
            successEffects: [
              { kind: "reward", xp: 70 },
              { kind: "heal", amount: 30 },
              { kind: "reward", coins: 25 },
              { kind: "time", delta: -2 },
            ],
            failEffects: [
              { kind: "damage", amount: 15 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "향불이 흔들린다...",
          resultTextKey: "uphero.flavor.mnd.5.opt0.out0.result",
        },
        {
          label: "천천히 예만 올린다",
          labelKey: "uphero.flavor.mnd.5.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "정중한 예에 제단이 잔잔히 빛났다.",
              resultTextKey: "uphero.flavor.mnd.5.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 15 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "돌바닥 위에 새겨진 만다라. 영혼의 인도자가 정해진 순서로 선을 따르라 이른다.",
      promptKey: "uphero.flavor.mnd.6.prompt",
      options: [
        {
          label: "선을 따라 그린다",
          labelKey: "uphero.flavor.mnd.6.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "trace_path",
            difficulty: 1,
            successEffects: [
              { kind: "reward", xp: 50 },
              { kind: "heal", amount: 20 },
              { kind: "reward", coins: 20 },
              { kind: "time", delta: -2 },
            ],
            failEffects: [
              { kind: "damage", amount: 10 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "손끝이 문양을 따라간다...",
          resultTextKey: "uphero.flavor.mnd.6.opt0.out0.result",
        },
        {
          label: "멀리서 묵상한다",
          labelKey: "uphero.flavor.mnd.6.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "멀리서 바라본 문양이 마음을 가라앉혔다.",
              resultTextKey: "uphero.flavor.mnd.6.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 20 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "경전 조각이 흩어진 선방. 같은 뜻을 가진 구절끼리 짝지어라.",
      promptKey: "uphero.flavor.mnd.7.prompt",
      options: [
        {
          label: "경전을 읽는다",
          labelKey: "uphero.flavor.mnd.7.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "pair_match",
            difficulty: 2,
            successEffects: [
              { kind: "reward", xp: 75 },
              { kind: "heal", amount: 25 },
              { kind: "reward", coins: 30 },
              { kind: "time", delta: -2 },
            ],
            failEffects: [
              { kind: "damage", amount: 18 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "글귀가 눈앞에서 어우러진다...",
          resultTextKey: "uphero.flavor.mnd.7.opt0.out0.result",
        },
        {
          label: "향만 피우고 떠난다",
          labelKey: "uphero.flavor.mnd.7.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "한 줄기 향이 선방을 감쌌다.",
              resultTextKey: "uphero.flavor.mnd.7.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 12 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
      ],
    },
];
