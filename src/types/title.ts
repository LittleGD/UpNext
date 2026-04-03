import type { Rarity, Category } from "./card";

export type TitleConditionType = "category" | "card" | "streak" | "extra";

export type TitleCondition =
  | { type: "category"; category: Category; count: number }
  | { type: "card"; cardId: string; count: number }
  | { type: "streak"; days: number }
  | { type: "extra"; phase: "extra" | "super"; count: number };

export interface TitleDefinition {
  id: string;
  name: string;
  nameEn?: string;
  description: string;
  descriptionEn?: string;
  nameJa?: string;
  descriptionJa?: string;
  nameZh?: string;
  descriptionZh?: string;
  rarity: Rarity;
  condition: TitleCondition;
  icon: string;
}
