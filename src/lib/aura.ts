/**
 * 오늘의 기운 — 재물·관계·건강 3종 리딩.
 *
 * 설계의 핵심: **점수는 실제 행동에서 나오되, 화면에는 수치를 드러내지 않는다.**
 * 최근 14일의 완료·체크인·카테고리 분포가 점수를 만들지만, 유저가 보는 것은
 * 점술의 언어다. "최근 14일 중 9일 체크인했어요" 같은 문장은 점집을 대시보드로
 * 만든다. 데이터는 **어떤 문장을 보여줄지 고르는 데만** 쓴다.
 * 그래서 맞는 말처럼 느껴지되 기계처럼 읽히지 않는다.
 *
 * 문장 변주: 조짐과 조언은 신호·등급으로 고르므로, 습관이 안정되면 **매일 같은 문장**이
 * 나온다. 점수만 흔들고 텍스트를 고정하면 유저가 보는 화면은 결국 어제와 같다.
 * 그래서 같은 조짐·같은 등급 안에서도 날짜 해시로 3가지 표현 중 하나를 고른다.
 *
 * 등급 주사위: 행동 신호만 쓰면 습관이 안정된 유저는 **매일 같은 결과**가 나온다.
 * 그건 점이 아니라 통계표다. 그래서 역할을 나눈다 —
 * **조짐(omen)은 행동의 정직한 거울**이고(신호에서 직접 나온다, 변덕 없음),
 * **등급(tier)은 행동이 확률을 기울인 하늘의 주사위**다. base 점수(0~100)는
 * great/good/fair/care 의 확률 가중치를 만들고, (날짜 + 기기 salt + 기운) 해시가
 * 그 가중치 위에서 등급을 뽑는다. "점"의 의외성은 등급이 담당하고,
 * 행동의 인과("요즘 잘하면 대체로 좋게 나온다")는 기울어진 확률이 담당한다.
 * 성실해도 가끔 흐린 날이 오고, 게을러도 가끔 맑은 날이 온다 — 그게 점이다.
 *
 * 결정론: 같은 데이터 + 같은 날 + 같은 salt 면 항상 같은 결과. 난수를 쓰지 않는다.
 * 해시 주사위라 리롤 가챠화가 불가능하다. 점수는 공개 시점에 스냅샷해 저장하므로,
 * 그날 안에서 값이 흔들리지 않는다.
 *
 * 톤 규칙: 낮은 점수를 꾸짖지 않는다. 갓생앱은 격려가 전제라
 * "못했다"가 아니라 "지금부터 할 수 있다"로 쓴다. tier 는 심판이 아니라 날씨다.
 */

import type { Category } from "@/types/card";
import type { DayRecord } from "@/types/game";
import { ALL_CARDS } from "@/data/cards";
import { fnv1a } from "@/lib/fortune";

/** 관측 창 — 너무 짧으면 표본이 없고, 너무 길면 "요즘"이 아니게 된다 */
export const AURA_WINDOW_DAYS = 14;

export type AuraKind = "wealth" | "relationship" | "health";
export type AuraTier = "great" | "good" | "fair" | "care";

export const AURA_KINDS: AuraKind[] = ["wealth", "relationship", "health"];

/**
 * 조짐 — 어떤 신호가 이 점수를 만들었는지에 따라 고르는 **문장의 결**.
 * 수치는 여기서 끝나고 화면으로 넘어가지 않는다. UI 는 이 값으로 문장만 고른다.
 */
export type AuraOmen =
  | "closing"   // 끝맺음이 잘 되는 흐름 (풀클리어)
  | "gathering" // 한 방향으로 힘이 모임 (카테고리 집중)
  | "rhythm"    // 리듬이 몸에 뱄음 (체크인 규칙성)
  | "carried"   // 이어온 시간이 받쳐줌 (연속 기록)
  | "resting"   // 쉼이 다음을 준비함 (방패)
  | "unformed"; // 아직 흐름이 잡히기 전 (표본 적음)

