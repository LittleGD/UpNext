/**
 * Phase 6-E (Track E, 피드백 11) — 장비 슬롯 분류의 단일 출처.
 *
 * 페이퍼돌 순서 / 슬롯 필터 칩 / 스탯 패널 행 / 카드 슬롯 칩이 전부 여기를 읽는다.
 * 글리프는 배경 박스 없이 맨 아이콘으로만 그린다 (아이콘 박스 금지 규칙).
 * iOS `EquipSlot.glyph` / `EquipSlot.labelKey` 미러.
 */

import type { EquipSlot } from "@/types/uphero";
import type { DictKey } from "@/i18n";

/** 페이퍼돌·필터·스탯 패널의 슬롯 순서. */
export const SLOT_ORDER: readonly EquipSlot[] = [
  "weapon",
  "armor",
  "accessory",
  "talisman",
] as const;

/** 슬롯 글리프 (pixelarticons 이름). 빈 페이퍼돌 슬롯과 스탯 패널 행 라벨에 쓴다. */
export const SLOT_GLYPH: Record<EquipSlot, string> = {
  weapon: "Sword",
  armor: "Shield",
  accessory: "DiamondGem",
  talisman: "Sparkles",
};

/** 슬롯 라벨 i18n 키. 렌더 시점에 t() 로 변환한다. */
export const SLOT_LABEL_KEY: Record<EquipSlot, DictKey> = {
  weapon: "uphero.slot.weapon",
  armor: "uphero.slot.armor",
  accessory: "uphero.slot.accessory",
  talisman: "uphero.slot.talisman",
};
