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
function fnv1a(input: string): number {
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

/* ── 로컬 상태 (salt + 공개 여부) ──
   클라우드 동기화하지 않는다. 오늘의 기운은 그날 하루만 의미가 있고,
   기기별로 달라도 문제가 되지 않는 가벼운 상태다. */

const STORAGE_KEY = "upnext_fortune";

interface FortuneState {
  /** 기기 고정 salt — 최초 1회 생성 후 불변 */
  salt: string;
  /** 오늘의 기운을 이미 공개한 날짜. 같은 날 재방문 시 광고를 다시 보지 않는다. */
  revealedDate?: string;
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

export function readFortuneState(): FortuneState {
  if (typeof window === "undefined") return { salt: "ssr" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FortuneState>;
      if (typeof parsed.salt === "string" && parsed.salt.length > 0) {
        return { salt: parsed.salt, revealedDate: parsed.revealedDate };
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
