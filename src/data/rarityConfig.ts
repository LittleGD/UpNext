import type { Rarity } from "@/types/card";

export interface RarityConfig {
  weight: number;
  color: string;
  bgClass: string;
  label: string;
  labelKo: string;
  labelZh: string;
}

export const RARITY_CONFIG: Record<Rarity, RarityConfig> = {
  normal: {
    weight: 60,
    color: "#808080",
    bgClass: "bg-bg-surface",
    label: "Normal",
    labelKo: "일반",
    labelZh: "普通",
  },
  rare: {
    weight: 25,
    color: "#9BF0E1",
    bgClass: "bg-bg-surface",
    label: "Rare",
    labelKo: "레어",
    labelZh: "稀有",
  },
  unique: {
    weight: 12,
    color: "#F037A5",
    bgClass: "bg-bg-surface",
    label: "Unique",
    labelKo: "유니크",
    labelZh: "史诗",
  },
  legend: {
    weight: 3,
    color: "#CDF564",
    bgClass: "bg-bg-surface",
    label: "Legend",
    labelKo: "레전드",
    labelZh: "传说",
  },
};
