/**
 * 오늘의 기운 — 하루 1회, 내 컬렉션에서 뽑은 카드 1장에 맞춘 색·문구·명언.
 *
 * 설계 원칙:
 *  - **운세가 아니라 렌즈**. 결과를 단정("오늘 운이 나쁘다")하지 않는다. 갓생앱은
 *    "오늘은 내가 만든다"가 전제라, 정해진 운을 통보하면 앱이 스스로를 부정한다.
 *    그래서 하늘이 아니라 **유저 자신의 덱**(= 지금까지의 노력)에서 카드를 뽑는다.
 *  - **생년월일 등 개인정보를 일절 받지 않는다.** 시드는 날짜 + 기기 로컬 salt 뿐.
 *  - **결정론적**. 같은 날 같은 기기면 새로고침해도 결과가 같다. 리롤해서 좋은 운을
 *    찾는 행동(=가챠화)을 원천 차단한다.
 *
 * 카드 → 카테고리 → 색/문구/명언이 모두 같은 카테고리 풀에서 나오므로 넷이 항상
 * 한 주제로 묶인다. 명언은 기존 QUOTE_POOL 재사용(카테고리별 8개 × 4언어).
 */

import { ALL_CARDS } from "@/data/cards";
import { QUOTE_POOL, type Quote } from "@/data/quotePool";
import {
  FORTUNE_COLORS,
  FORTUNE_PHRASES,
  type FortuneColor,
  type L10nText,
} from "@/data/fortunePool";
import type { ChallengeCard } from "@/types/card";
import {
  AURA_VARIANTS,
  AURA_KINDS,
  TAROT_CARD_COUNT,
  type AuraKind,
  type AuraOmen,
  type AuraReading,
  type AuraTier,
} from "@/lib/aura";

export interface DailyFortune {
  /** 오늘의 카드 — 유저가 해금한 카드 중에서만 뽑는다 */
  card: ChallengeCard;
  color: FortuneColor;
  phrase: L10nText;
  /** 명언. author 가 있으면 실존 인물 인용이므로 저자명을 함께 노출한다. */
  quote: Quote;
}

/**
 * FNV-1a 32bit. quotePool 의 simpleHash 보다 분산이 좋아 서로 다른 접두사로
 * 파생 시드를 만들 때 상관관계가 낮다(색·문구·명언이 함께 몰리지 않는다).
 */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 오늘의 기운 계산. 순수 함수 — 저장소를 건드리지 않는다.
 *
 * @param dateKey  "YYYY-MM-DD" (getTodayString())
 * @param salt     기기별 고정 salt. 같은 날 유저마다 다른 카드가 나오게 한다.
 * @param unlockedCardIds 해금된 카드 ID 목록
 * @returns 해금 카드가 하나도 없으면 null (온보딩 직후 방어)
 */
export function computeDailyFortune(
  dateKey: string,
  salt: string,
  unlockedCardIds: string[],
): DailyFortune | null {
  const unlocked = new Set(unlockedCardIds);
  const pool = ALL_CARDS.filter((c) => unlocked.has(c.id));
  if (pool.length === 0) return null;

  const base = `${dateKey}|${salt}`;
  const card = pool[fnv1a(`card:${base}`) % pool.length];

  // 색·문구·명언 시드에 card.id 를 섞는다 — 같은 날이라도 카드가 바뀌면
  // 나머지 셋도 함께 바뀌어 "이 카드에 붙은 조합" 이라는 인상이 강해진다.
  const colors = FORTUNE_COLORS[card.category];
  const phrases = FORTUNE_PHRASES[card.category];
  const quotes = QUOTE_POOL[card.category];

  return {
    card,
    color: colors[fnv1a(`color:${base}:${card.id}`) % colors.length],
    phrase: phrases[fnv1a(`phrase:${base}:${card.id}`) % phrases.length],
    quote: quotes[fnv1a(`quote:${base}:${card.id}`) % quotes.length],
  };
}

