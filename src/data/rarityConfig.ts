import type { Rarity } from "@/types/card";
import type { Language } from "@/types/game";

export interface RarityConfig {
  weight: number;
  color: string;
  bgClass: string;
  label: string;
  labelKo: string;
  labelJa: string;
  labelZh: string;
}

export const RARITY_CONFIG: Record<Rarity, RarityConfig> = {
  normal: {
    weight: 60,
    color: "#808080",
    bgClass: "bg-bg-surface",
    label: "Normal",
    labelKo: "일반",
    labelJa: "ノーマル",
    labelZh: "普通",
  },
  rare: {
    weight: 25,
    color: "#9BF0E1",
    bgClass: "bg-bg-surface",
    label: "Rare",
    labelKo: "레어",
    labelJa: "レア",
    labelZh: "稀有",
  },
  unique: {
    weight: 12,
    color: "#F037A5",
    bgClass: "bg-bg-surface",
    label: "Unique",
    labelKo: "유니크",
    labelJa: "ユニーク",
    labelZh: "独特",
  },
  legend: {
    weight: 3,
    color: "#CDF564",
    bgClass: "bg-bg-surface",
    label: "Legend",
    labelKo: "레전드",
    labelJa: "レジェンド",
    labelZh: "传说",
  },
};

export function rarityLabel(rarity: Rarity, lang: Language): string {
  const config = RARITY_CONFIG[rarity];
  const map: Record<Language, string> = { en: config.label, ko: config.labelKo, ja: config.labelJa, zh: config.labelZh };
  return map[lang] ?? config.label;
}
