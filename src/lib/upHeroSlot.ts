/**
 * Up Hero — 룬 상자 (rune chest) 확률 테이블 + 지급 규약.
 *
 * 던전 분기 이벤트의 한 종류로 등장하는 "코인을 물려 자물쇠를 여는 낡은 상자" 다.
 * 자물쇠를 맞추면 상자가 열리고 안에 든 것이 나온다.
 *
 * ── 왜 이 모양인가 (2026-09, 애플 2.3.6) ───────────────────────────────
 *
 * 1.3.0 이 App Store 심사에서 가이드라인 2.3.6 으로 거절됐다. 개인 개발자 계정은
 * simulated gambling 을 담은 앱을 낼 수 없다는 통보다. 이전 판의 이 이벤트는
 * 룬 드럼 세 개가 돌아가는 장치였고, 그것이 정확히 그 판정의 근거였다.
 *
 * 그래서 **유저에게 보이는 모든 도박 신호를 걷어냈다**:
 *  - 돌아가는 드럼도, 레버도, 릴 정지 순서도 없다.
 *  - "아깝다" (near-miss) 표시도, "대박" 도 없다.
 *  - 확률·환수율 공개 표(SlotOddsPanel)도 화면에서 사라졌다.
 *  - 대신 짧은 기술형 조작(룬 자물쇠 걸쇠 맞추기)이 상자를 연다.
 *
 * **엔진은 한 줄도 바뀌지 않았다.** 아래 가중치·pity·하루 상한·비용·와이어 키는
 * 예전 값 그대로다. 옛 저장본과 클라우드 문서가 그대로 동작해야 하기 때문이다
 * (와이어 키 `slotBlankStreak`, `shopDaily.slotSpins`, 선택 효과 kind `spinSlot`).
 * 모듈·심볼 이름에 남은 slot/drum 어휘도 그 호환성의 흔적이다. 유저에게 보이는
 * 문구는 전부 `uphero.slot.*` i18n 키가 낸다.
 *
 * 유지하는 것:
 *  - `SLOT_DAILY_SPIN_CAP` 상한. 습관이 되지 않게 하는 장치다.
 *  - 확률 테이블 불변. 코인 IAP 없음 — 스테이크는 던전에서 주운 코인만이다.
 *
 * ── 아키텍처: 결과 우선, 표시는 나중 ───────────────────────────────────
 *
 *   rollSlotOutcome(blankStreak) -> SlotOutcomeId          // 가중 테이블 1회 롤
 *   renderSymbols(outcome, rand) -> { symbols, nearMiss }  // 표시 전용 (아래 참조)
 *   runeLockTier(marker, center) -> RuneLockTier           // 걸쇠 판정
 *   applyRuneLockBonus(reward, tier)                       // 티어 보너스 (유일한 수치 변경)
 *
 * `renderSymbols` 는 이제 **아무것도 그리지 않는다**. 그래도 호출은 남긴다 —
 * 롤 뒤에 소비하는 난수 개수가 곧 세션 RNG 의 호출 순서라, 지우면 같은 시드에서
 * 이후 전투 결과가 통째로 달라지고 웹 ↔ iOS 동치성이 깨진다. 심볼 배열은 로그
 * 엔트리(`choiceResult.slot.symbols`)의 필드로도 남아 있어 옛 세이브가 디코드된다.
 * `nearMiss` 는 어디에도 표시되지 않는다.
 *
 * 웹과 iOS 는 이 파일의 상수 배열·비율·판정표만 맞추면 같은 결과를 낸다.
 */

import { rng } from "./upHeroRng";

/* ══════════════════════════════════════════════════════════════════════
 * 비용 / 상한
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 1회 굴림 비용. `SHOP_PRICES.reroll` 과 같은 티어.
 *
 * 100 을 고른 근거:
 *  - 데일리 코인 주머니 평균 90 (범위 20~160) 이 대략 1회. "오늘 공짜로 받은 게
 *    한 판" 이라는 읽기 쉬운 관계가 생긴다.
 *  - 하루 최대 지출 300C. 풀 클리어 런 수입 추정 3,000~4,000C 의 8~10% 라
 *    의미는 있되 파괴적이지 않다.
 *  - 불막이 천 shadow 300 의 1/3. "세 판이면 천 한 장 값" 이 성립해 기대값
 *    감각이 잡힌다.
 *  - 상점 최저가 fastForward(20) / fortune(30) / ticket(50) 보다 확실히 위다.
 *    습관적으로 누르는 버튼이 되면 안 된다.
 */