/* ── 로컬 상태 (salt + 공개 여부 + 기운 리딩) ──
   클라우드 동기화하지 않는다. 오늘의 기운은 그날 하루만 의미가 있고,
   기기별로 달라도 문제가 되지 않는 가벼운 상태다. */

const STORAGE_KEY = "upnext_fortune";

export interface FortuneState {
  /** 기기 고정 salt — 최초 1회 생성 후 불변 */
  salt: string;
  /** 오늘의 기운을 이미 공개한 날짜. 같은 날 재방문 시 광고를 다시 보지 않는다. */
  revealedDate?: string;
  /** 기운 리딩(재물·관계·건강)을 계산해 고정한 날짜 */
  auraDate?: string;
  /** 그날 이미 연 기운 종류. 여기 있으면 광고 없이 다시 볼 수 있다. */
  auraOpened?: AuraKind[];
  /**
   * 첫 리딩을 연 시점에 3종을 한꺼번에 계산해 고정한 값.
   * 하루 안에서 점수가 흔들리면 "그럴싸함"이 깨진다 — 오전에 본 재물기운이
   * 오후에 카드를 하나 더 깼다고 달라지면 점이 아니라 대시보드가 된다.
   */
  auraSnapshot?: Record<AuraKind, AuraReading>;
  /**
   * 그날 각 기운에서 뒤집은 타로 카드 id(0..39). 선택은 유저 몫이지만 하루 고정 —
   * 재선택 불가. auraDate 롤오버 시 열람 기록·스냅샷과 함께 소거된다.
   */
  auraTarot?: Partial<Record<AuraKind, number>>;
}

function randomSalt(): string {
  // crypto 우선, 미지원 환경(구형 WebView)은 Math.random 폴백.
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // 폴백으로 진행
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ── 저장값 관용 디코드 ──
   localStorage 는 다른 버전의 앱·손댄 값·잘린 JSON 이 섞일 수 있다.
   형태가 조금이라도 어긋나면 그 필드만 버리고(undefined) 나머지는 살린다.
   기운 리딩이 깨져도 salt 는 반드시 지켜야 한다 — salt 가 바뀌면 오늘의
   카드가 하루 중간에 바뀐다. */

const AURA_TIERS: AuraTier[] = ["great", "good", "fair", "care"];
const AURA_OMENS: AuraOmen[] = [
  "closing",
  "gathering",
  "rhythm",
  "carried",
  "resting",
  "unformed",
];

function isAuraKind(value: unknown): value is AuraKind {
  return typeof value === "string" && (AURA_KINDS as string[]).includes(value);
}

/**
 * 이전 버전이 저장한 리딩(stat·window·evidence 를 담던 형태)은 omen 이 없으므로
 * 여기서 null 이 되고, 스냅샷 전체가 버려져 오늘치가 새로 계산된다.
 * 마이그레이션을 따로 두지 않는 이유: 하루짜리 값이라 다시 뽑아도 잃는 게 없다.
 */
function decodeReading(value: unknown, kind: AuraKind): AuraReading | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  const { score } = r;
  // score 는 화면에 나가지 않지만 tier 를 다시 계산할 근거로 남겨 둔다.
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (typeof r.tier !== "string" || !(AURA_TIERS as string[]).includes(r.tier)) return null;
  if (typeof r.omen !== "string" || !(AURA_OMENS as string[]).includes(r.omen)) return null;
  // variant 는 표현 번호(0~2). 구 스냅샷에는 없으므로 0 으로 보정한다 — 하루짜리 값이라
  // 마이그레이션 없이 그날만 첫 표현으로 보이면 충분하다.
  const variant =
    typeof r.variant === "number" && Number.isInteger(r.variant) && r.variant >= 0
      ? r.variant % AURA_VARIANTS
      : 0;
  return {
    kind,
    score,
    tier: r.tier as AuraTier,
    omen: r.omen as AuraOmen,
    variant,
  };
}

