/**
 * Up Hero — social 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const SOCIAL_EVENTS: DungeonEvent[] = [
    {
      prompt: "수상한 상인이 나타났다.",
      promptKey: "uphero.flavor.soc.0.prompt",
      options: [
        {
          label: "물건 구매 (80코인)",
          labelKey: "uphero.flavor.soc.0.opt0.label",
          outcomes: [
            {
              weight: 60,
              resultText: "희귀 지식을 얻었다!",
              resultTextKey: "uphero.flavor.soc.0.opt0.out0.result",
              effects: [
                { kind: "reward", coins: -80, xp: 50 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "사기였다. 품질이 낮은 물건.",
              resultTextKey: "uphero.flavor.soc.0.opt0.out1.result",
              effects: [
                { kind: "reward", coins: -80 },
                { kind: "damage", amount: 15 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 15,
              resultText: "상인이 숨겨둔 보물까지 함께 넘겨줬다!",
              resultTextKey: "uphero.flavor.soc.0.opt0.out2.result",
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
          labelKey: "uphero.flavor.soc.0.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "지나친다.",
              resultTextKey: "uphero.flavor.soc.0.opt1.out0.result",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "떠들썩한 술집에서 영웅을 초대한다.",
      promptKey: "uphero.flavor.soc.1.prompt",
      options: [
        {
          label: "이야기 나누기",
          labelKey: "uphero.flavor.soc.1.opt0.label",
          outcomes: [
            {
              weight: 55,
              resultText: "흥미로운 모험담이 오갔다.",
              resultTextKey: "uphero.flavor.soc.1.opt0.out0.result",
              effects: [
                { kind: "reward", xp: 30 },
                { kind: "heal", amount: 10 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 25,
              resultText: "취객이 시비를 걸었다.",
              resultTextKey: "uphero.flavor.soc.1.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "reward", xp: 15 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 20,
              resultText: "친구가 될 노병을 만났다.",
              resultTextKey: "uphero.flavor.soc.1.opt0.out2.result",
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
          labelKey: "uphero.flavor.soc.1.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "조용한 밤을 택했다.",
              resultTextKey: "uphero.flavor.soc.1.opt1.out0.result",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "광장에서 관악단이 큰 소리로 연주한다.",
      promptKey: "uphero.flavor.soc.2.prompt",
      options: [
        {
          label: "팁 던지기 (10 코인)",
          labelKey: "uphero.flavor.soc.2.opt0.label",
          outcomes: [
            {
              weight: 65,
              resultText: "분위기에 녹아들어 기력이 돋는다.",
              resultTextKey: "uphero.flavor.soc.2.opt0.out0.result",
              effects: [
                { kind: "reward", coins: -10, xp: 25 },
                { kind: "heal", amount: 15 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "관악단 리더의 호응이 특별했다.",
              resultTextKey: "uphero.flavor.soc.2.opt0.out1.result",
              effects: [
                { kind: "reward", coins: -10, xp: 45 },
                { kind: "heal", amount: 25 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 15,
              resultText: "동전이 실수로 멀리 굴러갔다.",
              resultTextKey: "uphero.flavor.soc.2.opt0.out2.result",
              effects: [
                { kind: "reward", coins: -10 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "귀 막고 지나간다",
          labelKey: "uphero.flavor.soc.2.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "시끄러움이 신경을 긁는다.",
              resultTextKey: "uphero.flavor.soc.2.opt1.out0.result",
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
      promptKey: "uphero.flavor.soc.3.prompt",
      options: [
        {
          label: "감상하기",
          labelKey: "uphero.flavor.soc.3.opt0.label",
          outcomes: [
            {
              weight: 70,
              resultText: "노래에 마음이 치유되었다.",
              resultTextKey: "uphero.flavor.soc.3.opt0.out0.result",
              effects: [
                { kind: "heal", amount: 25 },
                { kind: "reward", xp: 10 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 20,
              resultText: "긴 서사시를 끝까지 들었다.",
              resultTextKey: "uphero.flavor.soc.3.opt0.out1.result",
              effects: [
                { kind: "heal", amount: 40 },
                { kind: "reward", xp: 20 },
                { kind: "time", delta: -8 },
              ],
            },
            {
              weight: 10,
              resultText: "짧은 후렴구만 듣고 지나갔다.",
              resultTextKey: "uphero.flavor.soc.3.opt0.out2.result",
              effects: [{ kind: "time", delta: -3 }],
            },
          ],
        },
        {
          label: "동전 주고 가기",
          labelKey: "uphero.flavor.soc.3.opt1.label",
          outcomes: [
            {
              weight: 75,
              resultText: "동전을 주고 축복을 받았다.",
              resultTextKey: "uphero.flavor.soc.3.opt1.out0.result",
              effects: [
                { kind: "reward", coins: -10, xp: 30 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "음유시인이 깊은 축복을 내려주었다.",
              resultTextKey: "uphero.flavor.soc.3.opt1.out1.result",
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
    // Phase 12 R3 — pool 다양성 확장 (4 → 6).
    //   기존 풀이 상인/술집/관악단/음유시인 — 유흥 타인 편향. "길가의 아이"
    //   (도움) 와 "낯선 편지" (익명 상호작용) 2 개로 사회적 상호작용 축 확장.
    {
      prompt: "길가의 아이가 울먹이며 인형을 잃었다 한다.",
      promptKey: "uphero.flavor.soc.4.prompt",
      options: [
        {
          label: "같이 찾아준다",
          labelKey: "uphero.flavor.soc.4.opt0.label",
          outcomes: [
            {
              weight: 55,
              resultText: "수풀 속에서 인형을 찾아주었다. 아이의 웃음이 번진다.",
              resultTextKey: "uphero.flavor.soc.4.opt0.out0.result",
              effects: [
                { kind: "heal", amount: 12 },
                { kind: "reward", xp: 25, coins: 20 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 25,
              resultText: "아이의 부모가 감사해하며 말린 꽃을 쥐여준다.",
              resultTextKey: "uphero.flavor.soc.4.opt0.out1.result",
              effects: [
                { kind: "reward", coins: 40, xp: 30 },
                { kind: "time", delta: -6 },
              ],
            },
            {
              weight: 20,
              resultText: "수풀 너머로 뛰쳐나온 들개에게 물렸다.",
              resultTextKey: "uphero.flavor.soc.4.opt0.out2.result",
              effects: [
                { kind: "damage", amount: 14 },
                { kind: "time", delta: -5 },
              ],
            },
          ],
        },
        {
          label: "모른 척 지나간다",
          labelKey: "uphero.flavor.soc.4.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "울음 소리가 멀어진다.",
              resultTextKey: "uphero.flavor.soc.4.opt1.out0.result",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "돌 틈에 봉인도 없는 낡은 편지가 꽂혀 있다.",
      promptKey: "uphero.flavor.soc.5.prompt",
      options: [
        {
          label: "펼쳐 읽는다",
          labelKey: "uphero.flavor.soc.5.opt0.label",
          outcomes: [
            {
              weight: 50,
              resultText: "오래된 여행자의 조언이 담겨 있다.",
              resultTextKey: "uphero.flavor.soc.5.opt0.out0.result",
              effects: [
                { kind: "reward", xp: 30 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "지도 단편. 다음 길이 또렷해진다.",
              resultTextKey: "uphero.flavor.soc.5.opt0.out1.result",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 20,
              resultText: "저주받은 서신. 마음이 무거워진다.",
              resultTextKey: "uphero.flavor.soc.5.opt0.out2.result",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -4 },
              ],
            },
          ],
        },
        {
          label: "손대지 않는다",
          labelKey: "uphero.flavor.soc.5.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "남의 사연은 남의 것으로 남긴다.",
              resultTextKey: "uphero.flavor.soc.5.opt1.out0.result",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    // Phase 15 WarioWare — 3 social minigames: reaction_tap / sort_items / sequence_memo.
    //   광장/시장/축제/사교/주점 모티프. Coin-heavy 성공 보상.
    {
      prompt: "광장 축제. 영주의 축배 신호에 맞춰 잔을 들어야 한다.",
      promptKey: "uphero.flavor.soc.6.prompt",
      options: [
        {
          label: "타이밍 맞춰 건배",
          labelKey: "uphero.flavor.soc.6.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "reaction_tap",
            difficulty: 2,
            successEffects: [
              { kind: "reward", xp: 55, coins: 35 },
              { kind: "heal", amount: 10 },
              { kind: "time", delta: -3 },
            ],
            failEffects: [
              { kind: "damage", amount: 12 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "잔을 들고 영주의 신호를 기다린다...",
          resultTextKey: "uphero.flavor.soc.6.opt0.out0.result",
        },
        {
          label: "뒷자리에서 조용히 마신다",
          labelKey: "uphero.flavor.soc.6.opt1.label",
          outcomes: [
            {
              weight: 70,
              resultText: "주목받지 않고 편히 한 잔 비웠다.",
              resultTextKey: "uphero.flavor.soc.6.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 8 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 30,
              resultText: "구석에서도 눈에 띄어 상인이 덤 음식을 건넸다.",
              resultTextKey: "uphero.flavor.soc.6.opt1.out1.result",
              effects: [
                { kind: "reward", coins: 15 },
                { kind: "heal", amount: 12 },
                { kind: "time", delta: -4 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "시장 귀퉁이 선물 수레. 친구에게 갈 꽃과 적수에게 갈 가시를 분류해 달란다.",
      promptKey: "uphero.flavor.soc.7.prompt",
      options: [
        {
          label: "좌우로 나눠 담기",
          labelKey: "uphero.flavor.soc.7.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "sort_items",
            difficulty: 1,
            successEffects: [
              { kind: "reward", xp: 45, coins: 30 },
              { kind: "time", delta: -3 },
            ],
            failEffects: [
              { kind: "damage", amount: 10 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "꽃과 가시를 양손에 나눠 쥐었다...",
          resultTextKey: "uphero.flavor.soc.7.opt0.out0.result",
        },
        {
          label: "수레를 돌려준다",
          labelKey: "uphero.flavor.soc.7.opt1.label",
          outcomes: [
            {
              weight: 80,
              resultText: "상인이 미소 지으며 작은 사과 하나를 쥐여준다.",
              resultTextKey: "uphero.flavor.soc.7.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 6 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 20,
              resultText: "상인이 혀를 차며 돌아선다. 분위기가 식었다.",
              resultTextKey: "uphero.flavor.soc.7.opt1.out1.result",
              effects: [
                { kind: "damage", amount: 4 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "사교 모임의 비밀 악수. 선배가 동작 순서를 보여주고 따라 하라 한다.",
      promptKey: "uphero.flavor.soc.8.prompt",
      options: [
        {
          label: "순서대로 따라 하기",
          labelKey: "uphero.flavor.soc.8.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "sequence_memo",
            difficulty: 2,
            successEffects: [
              { kind: "reward", xp: 60, coins: 40 },
              { kind: "time", delta: -3 },
            ],
            failEffects: [
              { kind: "damage", amount: 15 },
              { kind: "time", delta: -5 },
            ],
          },
          resultText: "선배의 손짓을 눈에 새긴다...",
          resultTextKey: "uphero.flavor.soc.8.opt0.out0.result",
        },
        {
          label: "어색한 웃음으로 얼버무린다",
          labelKey: "uphero.flavor.soc.8.opt1.label",
          outcomes: [
            {
              weight: 60,
              resultText: "눈치 빠른 선배가 빈 잔을 채워주며 넘어가 준다.",
              resultTextKey: "uphero.flavor.soc.8.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 8 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 40,
              resultText: "어색한 침묵이 흐른다. 자리에서 조용히 빠져나왔다.",
              resultTextKey: "uphero.flavor.soc.8.opt1.out1.result",
              effects: [
                { kind: "damage", amount: 6 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
      ],
    },
];