export const SLOT_SPIN_COST = 100;

/**
 * 굴림 횟수 상한 — **하루 3회**.
 *
 * 카운터는 `UpHeroState.shopDaily.slotSpins` 에 산다. 탐험권·코인 주머니와 같은
 * 날짜 키(`shopDaily.date`, 새벽 1시 경계) 로 롤오버되며, 하루에 탐험을 몇 번
 * 들어가든 합산해서 3 에서 막힌다. 세션(`CombatSession`)은 카운터를 갖지 않고
 * 스토어가 `slotSpinsToday` 스냅샷을 전투 레이어에 넘긴다 (pity 스트릭과 같은 seam).
 *
 * 한때 세션에 카운터를 두어 사실상 "탐험 1회당 3회" 였는데, 그러면 하루에
 * 여러 번 탐험할 때 3 을 넘는다. 패치노트 문구("하루 세 번까지")가 거짓이
 * 되지 않도록 일일 상한으로 복원했다.
 */
export const SLOT_DAILY_SPIN_CAP = 3;

/**
 * `shopDaily.slotSpins` 와이어/저장 값의 방어 상한. 정상 경로에서는 절대
 * `SLOT_DAILY_SPIN_CAP` 을 넘지 않는다 — 손상된 값이 들어와도 정수 [0, 100]
 * 으로 접는다. iOS `UpHeroCloudSchema` 의 관용 디코드와 같은 범위.
 */
export const SLOT_SPINS_WIRE_MAX = 100;

/**
 * 오늘 굴린 횟수를 관용적으로 교정 — 정수 [0, SLOT_SPINS_WIRE_MAX].
 * 로컬 저장본·클라우드(`sync.normalizeShopDaily`)·`initialize` 가 전부 이 하나를
 * 쓴다. 필드가 없는 레거시 저장본(undefined)은 0 이다.
 */
export function normalizeSlotSpins(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(SLOT_SPINS_WIRE_MAX, Math.floor(raw)));
}

/**
 * 연속 꽝 pity. `SLOT_PITY_THRESHOLD - 1` (= 4) 회 연속 꽝이면 다음 굴림은
 * 반드시 보상이 나온다 (꽝 가중치를 0 으로 접고 나머지만으로 재정규화).
 *
 * 스트릭은 **탐험을 넘어 영속**한다 — `UpHeroState.slotBlankStreak` 이 유일한
 * 진실이고 클라우드 왕복(와이어 키 "slotBlankStreak")도 탄다. 예전에는 세션
 * 안에서만 셈해서 세션당 상한 3 에 막혀 임계 5 에 닿을 수 없었다(죽은 pity).
 * 스토어(`useUpHeroStore.resolveChoice`)가 상태 스트릭을 롤 입력으로 넘기고,
 * 결과를 `nextSlotBlankStreak` 로 되받아 적는다.
 *
 * 투명 pity: 스트릭이 `SLOT_PITY_THRESHOLD - 1` 에 닿으면 (`isSlotPityArmed`)
 * UI 가 상자를 열기 전에 "다음은 반드시 나와요" 힌트를 띄운다. 숨기지 않는다.
 *
 * 실효 RTP: 원시 92.75% → pity 포함 약 95.4% (정상 상태 마르코프 체인, 스트릭
 * 4 에 머무는 비율 ≈ 3.0%). `slotOdds()` 는 원시 표 그대로다 — pity 는 표를
 * 바꾸는 게 아니라 "5번째는 꽝을 뺀 표로 굴린다" 는 별도 규칙이다.
 */
export const SLOT_PITY_THRESHOLD = 5;

/**
 * 영속 스트릭의 방어 상한. 정상 경로에서는 pity 가 4 에서 끊어주므로 절대 5 를
 * 넘지 않는다 — 손상된 저장본/클라우드 값이 들어와도 정수 [0, 1000] 으로 접는다.
 */
export const SLOT_BLANK_STREAK_MAX = 1000;

/**
 * 소실방지권 1장의 RTP 회계 기준가.
 *
 * 소실방지권은 상점에서 팔지 않으므로 붙은 가격표가 없다. 그래도 300 은 이
 * 아이템의 확립된 가치이고 아래 가중치가 그 값을 기준으로 풀렸으므로, 상수를
 * 지우지 말고 회계 기준으로 남긴다. 값을 바꾸려면 가중치를 함께 다시 풀 것.
 */