export interface AuraReading {
  kind: AuraKind;
  /**
   * 0~100. 실측 신호의 가중합.
   * **화면에 숫자로 노출하지 마라.** 등급(tier)과 조짐(omen)만 보여준다.
   * 점수를 드러내면 유저가 역산하려 들고, 그 순간 점집이 성적표가 된다.
   */
  score: number;
  tier: AuraTier;
  omen: AuraOmen;
  /**
   * 같은 조짐·등급 안에서 고를 표현 번호(0~2).
   * 날짜 해시라 같은 날이면 고정이고, 날이 바뀌면 문장이 달라진다.
   */
  variant: number;
}

/** 조짐·조언 표현 가짓수 */
export const AURA_VARIANTS = 3;

/** 알고리즘 입력 — 스토어에서 뽑아 온 원시 신호 */
export interface AuraInput {
  /** 시간순(오래된 것 먼저) 완료 이력 */
  history: DayRecord[];
  /** 체크인 날짜 목록 */
  checkInDates: string[];
  /** 방패로 메운 날짜 목록 */
  usedSaverDates: string[];
  /** 현재 불꽃 연속일수 */
  streak: number;
  /** 2인 불꽃이 맺어져 있는지 */
  duoActive: boolean;
  /** 오늘 날짜 "YYYY-MM-DD" */
  today: string;
  /**
   * 기기 고정 salt(readFortuneState().salt). 하루치 흔들림 시드로 쓴다.
   * 없으면 흔들림 0 으로 신호만 계산한다(테스트·서버 계산용).
   */
  salt?: string;
}

/* ── 카테고리 묶음 ── */
const WEALTH_CATS: Category[] = ["productivity", "learning"];
const RELATION_CATS: Category[] = ["social", "trending"];
const HEALTH_CATS: Category[] = ["fitness", "nutrition", "wellness", "mindfulness"];

const CARD_CATEGORY = new Map(ALL_CARDS.map((c) => [c.id, c.category]));

function daysBefore(today: string, n: number): Set<string> {
  const out = new Set<string>();
  const base = new Date(`${today}T00:00:00`);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    out.add(d.toISOString().slice(0, 10));
  }
  return out;
}

/** 0~1 로 눌러 담기 */
function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(1, part / whole));
}

/** 신호 여러 개를 가중 평균해 0~100 으로 */
function blend(parts: { value: number; weight: number }[]): number {
  const total = parts.reduce((a, p) => a + p.weight, 0);
  if (total <= 0) return 0;
  const sum = parts.reduce((a, p) => a + p.value * p.weight, 0);
  return Math.round((sum / total) * 100);
}

