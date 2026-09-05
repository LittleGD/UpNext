/**
 * Up Hero — Phase 12 R-exp: Mystery "?" 전용 이벤트 풀.
 *
 * 배경: 기존엔 일반 event pool 을 amplifyChoiceOptions(1.6) 로 증폭해 재사용 →
 *   유저가 "이미 본 이벤트의 숫자만 1.6배" 느낌. 진짜 "수상한" 체감이 약함.
 *
 * 이 파일의 이벤트는 오직 mystery "?" floor 에서만 발동. 특성:
 *   - outcomes 가 더 극단적 (일반 pool 보다 variance 큼)
 *   - 고유 prompts — "낯선 표식", "균열", "거꾸로 흐르는 계절" 같은 이질감
 *   - high risk / high reward 구조 (positive/negative 모두 크게)
 *   - 본 pool 을 사용하면 amplifyChoiceOptions 는 더 이상 적용되지 않음 —
 *     원래 값이 이미 amplified 수준이라 이중 증폭 과도.
 *
 * Pool 크기는 작게 (8 개) 유지 — 유저가 mystery 에 도달하는 빈도는 cycle 당
 *   2-3 회이므로 LRU 3 제외 시 충분.
 */

import type { DungeonEvent } from "./_types";

export const MYSTERY_EVENTS: DungeonEvent[] = [
  {
    prompt: "바위에 새겨진 낯선 표식이 깜빡인다.",
    promptKey: "uphero.flavor.mst.0.prompt",
    options: [
      {
        label: "손을 대본다",
        labelKey: "uphero.flavor.mst.0.opt0.label",
        outcomes: [
          {
            weight: 45,
            resultText: "표식이 뜨거워지며 힘이 스며든다.",
            resultTextKey: "uphero.flavor.mst.0.opt0.out0.result",
            effects: [
              { kind: "heal", amount: 80 },
              { kind: "reward", xp: 80, coins: 40 },
              { kind: "time", delta: -4 },
            ],
          },
          {
            weight: 35,
            resultText: "손끝이 얼어붙는다. 대가가 크다.",
            resultTextKey: "uphero.flavor.mst.0.opt0.out1.result",
            effects: [
              { kind: "damage", amount: 40 },
              { kind: "time", delta: -8 },
            ],
          },
          {
            weight: 20,
            resultText: "잊혀진 보관함이 열린다!",
            resultTextKey: "uphero.flavor.mst.0.opt0.out2.result",
            effects: [
              { kind: "reward", coins: 150, xp: 120 },
              { kind: "time", delta: -2 },
            ],
          },
        ],
      },
      {
        label: "경외만 하고 지나간다",
        labelKey: "uphero.flavor.mst.0.opt1.label",
        outcomes: [
          {
            weight: 100,
            resultText: "예의를 표하고 조심히 비켜간다.",
            resultTextKey: "uphero.flavor.mst.0.opt1.out0.result",
            effects: [
              { kind: "reward", xp: 10 },
              { kind: "time", delta: -2 },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "공기가 비틀린다. 공간에 가느다란 균열이 있다.",
    promptKey: "uphero.flavor.mst.1.prompt",
    options: [
      {
        label: "손을 넣어본다",
        labelKey: "uphero.flavor.mst.1.opt0.label",
        outcomes: [
          {
            weight: 40,
            resultText: "반대편에서 뭔가 쥐었다. 반짝이는 돌.",
            resultTextKey: "uphero.flavor.mst.1.opt0.out0.result",
            effects: [
              { kind: "reward", coins: 100, xp: 50 },
              { kind: "time", delta: -5 },
            ],
          },
          {
            weight: 35,
            resultText: "균열이 좁아지며 팔을 조인다.",
            resultTextKey: "uphero.flavor.mst.1.opt0.out1.result",
            effects: [
              { kind: "damage", amount: 35 },
              { kind: "time", delta: -6 },
            ],
          },
          {
            weight: 25,
            resultText: "다음 층 입구로 흘러 나왔다.",
            resultTextKey: "uphero.flavor.mst.1.opt0.out2.result",
            effects: [
              { kind: "skipFloors", count: 1 },
              { kind: "time", delta: -3 },
            ],
          },
        ],
      },
      {
        label: "멀리 돌아간다",
        labelKey: "uphero.flavor.mst.1.opt1.label",
        outcomes: [
          {
            weight: 100,
            resultText: "균열을 피해 우회한다.",
            resultTextKey: "uphero.flavor.mst.1.opt1.out0.result",
            effects: [
              { kind: "time", delta: -6 },
              { kind: "stealth", encounters: 2 },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "거꾸로 흐르는 모래시계가 공중에 떠 있다.",
    promptKey: "uphero.flavor.mst.2.prompt",
    options: [
      {
        label: "거꾸로 쥔다",
        labelKey: "uphero.flavor.mst.2.opt0.label",
        outcomes: [
          {
            weight: 40,
            resultText: "시간이 되돌아와 상처가 아물었다.",
            resultTextKey: "uphero.flavor.mst.2.opt0.out0.result",
            effects: [
              { kind: "heal", amount: 120 },
              { kind: "time", delta: 15 },
            ],
          },
          {
            weight: 35,
            resultText: "너무 많이 되돌렸다. 기운이 빠진다.",
            resultTextKey: "uphero.flavor.mst.2.opt0.out1.result",
            effects: [
              { kind: "damage", amount: 25 },
              { kind: "time", delta: -15 },
            ],
          },
          {
            weight: 25,
            resultText: "자신의 미래를 보았다.",
            resultTextKey: "uphero.flavor.mst.2.opt0.out2.result",
            effects: [
              { kind: "reward", xp: 150 },
              { kind: "time", delta: -5 },
            ],
          },
        ],
      },
      {
        label: "그냥 둔다",
        labelKey: "uphero.flavor.mst.2.opt1.label",
        outcomes: [
          {
            weight: 100,
            resultText: "손대지 않는 것이 현명하다.",
            resultTextKey: "uphero.flavor.mst.2.opt1.out0.result",
            effects: [
              { kind: "time", delta: -2 },
              { kind: "runCurse", stat: "all", pct: 10, floors: 5 },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "길 한복판에 놓인 빈 거울. 아무것도 비치지 않는다.",
    promptKey: "uphero.flavor.mst.3.prompt",
    options: [
      {
        label: "들여다본다",
        labelKey: "uphero.flavor.mst.3.opt0.label",
        outcomes: [
          {
            weight: 40,
            resultText: "자신의 약점이 드러났다. 극복한다.",
            resultTextKey: "uphero.flavor.mst.3.opt0.out0.result",
            effects: [
              { kind: "reward", xp: 120, coins: 50 },
              { kind: "time", delta: -4 },
            ],
          },
          {
            weight: 35,
            resultText: "어두운 자아가 튀어나와 공격한다.",
            resultTextKey: "uphero.flavor.mst.3.opt0.out1.result",
            effects: [
              { kind: "damage", amount: 50 },
              { kind: "time", delta: -6 },
            ],
          },
          {
            weight: 25,
            resultText: "거울 속에 숨겨진 통로가 보인다.",
            resultTextKey: "uphero.flavor.mst.3.opt0.out2.result",
            effects: [
              { kind: "skipFloors", count: 2 },
              { kind: "time", delta: -3 },
            ],
          },
        ],
      },
      {
        label: "등을 돌린다",
        labelKey: "uphero.flavor.mst.3.opt1.label",
        outcomes: [
          {
            weight: 100,
            resultText: "보지 않는 것이 나을 때도 있다.",
            resultTextKey: "uphero.flavor.mst.3.opt1.out0.result",
            effects: [
              { kind: "time", delta: -2 },
              { kind: "runCurse", stat: "all", pct: 10, floors: 5 },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "희미한 목소리가 선택을 제안한다. 하나를 바친다.",
    promptKey: "uphero.flavor.mst.4.prompt",
    options: [
      {
        label: "체력을 내어준다",
        labelKey: "uphero.flavor.mst.4.opt0.label",
        outcomes: [
          {
            weight: 100,
            resultText: "체력이 많이 빠져나갔다. 대신 주머니가 두둑하다.",
            resultTextKey: "uphero.flavor.mst.4.opt0.out0.result",
            effects: [
              { kind: "damage", amount: 50 },
              { kind: "reward", coins: 200 },
              { kind: "time", delta: -3 },
            ],
          },
        ],
      },
      {
        label: "시간을 내어준다",
        labelKey: "uphero.flavor.mst.4.opt1.label",
        outcomes: [
          {
            weight: 100,
            resultText: "긴 시간이 순식간에 지나갔지만 경험은 남는다.",
            resultTextKey: "uphero.flavor.mst.4.opt1.out0.result",
            effects: [
              { kind: "time", delta: -20 },
              { kind: "reward", xp: 200 },
            ],
          },
        ],
      },
      {
        label: "거절한다",
        labelKey: "uphero.flavor.mst.4.opt2.label",
        outcomes: [
          {
            weight: 100,
            resultText: "목소리가 사라진다.",
            resultTextKey: "uphero.flavor.mst.4.opt2.out0.result",
            effects: [
              { kind: "time", delta: -1 },
              { kind: "runCurse", stat: "all", pct: 10, floors: 5 },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "검은 깃털이 떨어진 자리. 새가 한 번 울고 사라진다.",
    promptKey: "uphero.flavor.mst.5.prompt",
    options: [
      {
        label: "깃털을 줍는다",
        labelKey: "uphero.flavor.mst.5.opt0.label",
        outcomes: [
          {
            weight: 45,
            resultText: "바람의 축복: 다음 층까지 한걸음에.",
            resultTextKey: "uphero.flavor.mst.5.opt0.out0.result",
            effects: [
              { kind: "skipFloors", count: 1 },
              { kind: "reward", xp: 40 },
              { kind: "time", delta: -1 },
            ],
          },
          {
            weight: 35,
            resultText: "깃털이 재가 되며 손을 그슬린다.",
            resultTextKey: "uphero.flavor.mst.5.opt0.out1.result",
            effects: [
              { kind: "damage", amount: 20 },
              { kind: "time", delta: -4 },
            ],
          },
          {
            weight: 20,
            resultText: "새가 돌아와 영웅 곁에 머문다, 보물 발견.",
            resultTextKey: "uphero.flavor.mst.5.opt0.out2.result",
            effects: [
              { kind: "reward", coins: 120, xp: 60 },
              { kind: "heal", amount: 30 },
              { kind: "time", delta: -3 },
            ],
          },
        ],
      },
      {
        label: "남긴 채 지나간다",
        labelKey: "uphero.flavor.mst.5.opt1.label",
        outcomes: [
          {
            weight: 100,
            resultText: "자연의 몫은 자연에 남긴다.",
            resultTextKey: "uphero.flavor.mst.5.opt1.out0.result",
            effects: [
              { kind: "time", delta: -1 },
              { kind: "runCurse", stat: "all", pct: 10, floors: 5 },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "이름이 지워진 비석. 누군가를 기억하지 않는다.",
    promptKey: "uphero.flavor.mst.6.prompt",
    options: [
      {
        label: "이름을 새겨본다",
        labelKey: "uphero.flavor.mst.6.opt0.label",
        outcomes: [
          {
            weight: 50,
            resultText: "이름이 빛나며 기록된 공덕이 영웅에게 돌아온다.",
            resultTextKey: "uphero.flavor.mst.6.opt0.out0.result",
            effects: [
              { kind: "heal", amount: 60 },
              { kind: "reward", xp: 100, coins: 50 },
              { kind: "time", delta: -5 },
            ],
          },
          {
            weight: 30,
            resultText: "지워진 존재가 깨어나 비난한다.",
            resultTextKey: "uphero.flavor.mst.6.opt0.out1.result",
            effects: [
              { kind: "damage", amount: 30 },
              { kind: "time", delta: -8 },
            ],
          },
          {
            weight: 20,
            resultText: "비석이 무너지고 지도가 드러난다.",
            resultTextKey: "uphero.flavor.mst.6.opt0.out2.result",
            effects: [
              { kind: "reward", coins: 80 },
              { kind: "skipFloors", count: 1 },
              { kind: "time", delta: -4 },
            ],
          },
        ],
      },
      {
        label: "묵념만 한다",
        labelKey: "uphero.flavor.mst.6.opt1.label",
        outcomes: [
          {
            weight: 100,
            resultText: "잊혀진 이름을 잠시 생각한다.",
            resultTextKey: "uphero.flavor.mst.6.opt1.out0.result",
            effects: [
              { kind: "reward", xp: 25 },
              { kind: "time", delta: -2 },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "쌍둥이 문. 왼쪽은 빛이, 오른쪽은 그림자가 새어 나온다.",
    promptKey: "uphero.flavor.mst.7.prompt",
    options: [
      {
        label: "빛의 문으로 들어간다",
        labelKey: "uphero.flavor.mst.7.opt0.label",
        outcomes: [
          {
            weight: 60,
            resultText: "따뜻한 빛이 영웅을 휘감는다.",
            resultTextKey: "uphero.flavor.mst.7.opt0.out0.result",
            effects: [
              { kind: "heal", amount: 100 },
              { kind: "reward", xp: 80 },
              { kind: "time", delta: -3 },
            ],
          },
          {
            weight: 40,
            resultText: "너무 밝아 눈이 멀 뻔했다.",
            resultTextKey: "uphero.flavor.mst.7.opt0.out1.result",
            effects: [
              { kind: "damage", amount: 25 },
              { kind: "reward", coins: 40 },
              { kind: "time", delta: -5 },
            ],
          },
        ],
      },
      {
        label: "그림자의 문으로 들어간다",
        labelKey: "uphero.flavor.mst.7.opt1.label",
        outcomes: [
          {
            weight: 60,
            resultText: "어둠 속에서 뜻밖의 보물을 찾았다.",
            resultTextKey: "uphero.flavor.mst.7.opt1.out0.result",
            effects: [
              { kind: "reward", coins: 150, xp: 100 },
              { kind: "time", delta: -3 },
            ],
          },
          {
            weight: 40,
            resultText: "그림자가 영웅의 기력을 삼켰다.",
            resultTextKey: "uphero.flavor.mst.7.opt1.out1.result",
            effects: [
              { kind: "damage", amount: 35 },
              { kind: "time", delta: -6 },
            ],
          },
        ],
      },
    ],
  },
];

/**
 * Mystery 전용 이벤트 풀에서 random pick.
 *   recent LRU (3) 로 연속 반복 완화.
 */
export function pickMysteryEvent(
  recentPrompts: string[] = [],
): DungeonEvent {
  const pool = MYSTERY_EVENTS;
  const maxExclude = Math.max(1, pool.length - 1);
  const excludeSet = new Set(recentPrompts.slice(-maxExclude));
  const filtered = pool.filter((e) => !excludeSet.has(e.prompt));
  const source = filtered.length > 0 ? filtered : pool;
  return source[Math.floor(Math.random() * source.length)];
}