export const DESTROY_GUARD_SHADOW_VALUE = 300;

/** 하락방지권 1장의 가치. `SHOP_PRICES.downGuard` 와 같아야 한다. */
export const DOWN_GUARD_VALUE = 150;

/* ══════════════════════════════════════════════════════════════════════
 * 보상 테이블
 * ══════════════════════════════════════════════════════════════════════ */

export type SlotOutcomeId =
  | "blank"
  | "coinSmall"
  | "coinMid"
  | "coinJackpot"
  | "rankProtect"
  | "destroyProtect"
  | "itemBox"
  | "battleBuff";

/**
 * 로그 페이로드에만 남는 룬 식별자. 예전 드럼 표시의 잔재이고 지금은 어디에도
 * 그려지지 않는다 — 옛 세이브/클라우드 문서가 디코드되도록 타입을 남긴다.
 */
export type SlotSymbol =
  | "blank"
  | "coin"
  | "coins"
  | "gem"
  | "shield"
  | "cloth"
  | "chest"
  | "star";

export interface SlotOutcomeDef {
  id: SlotOutcomeId;
  /** 상대 가중치. 합계는 반드시 SLOT_WEIGHT_TOTAL. */
  weight: number;
  /** RTP 회계용 기준가 (코인 환산). 코인은 액면가, 소모품은 상점가 상당. */
  value: number;
  /** 세 드럼이 맞았을 때 그려질 룬. 꽝은 서로 다른 룬 3개라 의미 없음. */
  symbol: SlotSymbol;
}

/**
 * 확정 보상 테이블. **가중치 합계는 반드시 1000.**
 *
 * 각 결과의 `value` 는 RTP 회계용 기준가다. 코인은 액면가, 소모품은 상점가
 * (또는 상점가 상당), 버프는 아래 근거.
 *
 *  - `rankProtect` 150 : 하락방지권 1장 (`SHOP_PRICES.downGuard`).
 *  - `destroyProtect` 300 : 소실방지권 1장 (DESTROY_GUARD_SHADOW_VALUE).
 *  - `itemBox` 150 : 층 보정 랜덤 장비 1개. 기존 드롭 생성기를 그대로 쓴다.
 *  - `battleBuff` 100 : 다음 3전투 능력치 +10%. 굴림 1회 값어치.
 */
export const SLOT_OUTCOMES: readonly SlotOutcomeDef[] = [
  { id: "blank", weight: 490, value: 0, symbol: "blank" },
  { id: "coinSmall", weight: 194, value: 100, symbol: "coin" },
  { id: "coinMid", weight: 112, value: 250, symbol: "coins" },
  { id: "coinJackpot", weight: 17, value: 700, symbol: "gem" },
  { id: "rankProtect", weight: 105, value: 150, symbol: "shield" },
  { id: "destroyProtect", weight: 39, value: 300, symbol: "cloth" },
  { id: "itemBox", weight: 34, value: 150, symbol: "chest" },
  { id: "battleBuff", weight: 9, value: 100, symbol: "star" },
] as const;

/** 가중치 합계 계약값. 테스트가 이 값을 강제한다. */
export const SLOT_WEIGHT_TOTAL = 1000;

/**
 * 결과별 실제 지급 내용. 전투 레이어(`upHeroCombat`)가 이 표를 읽어 배선한다.
 * 확률과 지급을 한 파일에 묶어두면 "표는 고쳤는데 지급을 안 고친" 어긋남이
 * 생기지 않는다.
 */
export const SLOT_GRANTS: Record<
  SlotOutcomeId,
  | { kind: "none" }
  | { kind: "coins"; amount: number }
  /** 소실방지권 n 장. 상점에서 살 수 없는 물건이라 룬 상자가 주요 공급원 중 하나. */
  | { kind: "destroyGuards"; count: number }
  /** 하락방지권 n 장. */
  | { kind: "downGuards"; count: number }
  /** 층 보정 랜덤 장비 1개 — 기존 rollDropRarity + rollEquipmentDrop 재사용. */
  | { kind: "itemBox"; floorBonus: number }
  /** 다음 n 전투 동안 능력치 +pct%. */
  | { kind: "combatBuff"; pct: number; battles: number }
