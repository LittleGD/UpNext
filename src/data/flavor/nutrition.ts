/**
 * Up Hero — nutrition 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const NUTRITION_EVENTS: DungeonEvent[] = [
    {
      prompt: "맛있어 보이는 열매가 있다.",
      promptKey: "uphero.flavor.ntr.0.prompt",
      options: [
        {
          label: "먹어보기",
          labelKey: "uphero.flavor.ntr.0.opt0.label",
          outcomes: [
            {
              weight: 60,
              resultText: "달콤하다. HP 회복.",
              resultTextKey: "uphero.flavor.ntr.0.opt0.out0.result",
              effects: [
                { kind: "heal", amount: 40 },
                { kind: "time", delta: -1 },
              ],
            },
            {
              weight: 30,
              resultText: "쓴맛이 돈다 — 독 열매였다.",
              resultTextKey: "uphero.flavor.ntr.0.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 15 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 10,
              resultText: "진귀한 약재였다. 몸이 튼튼해진다.",
              resultTextKey: "uphero.flavor.ntr.0.opt0.out2.result",
              effects: [
                { kind: "heal", amount: 60 },
                { kind: "reward", xp: 15 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
        {
          label: "안 먹기",
          labelKey: "uphero.flavor.ntr.0.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "조심스레 지나친다.",
              resultTextKey: "uphero.flavor.ntr.0.opt1.out0.result",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "맑은 샘물에서 물소리가 들린다.",
      promptKey: "uphero.flavor.ntr.1.prompt",
      options: [
        {
          label: "물을 마신다",
          labelKey: "uphero.flavor.ntr.1.opt0.label",
          outcomes: [
            {
              weight: 70,
              resultText: "시원한 물이 몸에 스며든다.",
              resultTextKey: "uphero.flavor.ntr.1.opt0.out0.result",
              effects: [
                { kind: "heal", amount: 30 },
                { kind: "time", delta: -1 },
              ],
            },
            {
              weight: 20,
              resultText: "물속 정령이 축복을 내렸다.",
              resultTextKey: "uphero.flavor.ntr.1.opt0.out1.result",
              effects: [
                { kind: "heal", amount: 50 },
                { kind: "reward", xp: 15 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 10,
              resultText: "오염된 물이었다.",
              resultTextKey: "uphero.flavor.ntr.1.opt0.out2.result",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
        {
          label: "마시지 않는다",
          labelKey: "uphero.flavor.ntr.1.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "목이 마르지만 참는다.",
              resultTextKey: "uphero.flavor.ntr.1.opt1.out0.result",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "방치된 텃밭에 야생 약초가 자라있다.",
      promptKey: "uphero.flavor.ntr.2.prompt",
      options: [
        {
          label: "약초 채집",
          labelKey: "uphero.flavor.ntr.2.opt0.label",
          outcomes: [
            {
              weight: 60,
              resultText: "귀한 약초를 모았다.",
              resultTextKey: "uphero.flavor.ntr.2.opt0.out0.result",
              effects: [
                { kind: "reward", coins: 25, xp: 10 },
                { kind: "heal", amount: 15 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 25,
              resultText: "가시에 찔려 피를 흘렸다.",
              resultTextKey: "uphero.flavor.ntr.2.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 8 },
                { kind: "reward", coins: 10 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 15,
              resultText: "영약 재료를 발견!",
              resultTextKey: "uphero.flavor.ntr.2.opt0.out2.result",
              effects: [
                { kind: "reward", coins: 60, xp: 25 },
                { kind: "heal", amount: 30 },
                { kind: "time", delta: -5 },
              ],
            },
          ],
        },
        {
          label: "눈길만 주고 지나간다",
          labelKey: "uphero.flavor.ntr.2.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "다음을 기약한다.",
              resultTextKey: "uphero.flavor.ntr.2.opt1.out0.result",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "농부가 도움을 청한다.",
      promptKey: "uphero.flavor.ntr.3.prompt",
      options: [
        {
          label: "돕기",
          labelKey: "uphero.flavor.ntr.3.opt0.label",
          outcomes: [
            {
              weight: 60,
              resultText: "농부가 고맙다며 금화를 준다.",
              resultTextKey: "uphero.flavor.ntr.3.opt0.out0.result",
              effects: [
                { kind: "reward", coins: 30 },
                { kind: "time", delta: -8 },
              ],
            },
            {
              weight: 30,
              resultText: "농부의 밭에서 큰 수확물을 얻었다.",
              resultTextKey: "uphero.flavor.ntr.3.opt0.out1.result",
              effects: [
                { kind: "reward", coins: 50 },
                { kind: "heal", amount: 15 },
                { kind: "time", delta: -10 },
              ],
            },
            {
              weight: 10,
              resultText: "일이 꼬였다. 장비에 상처가 났다.",
              resultTextKey: "uphero.flavor.ntr.3.opt0.out2.result",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -12 },
              ],
            },
          ],
        },
        {
          label: "바쁘다",
          labelKey: "uphero.flavor.ntr.3.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "다음 길을 간다.",
              resultTextKey: "uphero.flavor.ntr.3.opt1.out0.result",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
    // Phase 12 R3 — pool 다양성 확장 (4 → 6).
    //   기존 풀이 열매 / 샘물 / 약초 / 농부 4 개뿐이라 중반 이후 LRU 3 제외해도
    //   같은 이벤트 2 회차 반복. 의외성 + 외부 존재 (버섯/저장고) 2 개 추가.
    {
      prompt: "이끼 낀 바위 아래 야생 버섯이 보인다.",
      promptKey: "uphero.flavor.ntr.4.prompt",
      options: [
        {
          label: "먹어본다",
          labelKey: "uphero.flavor.ntr.4.opt0.label",
          outcomes: [
            {
              weight: 50,
              resultText: "흙 맛이 돌지만 기운이 돈다.",
              resultTextKey: "uphero.flavor.ntr.4.opt0.out0.result",
              effects: [
                { kind: "heal", amount: 25 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 30,
              resultText: "환각 버섯이었다. 머리가 핑 돈다.",
              resultTextKey: "uphero.flavor.ntr.4.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 12 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 20,
              resultText: "진귀한 약버섯. 몸 안쪽이 따뜻해진다.",
              resultTextKey: "uphero.flavor.ntr.4.opt0.out2.result",
              effects: [
                { kind: "heal", amount: 45 },
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "손대지 않는다",
          labelKey: "uphero.flavor.ntr.4.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "모르는 것은 두고 간다.",
              resultTextKey: "uphero.flavor.ntr.4.opt1.out0.result",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "버려진 저장고의 자물쇠가 헐거워 보인다.",
      promptKey: "uphero.flavor.ntr.5.prompt",
      options: [
        {
          label: "열어본다",
          labelKey: "uphero.flavor.ntr.5.opt0.label",
          outcomes: [
            {
              weight: 55,
              resultText: "말린 고기와 곡식 — 오래됐지만 먹을 만하다.",
              resultTextKey: "uphero.flavor.ntr.5.opt0.out0.result",
              effects: [
                { kind: "heal", amount: 20 },
                { kind: "reward", coins: 15 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 25,
              resultText: "오래 상한 음식. 속이 뒤집힌다.",
              resultTextKey: "uphero.flavor.ntr.5.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 20,
              resultText: "누군가 숨겨둔 보물함이 같이 있었다.",
              resultTextKey: "uphero.flavor.ntr.5.opt0.out2.result",
              effects: [
                { kind: "reward", coins: 70, xp: 15 },
                { kind: "time", delta: -4 },
              ],
            },
          ],
        },
        {
          label: "지나친다",
          labelKey: "uphero.flavor.ntr.5.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "남의 물건엔 손대지 않는다.",
              resultTextKey: "uphero.flavor.ntr.5.opt1.out0.result",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
];