/** 3종이 모두 온전할 때만 스냅샷으로 인정한다 — 반쪽 스냅샷은 없느니만 못하다. */
function decodeSnapshot(value: unknown): Record<AuraKind, AuraReading> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const out = {} as Record<AuraKind, AuraReading>;
  for (const kind of AURA_KINDS) {
    const reading = decodeReading(raw[kind], kind);
    if (!reading) return undefined;
    out[kind] = reading;
  }
  return out;
}

/**
 * 타로 선택 관용 디코드 — 0..39 정수만 인정하고 어긋난 항목은 그 기운만 버린다.
 * 덱이 줄어드는 일은 없지만(id 불변 계약) 손댄 저장값이 화면 인덱싱을 깨면 안 된다.
 */
function decodeTarot(value: unknown): Partial<Record<AuraKind, number>> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const out: Partial<Record<AuraKind, number>> = {};
  let any = false;
  for (const kind of AURA_KINDS) {
    const v = raw[kind];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < TAROT_CARD_COUNT) {
      out[kind] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

function decodeOpened(value: unknown): AuraKind[] | undefined {
  if (!Array.isArray(value)) return undefined;
  // AURA_KINDS 순서로 정규화 — 저장 순서가 UI 순서를 흔들지 않게.
  const set = new Set(value.filter(isAuraKind));
  const list = AURA_KINDS.filter((k) => set.has(k));
  return list.length > 0 ? list : undefined;
}

export function readFortuneState(): FortuneState {
  if (typeof window === "undefined") return { salt: "ssr" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.salt === "string" && parsed.salt.length > 0) {
        return {
          salt: parsed.salt,
          revealedDate:
            typeof parsed.revealedDate === "string" ? parsed.revealedDate : undefined,
          auraDate: typeof parsed.auraDate === "string" ? parsed.auraDate : undefined,
          auraOpened: decodeOpened(parsed.auraOpened),
          auraSnapshot: decodeSnapshot(parsed.auraSnapshot),
          auraTarot: decodeTarot(parsed.auraTarot),
        };
      }
    }
  } catch {
    // 파싱 실패 — 새 salt 로 재시작
  }
  const fresh: FortuneState = { salt: randomSalt() };
  writeFortuneState(fresh);
  return fresh;
}

export function writeFortuneState(state: FortuneState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패는 치명적이지 않다 — 다음 방문에 광고를 한 번 더 보게 될 뿐
  }
}

/** 오늘 이미 공개했는지 */
export function isFortuneRevealed(today: string): boolean {
  return readFortuneState().revealedDate === today;
}

/** 공개 처리 (광고 시청 완료 후 호출) */
export function markFortuneRevealed(today: string): void {
  const state = readFortuneState();
  writeFortuneState({ ...state, revealedDate: today });
}

/* ── 기운 리딩 상태 ──
   auraDate 가 오늘이 아니면 열람 기록과 스냅샷을 통째로 버린다.
   날짜 비교 한 곳(sameDay)만 통과시켜, 자정을 넘긴 어제 값이 오늘 화면에
   섞여 들어오는 경로를 하나로 좁힌다. */

export interface AuraState {
  /** 오늘 이미 연 기운. 광고 없이 다시 볼 수 있다. */
  opened: AuraKind[];
  /** 오늘 고정된 3종 리딩. 아직 첫 리딩을 열지 않았으면 null. */
  snapshot: Record<AuraKind, AuraReading> | null;
  /** 오늘 각 기운에서 뒤집은 타로 카드 id. 없는 기운은 아직 미선택. */
  tarot: Partial<Record<AuraKind, number>>;
}

const EMPTY_AURA: AuraState = { opened: [], snapshot: null, tarot: {} };

function forToday(state: FortuneState, today: string): AuraState {
  if (state.auraDate !== today) return EMPTY_AURA;
  return {
    opened: state.auraOpened ?? [],
    snapshot: state.auraSnapshot ?? null,
    tarot: state.auraTarot ?? {},
  };
}