> = {
  blank: { kind: "none" },
  coinSmall: { kind: "coins", amount: 100 },
  coinMid: { kind: "coins", amount: 250 },
  coinJackpot: { kind: "coins", amount: 700 },
  rankProtect: { kind: "downGuards", count: 1 },
  destroyProtect: { kind: "destroyGuards", count: 1 },
  // 보스 드롭과 같은 +10 층 보정. "룬 상자에서 나온 장비" 가 잡몹 드롭보다는 좋다.
  itemBox: { kind: "itemBox", floorBonus: 10 },
  battleBuff: { kind: "combatBuff", pct: 10, battles: 3 },
};

/** 꽝이 아닌 결과인가. */
export function isSlotWin(id: SlotOutcomeId): boolean {
  return id !== "blank";
}

/* ══════════════════════════════════════════════════════════════════════
 * 축하 티어
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 결과 확정 뒤 연출 강도. 웹·iOS 가 같은 표를 읽어 같은 감촉을 낸다.
 *
 *  - none  : 꽝. 저음 둔탁음 + light 햅틱 1회 + 프레임 15% 디밍 250ms.
 *  - small : 명도 플래시 2프레임 + medium 햅틱.
 *  - mid   : 입자 링 + 더블 햅틱 + 짧은 징글.
 *  - big   : 풀 버스트 + 화면 2px 셰이크 300ms + 픽셀 스파크 낙하 + 트리플 햅틱
 *            + "대박" 카피 + 결과 모달 big 톤.
 */
export type SlotTier = "none" | "small" | "mid" | "big";

/**
 * 결과 → 티어. 기준가(`value`)와 희소성으로 가른다.
 *  - big 은 700C 잭팟과 상점에서 살 수 없는 소실방지권(기준가 300).
 *  - battleBuff 는 기준가 100 이라 small. 희소하지만(9‰) 체감 가치가 굴림 1회다.
 */
export const SLOT_CELEBRATION_TIER: Record<SlotOutcomeId, SlotTier> = {
  blank: "none",
  coinSmall: "small",
  battleBuff: "small",
  coinMid: "mid",
  rankProtect: "mid",
  itemBox: "mid",
  coinJackpot: "big",
  destroyProtect: "big",
};

export function slotTier(id: SlotOutcomeId): SlotTier {
  return SLOT_CELEBRATION_TIER[id];
}

/* ══════════════════════════════════════════════════════════════════════
 * 롤
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 가중 테이블 1회 롤.
 *
 * @param blankStreak 직전까지 연속으로 나온 꽝 횟수. `SLOT_PITY_THRESHOLD - 1`
 *   이상이면 꽝 가중치를 0 으로 접고 나머지 결과만으로 재정규화한다. 즉 이번
 *   굴림은 반드시 보상이 나오되, 보상 **종류의 상대 비율은 원래 표 그대로** 다.
 * @param rand [0,1) 난수원. 기본값은 세션 RNG (`upHeroRng.rng`) 라 시드를
 *   물리면 결정론적으로 재현된다.
 */
export function rollSlotOutcome(
  blankStreak: number = 0,
  rand: () => number = rng,
): SlotOutcomeId {
  const pity = isSlotPityArmed(blankStreak);
  const pool = pity
    ? SLOT_OUTCOMES.filter((o) => o.id !== "blank")
    : SLOT_OUTCOMES;
  const total = pool.reduce((sum, o) => sum + o.weight, 0);
  if (total <= 0) return "blank";
  let roll = rand() * total;
  for (const o of pool) {
    roll -= o.weight;
    if (roll < 0) return o.id;
  }
  return pool[pool.length - 1].id;
}

/**
 * 영속 스트릭을 관용적으로 교정 — 정수 [0, SLOT_BLANK_STREAK_MAX].
 * 로컬 저장본·클라우드·`_setFromCloud` 가 전부 이 하나를 쓴다 (한쪽만 고치지 말 것).
 * 필드가 없는 레거시 저장본(undefined)은 0 이다.
 */
export function normalizeSlotBlankStreak(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(SLOT_BLANK_STREAK_MAX, Math.floor(raw)));
}

/**
 * 다음 굴림이 pity 로 보장되는가. 롤(`rollSlotOutcome`)과 힌트 UI 가 같은 판정을
 * 읽어야 "힌트는 떴는데 꽝" 이 구조적으로 불가능하다.
 */
