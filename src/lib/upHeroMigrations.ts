/**
 * Phase 6-E (Track E) — 장비/도감 수리 (스키마 v7).
 *
 * 순수·멱등 헬퍼. `useUpHeroStore.initialize` 가 `savedVersion < 7` 일 때 한 번,
 * `_setFromCloud` 가 게이트 없이 매번(구 클라이언트가 옛 문서를 올릴 수 있다),
 * iOS `EquipmentRepair` 가 매 로드마다 같은 규칙으로 돌린다.
 *
 * 수리 항목:
 *  - iconName: 템플릿(baseId → legacy id 파싱) 의 새 pixelarticons 이름으로, 템플릿이
 *    없으면 `ICON_LEGACY_REMAP` 폴백. 옛 이름 10개는 pixelarticons 2.x 에 없어 아이콘이
 *    아예 안 그려졌다 (피드백 9).
 *  - baseId 시드 (레거시 저장본은 없었다).
 *  - dropFloor 역추정: 주스탯에서 강화 성장분(`enhancePrimaryGrowthTotal`) 을 빼고
 *    드롭 공식 `round((5 + floor × 0.5) × rarityMult)` 를 뒤집는다. 오차는 최대 1층.
 *  - 부적(talisman) slotBonus = max(1, 기존) (피드백 21).
 *  - 도감 equipment 키: 접두/강화/affix 가 붙은 이름과 legacy 인스턴스 id 를 템플릿
 *    baseName 으로 (피드백 18).
 */

import type { Equipment, EquipSlot, Hero } from "@/types/uphero";
import { enhancePrimaryGrowthTotal, stripEnhanceSuffix } from "@/types/uphero";
import {
  ALL_EQUIPMENT_TEMPLATES,
  ICON_LEGACY_REMAP,
  RARITY_PREFIX,
  findTemplateByBaseId,
  findTemplateByLegacyId,
  type EquipmentTemplate,
} from "@/data/upHeroEquipment";

/** dropFloor 역추정 상한 — 그 위는 정보가 없는 손상본으로 본다. */
export const DROP_FLOOR_ESTIMATE_MAX = 60;

/**
 * 주스탯에서 드롭 층을 역산한다. 주스탯이 없으면 undefined.
 *   est = clamp(round(((stats[primary] - growth(enhanceLevel)) / rarityMult - 5) × 2), 0, 60)
 */
export function estimateDropFloor(
  eq: Pick<Equipment, "stats" | "rarity" | "enhanceLevel">,
  template: EquipmentTemplate,
): number | undefined {
  const primary = eq.stats[template.statBoost];
  if (typeof primary !== "number" || !Number.isFinite(primary)) return undefined;
  const mult = template.rarityMult[eq.rarity] ?? 1;
  const base = primary - enhancePrimaryGrowthTotal(eq.enhanceLevel ?? 0);
  const est = Math.round((base / mult - 5) * 2);
  return Math.min(DROP_FLOOR_ESTIMATE_MAX, Math.max(0, est));
}

/** 장비 한 개 수리. 항상 새 객체를 돌려준다 (입력은 건드리지 않는다). */
export function repairEquipmentItem(eq: Equipment): Equipment {
  const next: Equipment = { ...eq, stats: { ...(eq.stats ?? {}) } };
  if (next.photoId) {
    // 사진 부적: 템플릿이 없다. 부적 규칙(slotBonus)만 맞춘다.
    if (next.type === "talisman") {
      next.stats.slotBonus = Math.max(1, next.stats.slotBonus ?? 0);
    }
    return next;
  }
  const template =
    (next.baseId ? findTemplateByBaseId(next.baseId) : null) ??
    findTemplateByLegacyId(next.id);
  if (template) {
    if (!next.baseId) next.baseId = template.baseId;
    next.iconName = template.iconName;
    if (next.dropFloor === undefined) {
      const est = estimateDropFloor(next, template);
      if (est !== undefined) next.dropFloor = est;
    }
  } else {
    next.iconName = ICON_LEGACY_REMAP[next.iconName] ?? next.iconName;
  }
  if (next.type === "talisman") {
    next.stats.slotBonus = Math.max(1, next.stats.slotBonus ?? 0);
  }
  return next;
}

/** 배열 수리. 배열이 아니면 []. */
export function repairEquipmentList(list: unknown): Equipment[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((e): e is Equipment => !!e && typeof e === "object")
    .map((e) => repairEquipmentItem(e));
}

/** hero.equipped 수리 — 있는 슬롯만. */
export function repairEquippedMap(equipped: Hero["equipped"] | undefined): Hero["equipped"] {
  const out: Hero["equipped"] = {};
  if (!equipped) return out;
  for (const slot of Object.keys(equipped) as EquipSlot[]) {
    const eq = equipped[slot];
    if (eq) out[slot] = repairEquipmentItem(eq);
  }
  return out;
}

const TEMPLATE_BASE_NAMES = new Set(ALL_EQUIPMENT_TEMPLATES.map((t) => t.baseName));
/** 접두 목록 (빈 문자열 제외). 긴 것 먼저 — 접두끼리 겹칠 일은 없지만 안전하게. */
const PREFIXES = Object.values(RARITY_PREFIX)
  .filter((p) => p.length > 0)
  .sort((a, b) => b.length - a.length);

/**
 * 도감 equipment 항목 하나를 템플릿 baseName 으로 정규화. 템플릿과 맞지 않으면 null.
 *  - legacy `eq_...` 인스턴스 id → findTemplateByLegacyId
 *  - 그 외: 등급 접두 → " +N" → " of ..." 순으로 벗긴다.
 */
export function normalizeCodexEquipmentKey(entry: unknown): string | null {
  if (typeof entry !== "string") return null;
  if (entry.startsWith("eq_")) {
    return findTemplateByLegacyId(entry)?.baseName ?? null;
  }
  let name = entry;
  for (const p of PREFIXES) {
    if (name.startsWith(p)) {
      name = name.slice(p.length);
      break;
    }
  }
  name = stripEnhanceSuffix(name);
  const ofIdx = name.indexOf(" of ");
  if (ofIdx >= 0) name = name.slice(0, ofIdx);
  name = name.trim();
  return TEMPLATE_BASE_NAMES.has(name) ? name : null;
}

/** 도감 equipment 배열 수리 — 정규화 + 순서 보존 dedupe. 배열이 아니면 []. */
export function repairCodexEquipment(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = normalizeCodexEquipmentKey(entry);
    if (key === null || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}
