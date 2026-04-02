import type { Rarity, Category } from "./card";

export type TitleConditionType = "category" | "card" | "streak";

export type TitleCondition =
  | { type: "category"; category: Category; count: number }
  | { type: "card"; cardId: string; count: number }
  | { type: "streak"; days: number };

export interface TitleDefinition {
  id: string;
  name: string;
  nameEn?: string;
  description: string;
  descriptionEn?: string;
  rarity: Rarity;
  condition: TitleCondition;
  icon: string;
}