export function isSlotPityArmed(blankStreak: number): boolean {
  return normalizeSlotBlankStreak(blankStreak) >= SLOT_PITY_THRESHOLD - 1;
}

/**
 * 굴림 1회 뒤의 스트릭. 보상이면 0, 꽝이면 +1 (상한 SLOT_BLANK_STREAK_MAX).
 * 스토어가 상태를 갱신할 때 쓰는 유일한 규칙이라 여기 두고 테스트로 고정한다.
 */
export function nextSlotBlankStreak(prev: number, outcome: SlotOutcomeId): number {
  if (isSlotWin(outcome)) return 0;
  return Math.min(SLOT_BLANK_STREAK_MAX, normalizeSlotBlankStreak(prev) + 1);
}

/* ══════════════════════════════════════════════════════════════════════
 * 표시 잔재 (RNG 호출 순서 보존용 — 화면에는 나오지 않는다)
 * ══════════════════════════════════════════════════════════════════════ */

export type SlotSymbols = [SlotSymbol, SlotSymbol, SlotSymbol];

export interface SlotRender {
  symbols: SlotSymbols;
  /**
   * 꽝을 "두 개 맞고 하나 빗나간" 그림으로 그렸는가. 결과가 이미 꽝으로 확정된
   * 뒤의 표시 선택이라 확률과 무관하다. 보상이면 항상 false.
   */
  nearMiss: boolean;
}

/**
 * 꽝 중 near-miss 로 표시하던 비율. 지금은 **어디에도 그려지지 않는다** — 아래
 * `renderSymbols` 가 소비하는 난수 개수를 예전과 똑같이 유지하기 위한 값이다.
 * 아무 값으로 바꿔도 `rollSlotOutcome` 의 분포·RTP·당첨률은 변하지 않는다.
 */
export const SLOT_NEAR_MISS_RATE = 0.3;

/**
 * near-miss 배치. A 는 릴1·릴2 동일 + 릴3 다름 (서스펜스 유발), B 는 릴1·릴3
 * 동일 + 릴2 다름 (릴1·릴2 가 다르니 서스펜스 없음, 그래도 "아깝다").
 */
export const SLOT_NEAR_MISS_VARIANT_A_RATE = 0.8;

/** 꽝 화면에 쓰는 룬. `blank` 룬 자체는 그리지 않는다. */
const BLANK_FACE_POOL: readonly SlotSymbol[] = [
  "coin",
  "coins",
  "gem",
  "shield",
  "cloth",
  "chest",
  "star",
];

/**
 * near-miss 에서 "맞은 두 개" 로 뽑힐 룬의 가중치. 고가치 룬(잭팟 보석·소실방지
 * 천)에 무게를 둬 "아깝다" 를 키운다. 표시 가중치일 뿐, 실제 당첨 확률표
 * (`SLOT_OUTCOMES`) 와는 아무 관계가 없다.
 */
const NEAR_MISS_MATCH_WEIGHT: Record<Exclude<SlotSymbol, "blank">, number> = {
  coin: 1,
  coins: 1,
  gem: 3,
  shield: 1,
  cloth: 3,
  chest: 1,
  star: 1,
};

function pickWeightedSymbol(rand: () => number): SlotSymbol {
  const entries = BLANK_FACE_POOL.map(
    (s) => [s, NEAR_MISS_MATCH_WEIGHT[s as Exclude<SlotSymbol, "blank">]] as const,
  );
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [s, w] of entries) {
    roll -= w;
    if (roll < 0) return s;
  }
  return entries[entries.length - 1][0];
}

/**
 * 이미 결정된 결과를 룬 세 개로 옮긴다. **순수 함수** — `outcome` 을 읽기만 하고,
 * 같은 난수열이면 같은 배열을 낸다. 결과를 바꾸는 코드는 한 줄도 없다.
 *
 * 2.3.6 대응 뒤로 이 배열은 **화면에 그려지지 않는다.** 그래도 호출은 남긴다:
 * 여기서 소비하는 난수 개수가 곧 세션 RNG 의 호출 순서라, 지우면 같은 시드에서
 * 이후 전투가 통째로 달라지고 웹 ↔ iOS 동치성이 깨진다. 배열은 로그 페이로드
 * (`choiceResult.slot.symbols`)의 필드로도 남아 옛 세이브가 그대로 디코드된다.
 */