/** 같은 조짐 안에서 오늘 쓸 표현 번호. 주사위와 다른 접두사라 상관관계가 없다. */
function variantOf(today: string, salt: string | undefined, kind: AuraKind): number {
  if (!salt) return 0;
  return fnv1a(`phrase:${today}:${salt}:${kind}`) % AURA_VARIANTS;
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function tierOf(score: number): AuraTier {
  if (score >= 80) return "great";
  if (score >= 60) return "good";
  if (score >= 38) return "fair";
  return "care";
}

/**
 * 등급별 점수 밴드. tierOf(밴드하한 + 0..폭-1) == 해당 등급이 되도록 잡았다.
 * 점수는 저장·회귀용으로만 밴드 안에서 뽑는다 — 화면에는 여전히 안 나간다.
 */
const TIER_BANDS: Record<AuraTier, { low: number; width: number }> = {
  great: { low: 80, width: 21 }, // 80..100
  good: { low: 60, width: 20 },  // 60..79
  fair: { low: 38, width: 22 },  // 38..59
  care: { low: 0, width: 38 },   // 0..37
};

/**
 * 등급 확률 롤 — **웹/iOS 가 정수 연산까지 동일해야 하는 확정 스펙.**
 * (Math.floor 나눗셈 == Swift Int 나눗셈. 임의 개선 금지 — 곧 플랫폼 불일치다.)
 *
 * 왜 주사위가 등급을 맡는가: 조짐은 행동의 거울이라 습관이 안정되면 매일 같다.
 * 등급마저 행동에서 직접 나오면 이 화면은 어제와 똑같은 성적표가 된다.
 * 그래서 행동(base)은 확률을 기울이는 데까지만 관여하고, 최종 등급은
 * 결정론적 해시 주사위가 뽑는다. base 0 이어도 great 6%, base 100 이어도 care 5% —
 * 하늘은 심판하지 않고, 다만 성실한 쪽으로 기운다.
 *
 * salt 가 없으면(SSR 등) 주사위 없이 base 를 그대로 쓴다.
 */
export function rollTier(
  base: number,
  today: string,
  salt: string | undefined,
  kind: AuraKind,
): { tier: AuraTier; score: number } {
  if (!salt) return { tier: tierOf(base), score: base };
  const r = fnv1a("tier:" + today + "|" + salt + "|" + kind) % 1000;
  const wGreat = 60 + Math.floor((440 * base) / 100);                 // 6% → 50%
  const wGood = 200 + Math.floor((150 * base) / 100);                 // 20% → 35%
  const wCare = Math.max(50, 180 - Math.floor((130 * base) / 100));   // 18% → 5%
  const wFair = 1000 - wGreat - wGood - wCare;
  // 누적 순서 great → good → fair → care
  let tier: AuraTier;
  if (r < wGreat) tier = "great";
  else if (r < wGreat + wGood) tier = "good";
  else if (r < wGreat + wGood + wFair) tier = "fair";
  else tier = "care";
  const band = TIER_BANDS[tier];
  const score = band.low + (fnv1a("tierscore:" + today + "|" + salt + "|" + kind) % band.width);
  return { tier, score };
}

/** 관측 창 안의 집계 */
interface Window {
  days: number;
  activeDays: number;      // 카드를 하나라도 완료한 날
  fullClearDays: number;
  failedDays: number;
  checkInDays: number;
  saverDays: number;
  byCategory: Record<Category, number>;
  totalCompleted: number;
}

function summarize(input: AuraInput): Window {
  const win = daysBefore(input.today, AURA_WINDOW_DAYS);
  const byCategory = {
    fitness: 0, nutrition: 0, mindfulness: 0, learning: 0,
    social: 0, productivity: 0, wellness: 0, trending: 0,
  } as Record<Category, number>;

  let activeDays = 0, fullClearDays = 0, failedDays = 0, totalCompleted = 0;
  for (const rec of input.history) {
    if (!win.has(rec.date)) continue;
    const done = rec.completedCardIds ?? [];
    if (done.length > 0) activeDays++;
    if (rec.wasFullClear) fullClearDays++;
    if (rec.wasFailed) failedDays++;
    totalCompleted += done.length;
    for (const id of done) {
      const cat = CARD_CATEGORY.get(id);
      if (cat) byCategory[cat]++;
    }
  }

  return {
    days: AURA_WINDOW_DAYS,
    activeDays,
    fullClearDays,
    failedDays,
    totalCompleted,
    checkInDays: input.checkInDates.filter((d) => win.has(d)).length,
    saverDays: input.usedSaverDates.filter((d) => win.has(d)).length,
    byCategory,
  };
}

function sumCats(w: Window, cats: Category[]): number {
  return cats.reduce((a, c) => a + w.byCategory[c], 0);
}

/**
 * 재물기운 — 쌓는 힘. 꾸준함과 마무리에서 나온다.
 * 신호: 풀클리어 비율(약속을 끝까지 지킨 날), 생산성·학습 카드 비중, 연속 기록.
 */
function wealth(w: Window, input: AuraInput): AuraReading {
  const focus = sumCats(w, WEALTH_CATS);
  const parts = [
    { value: ratio(w.fullClearDays, w.days), weight: 3 },
    { value: ratio(focus, Math.max(4, w.totalCompleted)), weight: 2 },
    { value: ratio(input.streak, 10), weight: 1 },
  ];
  const base = clamp100(blend(parts));
  const { tier, score } = rollTier(base, input.today, input.salt, "wealth");
  let omen: AuraOmen = "unformed";
  if (w.totalCompleted === 0) omen = "unformed";
  else if (w.fullClearDays >= 3) omen = "closing";
  else if (focus >= 3) omen = "gathering";
  else if (input.streak >= 3) omen = "carried";
  return { kind: "wealth", score, tier, omen, variant: variantOf(input.today, input.salt, "wealth") };
}

/**
 * 관계기운 — 잇는 힘. 소통 카드와 2인 불꽃에서 나온다.
 * 표본이 적은 카테고리라 기준을 낮게 잡는다(소통 카드는 매일 나오지 않는다).
 */
function relationship(w: Window, input: AuraInput): AuraReading {
  const focus = sumCats(w, RELATION_CATS);
  const parts = [
    { value: ratio(focus, 5), weight: 3 },
    { value: input.duoActive ? 1 : 0, weight: 2 },
    { value: ratio(w.activeDays, w.days), weight: 1 },
  ];
  const base = clamp100(blend(parts));
  const { tier, score } = rollTier(base, input.today, input.salt, "relationship");
  let omen: AuraOmen = "unformed";
  if (focus >= 2) omen = "gathering";
  else if (w.activeDays >= 5) omen = "rhythm";
  return { kind: "relationship", score, tier, omen, variant: variantOf(input.today, input.salt, "relationship") };
}

/**
 * 건강기운 — 지키는 힘. 몸 카드와 체크인 규칙성에서 나온다.
 * 방패로 쉬어간 날은 감점하지 않는다. 쉬는 것도 관리다(원칙: 낮은 점수로 꾸짖지 않는다).
 * 다만 실패일(무리했거나 놓친 날)은 약하게 감점한다.
 */
function health(w: Window, input: AuraInput): AuraReading {
  const focus = sumCats(w, HEALTH_CATS);
  const penalty = ratio(w.failedDays, w.days) * 0.5;
  const parts = [
    { value: ratio(focus, 8), weight: 3 },
    { value: ratio(w.checkInDays, w.days), weight: 3 },
    { value: Math.max(0, 1 - penalty), weight: 1 },
  ];
  const base = clamp100(blend(parts));
  const { tier, score } = rollTier(base, input.today, input.salt, "health");
  let omen: AuraOmen = "unformed";
  if (w.checkInDays >= 7) omen = "rhythm";
  else if (focus >= 3) omen = "gathering";
  else if (w.saverDays > 0) omen = "resting";
  return { kind: "health", score, tier, omen, variant: variantOf(input.today, input.salt, "health") };
}

/** 오늘의 실마리 / 흘려보낼 것 문구 가짓수 (aura.hint.{kind}.{0..5}, aura.caution.{kind}.{0..5}) */
export const AURA_HINT_COUNT = 6;

/**
 * 오늘의 실마리 선택 인덱스 (aura.hint.{kind}.{i}).
 * 등급 주사위·표현 번호와 다른 접두사라 서로 상관관계가 없다. salt 없으면 0.
 */
export function auraHintIndex(today: string, salt: string | undefined, kind: AuraKind): number {
  if (!salt) return 0;
  return fnv1a("hint:" + today + "|" + salt + "|" + kind) % AURA_HINT_COUNT;
}

/** 흘려보낼 것 선택 인덱스 (aura.caution.{kind}.{i}). salt 없으면 0. */
export function auraCautionIndex(today: string, salt: string | undefined, kind: AuraKind): number {
  if (!salt) return 0;
  return fnv1a("caution:" + today + "|" + salt + "|" + kind) % AURA_HINT_COUNT;
}

/** 세 기운을 한 번에. 순서는 항상 재물 → 관계 → 건강. */
export function computeAura(input: AuraInput): Record<AuraKind, AuraReading> {
  const w = summarize(input);
  return {
    wealth: wealth(w, input),
    relationship: relationship(w, input),
    health: health(w, input),
  };
}
