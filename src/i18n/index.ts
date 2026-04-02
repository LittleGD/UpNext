import ko, { type DictKey } from "./ko";
import en from "./en";
import ja from "./ja";
import zh from "./zh";
import type { Language } from "@/types/game";
import type { ChallengeCard } from "@/types/card";
import type { TitleDefinition } from "@/types/title";
import type { StarterPack } from "@/data/starterPacks";
import { ALL_CARDS } from "@/data/cards";

const dictionaries: Record<Language, Record<DictKey, string>> = { ko, en, ja, zh };

/**
 * Translate a key, with optional interpolation.
 * Usage: t("daily.board.streak", lang, { days: 3 })
 */
export function t(
  key: DictKey,
  lang: Language = "ko",
  params?: Record<string, string | number>,
): string {
  let text = dictionaries[lang]?.[key] ?? dictionaries.ko[key] ?? key;
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