export function renderSymbols(
  outcome: SlotOutcomeId,
  rand: () => number = rng,
): SlotRender {
  const def = SLOT_OUTCOMES.find((o) => o.id === outcome);
  if (def && def.id !== "blank") {
    return { symbols: [def.symbol, def.symbol, def.symbol], nearMiss: false };
  }

  if (rand() < SLOT_NEAR_MISS_RATE) {
    const match = pickWeightedSymbol(rand);
    const others = BLANK_FACE_POOL.filter((s) => s !== match);
    const miss = others[Math.floor(rand() * others.length)];
    const variantA = rand() < SLOT_NEAR_MISS_VARIANT_A_RATE;
    return {
      symbols: variantA ? [match, match, miss] : [match, miss, match],
      nearMiss: true,
    };
  }

  // Fisher-Yates 부분 셔플로 서로 다른 3개를 뽑는다.
  const pool = [...BLANK_FACE_POOL];
  for (let i = 0; i < 3; i += 1) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { symbols: [pool[0], pool[1], pool[2]], nearMiss: false };
}

/**
 * 세 룬이 near-miss 배치인가. **UI 는 이 함수를 부르지 않는다** — near-miss 는
 * 화면에서 완전히 사라졌다. `renderSymbols` 의 `nearMiss` 필드와의 일치를
 * 테스트가 고정하는 용도로만 남는다.
 */
export function isNearMiss(symbols: SlotSymbols): boolean {
  const [a, b, c] = symbols;
  if (a === b && b === c) return false;
  return (a === b && c !== a) || (a === c && b !== a);
}

/* ══════════════════════════════════════════════════════════════════════
 * 표시 타이밍 잔재 (웹·iOS 공용 숫자, 현재 UI 는 쓰지 않는다)
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 릴 3개의 기본 정지 시각(ms). 왼쪽부터 160ms 간격으로 서고 총 1.4s 다.
 * 세 칸이 동시에 서면 "굴렸다" 는 감각이 안 산다.
 */
export const REEL_BASE_STOP_MS: readonly [number, number, number] = [1080, 1240, 1400];

/**
 * 릴1·릴2 가 같은 룬으로 서면 릴3 정지를 이만큼 늦춘다. 당첨이든 near-miss 든
 * 같은 서스펜스다 — 결과는 롤 시점에 이미 확정돼 있고 연출은 결과를 바꾸지 않는다.
 */
export const REEL_SUSPENSE_EXTRA_MS = 700;

/** 릴1·릴2 가 같은 룬인가 = 릴3 서스펜스 연장 여부. */
export function hasReelSuspense(symbols: SlotSymbols): boolean {
  return symbols[0] === symbols[1];
}

/**
 * 릴 정지 시각 [t1, t2, t3] (ms, 스핀 시작 기준). 순수 함수라 웹과 iOS 가 같은
 * 숫자를 쓴다.
 *
 *   릴1·릴2 다름 : [1080, 1240, 1400]  총 1.4s
 *   릴1·릴2 같음 : [1080, 1240, 2100]  총 2.1s (릴3 +700ms 서스펜스)
 */
export function reelTimings(symbols: SlotSymbols): [number, number, number] {
  const [t1, t2, t3] = REEL_BASE_STOP_MS;
  return [t1, t2, hasReelSuspense(symbols) ? t3 + REEL_SUSPENSE_EXTRA_MS : t3];
}

/**
 * 서스펜스 구간(릴2 정지 → 릴3 정지) 의 틱 시각(ms, 스핀 시작 기준).
 * 간격이 60 → 175 로 벌어지며 감속한다. 합계가 정확히 `REEL_SUSPENSE_EXTRA_MS`
 * + 기본 간격(160) 이라 마지막 틱이 릴3 착지와 겹친다.
 */
export const REEL_SUSPENSE_TICK_GAPS_MS: readonly number[] = [
  60, 60, 65, 75, 90, 110, 135, 160, 105,
];

