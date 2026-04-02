import ko, { type DictKey } from "./ko";
import en from "./en";
import type { Language } from "@/types/game";
import type { ChallengeCard } from "@/types/card";

const dictionaries: Record<Language, Record<DictKey, string>> = { ko, en };

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

/**
 * Get a card's title in the given language.
 * Falls back to Korean title if English is missing.
 */
export function cardTitle(card: ChallengeCard, lang: Language): string {
  if (lang === "en" && card.titleEn) return card.titleEn;
  return card.title;
}

/**
 * Get a card's description in the given language.
 * Falls back to Korean description if English is missing.
 */
export function cardDesc(card: ChallengeCard, lang: Language): string {
  if (lang === "en" && card.descriptionEn) return card.descriptionEn;
  return card.description;
}

export type { DictKey };
