import type { Equipment, Hero, HeroBaseStats } from "@/types/uphero";
import { BAG_COLS, canRotate, checkPlacement, computeBagSynergy, inheritPlacement, normalizeBagLayout, normalizeRot, placeIntoBag, withPlacement, withoutPlacement, type BagPlacement } from "./upHeroBag";

export const BAG_STAT_KEYS = ["str", "int", "vit", "dex", "agi", "crit", "slotBonus"] as const;
export type BagStats = Partial<HeroBaseStats>;

export function statDifference(after: BagStats, before: BagStats): BagStats {
  const delta: BagStats = {};
  for (const key of BAG_STAT_KEYS) {
    const value = (after[key] ?? 0) - (before[key] ?? 0);
    if (value) delta[key] = value;
  }
  return delta;
}

/** Equipment and support only. Level growth cancels out in before/after comparisons. */
export function loadoutStats(equipped: Hero["equipped"], inventory: Equipment[], rows: number): BagStats {
  const total = { ...computeBagSynergy(equipped, inventory, rows).bonuses };
  for (const item of Object.values(equipped)) {
    if (!item) continue;
    for (const key of BAG_STAT_KEYS) total[key] = (total[key] ?? 0) + (item.stats[key] ?? 0);
  }
  return total;
}

/** Mirrors store swaps, including the old equipment inheriting the vacated footprint. */
export function equipmentChange(item: Equipment, worn: boolean, equipped: Hero["equipped"], inventory: Equipment[], rows: number) {
  const nextEquipped = { ...equipped };
  let nextInventory: Equipment[];
  if (worn) {
    delete nextEquipped[item.type];
    nextInventory = placeIntoBag(inventory, item, rows);
  } else {
    const old = equipped[item.type];
    nextEquipped[item.type] = withoutPlacement(item);
    nextInventory = old
      ? inventory.map(i => i.id === item.id ? inheritPlacement(item, old) : i)
      : inventory.filter(i => i.id !== item.id);
  }
  return { equipped: nextEquipped, inventory: nextInventory,
    delta: statDifference(loadoutStats(nextEquipped, nextInventory, rows), loadoutStats(equipped, inventory, rows)) };
}

export interface BagSuggestion { placement: BagPlacement; delta: BagStats }

/** Deterministic, non-dominated improvement with no stat regression. Never repacks other items. */
export function suggestBagPlacement(item: Equipment, equipped: Hero["equipped"], inventory: Equipment[], rows: number): BagSuggestion | null {
  if (!inventory.some(i => i.id === item.id)) return null;
  const layout = normalizeBagLayout(inventory, rows).layout;
  const before = computeBagSynergy(equipped, inventory, rows).bonuses;
  const rot = normalizeRot(item.bagRot);
  const rotations = canRotate(item.type) ? [rot, (rot + 1) % 4] : [rot];
  let best: BagSuggestion | null = null;
  for (const r of rotations) for (let y = 0; y < rows; y++) for (let x = 0; x < BAG_COLS; x++) {
    if (checkPlacement(layout.occupancy, rows, item.type, x, y, r, item.id) !== "ok") continue;
    const placement = { x, y, rot: r };
    const next = inventory.map(i => i.id === item.id ? withPlacement(i, placement) : i);
    const delta = statDifference(computeBagSynergy(equipped, next, rows).bonuses, before);
    const values = Object.values(delta);
    if (!values.length || values.some(v => v < 0)) continue;
    // Prefer a strictly better result without assigning arbitrary weights to different stats.
    if (!best || (BAG_STAT_KEYS.every(key => (delta[key] ?? 0) >= (best!.delta[key] ?? 0))
      && BAG_STAT_KEYS.some(key => (delta[key] ?? 0) > (best!.delta[key] ?? 0)))) {
      best = { placement, delta };
    }
  }
  return best;
}