export function suspenseTickTimes(symbols: SlotSymbols): number[] {
  if (!hasReelSuspense(symbols)) return [];
  const [, t2] = REEL_BASE_STOP_MS;
  const out: number[] = [];
  let t = t2;
  for (const gap of REEL_SUSPENSE_TICK_GAPS_MS) {
    t += gap;
    out.push(t);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
 * 회계 (밸런싱·테스트용)
 * ══════════════════════════════════════════════════════════════════════ */

/** 1회 굴림의 기대 회수액 (코인 환산). */
export function slotExpectedValue(): number {
  const total = SLOT_OUTCOMES.reduce((sum, o) => sum + o.weight, 0);
  const weighted = SLOT_OUTCOMES.reduce((sum, o) => sum + o.weight * o.value, 0);
  return weighted / total;
}

/** 환수율 (기대 회수액 / 비용). 0.9275 = 92.75%. */
export function slotRtp(): number {
  return slotExpectedValue() / SLOT_SPIN_COST;
}

/** 보상이 나올 확률 (꽝이 아닐 확률). 0.51 = 51%. */
export function slotWinRate(): number {
  const total = SLOT_OUTCOMES.reduce((sum, o) => sum + o.weight, 0);
  const blank = SLOT_OUTCOMES.find((o) => o.id === "blank")?.weight ?? 0;
  return (total - blank) / total;
}

/**
 * 결과별 확률 (0-1). 화면에는 더 이상 나오지 않는다 (2.3.6 대응으로 확률 공개
 * 패널을 걷어냈다). 밸런싱과 테스트가 표와 지급의 일치를 검사하는 데 쓴다.
 */
export function slotOdds(): Record<SlotOutcomeId, number> {
  const total = SLOT_OUTCOMES.reduce((sum, o) => sum + o.weight, 0);
  const out = {} as Record<SlotOutcomeId, number>;
  for (const o of SLOT_OUTCOMES) out[o.id] = o.weight / total;
  return out;
}

/**
 * 표 한 줄 (확률 + 지급). `SLOT_OUTCOMES` 순서 그대로. 화면에 그리지 않고
 * 테스트·밸런싱이 표와 지급의 일치를 검사하는 데 쓴다.
 */
export interface SlotOddsRow {
  id: SlotOutcomeId;
  /** 0-1. `slotOdds()[id]` 와 같은 값. */
  probability: number;
  grant: (typeof SLOT_GRANTS)[SlotOutcomeId];
}

export function slotOddsRows(): SlotOddsRow[] {
  const odds = slotOdds();
  return SLOT_OUTCOMES.map((o) => ({
    id: o.id,
    probability: odds[o.id],
    grant: SLOT_GRANTS[o.id],
  }));
}

/**
 * 0-1 확률을 "49%" / "19.4%" / "92.75%" 로. 소수 둘째 자리까지 반올림하고
 * 뒤따르는 0 은 지운다 — 가중치 표(‰)는 한 자리, RTP(92.75%)는 두 자리가
 * 정확한 값이라 자릿수를 고정하면 어느 한쪽이 거짓이 된다. 언어 무관 ASCII.
 */
export function formatSlotPercent(p: number): string {
  const pct = Math.round(p * 10000) / 100;
  return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}

/**
 * 아이템 상자에서 나올 등급을 굴리는 층 보정값.
 * 실제 등급/장비 생성은 기존 `rollDropRarity` + `rollEquipmentDrop` 이 한다 —
 * 새 아이템 생성기를 만들지 않는다.
 */
export function slotItemBoxFloor(currentFloor: number): number {
  const grant = SLOT_GRANTS.itemBox;
  const bonus = grant.kind === "itemBox" ? grant.floorBonus : 0;
  return currentFloor + bonus;
}


/* ══════════════════════════════════════════════════════════════════════
 * 룬 자물쇠 (rune lock) — 상자를 여는 짧은 조작
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 걸쇠를 맞춘 정확도. 세 등급뿐이고 **실패 등급은 없다** — 빗나가도 상자는
 * 열리고 기본 보상은 그대로 나온다. 코인을 내고 아무것도 못 받는 경우를
 * 만들지 않는다.
 */
export type RuneLockTier = "plain" | "good" | "perfect";

/**
 * 등급별 보상 배율. **이 파일에서 수치를 바꾸는 유일한 규칙이다.**
 * 확률 테이블(`SLOT_OUTCOMES`)은 손대지 않는다 — 결과는 예전 그대로 나오고,
 * 그 위에 조작 정확도가 최대 +30% 를 얹는다.
 *
 * 상한을 1.3 으로 둔 근거: 최고가 결과(coinJackpot 700)에서도 +210C 라 하루
 * 상한 3회의 총액을 흔들지 않는다. 방지권·장비는 배율 대상이 아니라 실효
 * 상승폭은 코인 결과에만 붙는다.
 *
 * **다음 밸런스 패스가 우연히 다시 발견하지 않도록 적어둔다 — 등급 보너스는
 * 기댓값을 비용 위로 올린다.** 표(`SLOT_OUTCOMES`)를 그대로 두고 코인 결과에만
 * 배율을 얹었을 때의 실측 환수율:
 *
 *   plain(x1)     92.75%   (= `slotRtp()`, 상자 비용 100C 기준)
 *   good(x1.15)  101.70%
 *   perfect(x1.3) 110.54%
 *
 * 즉 목표대를 맞출 수 있는 플레이어에게 상자는 이득이다. 이걸 감수하는 이유는
 * 두 가지다: (1) 상한을 하루 3회(`SLOT_DAILY_SPIN_CAP`)로 묶어 총 유입이
 * +31.6C/일(perfect 전탄 기준)을 넘지 못한다. (2) 확률이 아니라 조작 실력에
 * 보상하는 것이 이 이벤트의 존재 이유다 (2.3.6 대응). 수치를 손보려면 배율이
 * 아니라 하루 상한이나 표를 먼저 본다.
 */
export const RUNE_LOCK_BONUS: Record<RuneLockTier, number> = {
  plain: 1,
  good: 1.15,
  perfect: 1.3,
};

/**
 * 걸쇠 트랙(0~1)에서 목표대의 반폭. 안쪽(perfect)은 트랙 전체의 10%, 바깥쪽
 * (good)은 26% 다. 표식 왕복 주기가 1.2초 안팎이라 안쪽은 "노려야 맞는" 폭이고
 * 바깥쪽은 "대충 눌러도 절반쯤" 맞는 폭이다.
 *
 * 목표 위치와 표식 속도는 **표시 전용 난수**로 정한다 (세션 RNG 를 쓰지 않고
 * 저장하지도 않는다). 그래야 엔진 결정론과 동치성 검증이 조작에 영향받지 않는다.
 */
export const RUNE_LOCK_INNER_HALF = 0.05;
export const RUNE_LOCK_OUTER_HALF = 0.13;

/**
 * 표식 위치(0~1)와 목표 중심(0~1)으로 등급을 가른다. 순수 함수 — 웹과 iOS 가
 * 같은 판정을 낸다.
 */
export function runeLockTier(marker: number, center: number): RuneLockTier {
  const d = Math.abs(marker - center);
  if (d <= RUNE_LOCK_INNER_HALF) return "perfect";
  if (d <= RUNE_LOCK_OUTER_HALF) return "good";
  return "plain";
}

/** `SLOT_GRANTS` 한 칸의 타입. 보너스 함수의 입력이자 출력. */
export type SlotGrant = (typeof SLOT_GRANTS)[SlotOutcomeId];

/**
 * 뽑힌 보상에 걸쇠 등급 보너스를 얹는다. **코인과 XP 액수만** 곱하고 반올림한다
 * (웹 `Math.round`, iOS `jsRound` — 같은 규칙). 장비·방지권·상자·버프는 개수까지
 * 그대로 돌려준다: 방지권 1장을 1.3장으로 만들 수 없고, 버프 퍼센트를 흔들면
 * 전투 밸런스가 조작 정확도에 묶여버린다.
 *
 * 현재 표에는 XP 를 주는 결과가 없다. 나중에 `{ kind: "xp"; amount }` 같은 지급이
 * 추가되면 코인과 같은 자리에서 곱해야 한다 (그렇지 않으면 XP 만 보너스를 못 받는
 * 비일관이 생긴다).
 *
 * 순수 함수다 — 입력을 변형하지 않고 새 객체를 낸다.
 */
export function applyRuneLockBonus(
  reward: SlotGrant,
  tier: RuneLockTier,
): SlotGrant {
  const mult = RUNE_LOCK_BONUS[tier];
  if (mult === 1) return reward;
  if (reward.kind === "coins") {
    return { kind: "coins", amount: Math.round(reward.amount * mult) };
  }
  return reward;
}

/**
 * 등급 보너스를 "+15%" 처럼 보여주기 위한 정수 퍼센트. plain 은 0 이라 UI 가
 * 칩 자체를 그리지 않는다.
 */
export function runeLockBonusPercent(tier: RuneLockTier): number {
  return Math.round((RUNE_LOCK_BONUS[tier] - 1) * 100);
}
