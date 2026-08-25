import ko, { type DictKey } from "./ko";
import type { Language } from "@/types/game";
import type { ChallengeCard } from "@/types/card";
import type { TitleDefinition } from "@/types/title";
import type { StarterPack } from "@/data/starterPacks";
import { ALL_CARDS } from "@/data/cards";

/**
 * Phase 14 code-review High #12 — lazy-load non-default language bundles.
 *
 * 이전: `ko` / `en` / `ja` / `zh` 모두 static import (각 ≈ 1,810 라인) — 한국어
 *   유저도 EN/JA/ZH 를 전부 번들링 (초기 JS ≈ 4× 중복). 현재 모든 트래픽 UA 이
 *   한국어라 낭비가 특히 큼.
 *
 * 이후: `ko` 만 static (fallback guarantee), 나머지는 유저가 해당 언어 선택 시
 *   `import()` 로 code-split chunk fetch. t() 는 동기 API 유지 — 로드 전엔
 *   ko 로 graceful fallback, 로드 완료 시 subscriber 에게 notify 하여 re-render.
 *
 * 테스트 (i18n.test.ts) 는 직접 `./en` 등 import 하므로 영향 없음.
 */

type Dict = Record<DictKey, string>;

const dicts: Partial<Record<Language, Dict>> = { ko };

const loaders: Partial<Record<Language, () => Promise<Dict>>> = {
  en: () => import("./en").then((m) => m.default),
  ja: () => import("./ja").then((m) => m.default),
  zh: () => import("./zh").then((m) => m.default),
};

/** 로드 완료 시 subscriber notify — useTranslation 의 re-render 트리거. */
const subscribers = new Set<() => void>();
let version = 0;
function bumpVersion() {
  version += 1;
  subscribers.forEach((fn) => fn());
}

/** 진행 중 load promise dedupe — 같은 lang 중복 import 방지. */
const inflight: Partial<Record<Language, Promise<Dict>>> = {};

/**
 * 해당 언어 dict 가 메모리에 있도록 보장. 이미 로드돼있거나 ko 면 즉시 resolve.
 *   실패 시 warn + fallback (ko 유지) — app crash 방지.
 */
export async function ensureLanguage(lang: Language): Promise<void> {
  if (dicts[lang]) return;
  const loader = loaders[lang];
  if (!loader) return; // unknown lang → ko fallback.
  if (inflight[lang]) {
    await inflight[lang];
    return;
  }
  const p = loader();
  inflight[lang] = p;
  try {
    const loaded = await p;
    dicts[lang] = loaded;
    bumpVersion();
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
       
      console.warn(`[i18n] failed to load ${lang} dict:`, e);
    }
  } finally {
    delete inflight[lang];
  }
}

/** useSyncExternalStore 용 — 로드 완료 시 snapshot 갱신 → re-render. */
export function subscribeI18n(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function getI18nVersion(): number {
  return version;
}

/**
 * Translate a key, with optional interpolation.
 * Usage: t("daily.board.streak", lang, { days: 3 })
 *   해당 lang dict 가 아직 로드 안 됐으면 ko 로 fallback (로드 완료 후 re-render).
 */
export function t(
  key: DictKey,
  lang: Language = "ko",
  params?: Record<string, string | number>,
): string {
  const dict = dicts[lang] ?? dicts.ko!;
  let text = dict[key] ?? dicts.ko![key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

// Lazy-init card lookup map (handles cards persisted without translation fields)
let _cardMap: Map<string, ChallengeCard> | null = null;
function getCardMap(): Map<string, ChallengeCard> {
  if (!_cardMap) {
    _cardMap = new Map(ALL_CARDS.map((c) => [c.id, c]));
  }
  return _cardMap;
}

function resolveCard(card: ChallengeCard): ChallengeCard {
  return getCardMap().get(card.id) ?? card;
}

/**
 * Get a card's title in the given language.
 * Falls back to Korean title if translation is missing.
 */
export function cardTitle(card: ChallengeCard, lang: Language): string {
  const c = resolveCard(card);
  if (lang === "en" && c.titleEn) return c.titleEn;
  if (lang === "ja" && c.titleJa) return c.titleJa;
  if (lang === "zh" && c.titleZh) return c.titleZh;
  return c.title;
}

/**
 * Get a card's description in the given language.
 * Falls back to Korean description if translation is missing.
 */
export function cardDesc(card: ChallengeCard, lang: Language): string {
  const c = resolveCard(card);
  if (lang === "en" && c.descriptionEn) return c.descriptionEn;
  if (lang === "ja" && c.descriptionJa) return c.descriptionJa;
  if (lang === "zh" && c.descriptionZh) return c.descriptionZh;
  return c.description;
}

/**
 * Get a title's name in the given language.
 * Falls back to Korean name if translation is missing.
 */
export function titleName(title: TitleDefinition, lang: Language): string {
  if (lang === "en" && title.nameEn) return title.nameEn;
  if (lang === "ja" && title.nameJa) return title.nameJa;
  if (lang === "zh" && title.nameZh) return title.nameZh;
  return title.name;
}

/**
 * Get a title's description in the given language.
 * Falls back to Korean description if translation is missing.
 */
export function titleDesc(title: TitleDefinition, lang: Language): string {
  if (lang === "en" && title.descriptionEn) return title.descriptionEn;
  if (lang === "ja" && title.descriptionJa) return title.descriptionJa;
  if (lang === "zh" && title.descriptionZh) return title.descriptionZh;
  return title.description;
}

/**
 * Get a starter pack's name in the given language.
 */
export function packName(pack: StarterPack, lang: Language): string {
  if (lang === "en" && pack.nameEn) return pack.nameEn;
  if (lang === "ja" && pack.nameJa) return pack.nameJa;
  if (lang === "zh" && pack.nameZh) return pack.nameZh;
  return pack.name;
}

/**
 * Get a starter pack's description in the given language.
 */
export function packDesc(pack: StarterPack, lang: Language): string {
  if (lang === "en" && pack.descriptionEn) return pack.descriptionEn;
  if (lang === "ja" && pack.descriptionJa) return pack.descriptionJa;
  if (lang === "zh" && pack.descriptionZh) return pack.descriptionZh;
  return pack.description;
}

export type { DictKey };