/** 오늘 자 타로 선택이 하나라도 있는지 — 롤오버 때 빈 객체를 저장하지 않기 위한 판별 */
function hasTarot(tarot: Partial<Record<AuraKind, number>>): boolean {
  return AURA_KINDS.some((k) => tarot[k] !== undefined);
}

/** 오늘 기준 기운 상태 읽기. 날짜가 넘어갔으면 빈 상태를 돌려준다. */
export function readAuraState(today: string): AuraState {
  return forToday(readFortuneState(), today);
}

/**
 * 첫 리딩을 여는 순간 3종을 한꺼번에 고정한다.
 * 이미 오늘 스냅샷이 있으면 덮어쓰지 않는다 — 하루 안에서 점수는 불변이다.
 * @returns 실제로 오늘 유효한 스냅샷 (기존 것이 있으면 그것)
 */
export function ensureAuraSnapshot(
  today: string,
  compute: () => Record<AuraKind, AuraReading>,
): Record<AuraKind, AuraReading> {
  const state = readFortuneState();
  const current = forToday(state, today);
  if (current.snapshot) return current.snapshot;

  const snapshot = compute();
  writeFortuneState({
    ...state,
    auraDate: today,
    // 날짜가 넘어왔다면 어제 열람 기록·타로 선택은 여기서 함께 버려진다.
    auraOpened: current.opened.length > 0 ? current.opened : undefined,
    auraSnapshot: snapshot,
    auraTarot: hasTarot(current.tarot) ? current.tarot : undefined,
  });
  return snapshot;
}

/**
 * 기운 하나를 연 것으로 기록. 이미 있으면 그대로 둔다.
 * @returns 기록 후의 열람 목록 (AURA_KINDS 순서)
 */
export function markAuraOpened(today: string, kind: AuraKind): AuraKind[] {
  const state = readFortuneState();
  const current = forToday(state, today);
  if (current.opened.includes(kind)) return current.opened;

  const next = AURA_KINDS.filter((k) => k === kind || current.opened.includes(k));
  writeFortuneState({
    ...state,
    auraDate: today,
    auraOpened: next,
    // 스냅샷 없이 열람만 기록되는 경로는 없어야 하지만, 만에 하나 그렇게 되면
    // 다음 ensureAuraSnapshot 이 채운다 (auraDate 는 여기서 이미 오늘로 맞춘다).
    auraSnapshot: current.snapshot ?? undefined,
    auraTarot: hasTarot(current.tarot) ? current.tarot : undefined,
  });
  return next;
}

/**
 * 타로 선택을 기록한다. 그날 그 기운의 선택은 하루 고정 — 이미 있으면 덮지 않는다.
 * (탭 두 번·경쟁 렌더가 와도 첫 선택이 이긴다. 재선택 불가는 UI 약속이 아니라
 * 저장 계층의 계약이다.)
 *
 * @returns 오늘 이 기운에 고정된 카드 id. 기존 선택이 있으면 그 값이다.
 */
export function markAuraTarot(today: string, kind: AuraKind, cardId: number): number {
  const state = readFortuneState();
  const current = forToday(state, today);
  const existing = current.tarot[kind];
  if (existing !== undefined) return existing;
  // 저장 계약은 관용 디코드와 같다 — 0..39 정수만. 밖의 값은 기록하지 않고 그대로
  // 돌려준다(UI 는 auraTarotOffer 산출값만 넘기므로 실전에서 걸릴 일은 없는 방어선).
  if (!Number.isInteger(cardId) || cardId < 0 || cardId >= TAROT_CARD_COUNT) return cardId;
  writeFortuneState({
    ...state,
    auraDate: today,
    // 날짜가 넘어온 첫 기록이라면 어제 열람·스냅샷은 여기서 함께 버려진다.
    auraOpened: current.opened.length > 0 ? current.opened : undefined,
    auraSnapshot: current.snapshot ?? undefined,
    auraTarot: { ...current.tarot, [kind]: cardId },
  });
  return cardId;
}
