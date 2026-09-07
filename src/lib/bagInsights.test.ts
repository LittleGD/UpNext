import { describe, expect, it } from 'vitest';
import { equipmentChange, loadoutStats, statDifference, suggestBagPlacement } from './bagInsights';
import { computeBagSynergy, normalizeBagLayout, withPlacement, applyBagSynergy, emptyOccupancy, BAG_CROSS_MARK } from './upHeroBag';
import { createDefaultHero, computeEffectiveStats, type Equipment } from '@/types/uphero';

const gear = (id: string, extra: Partial<Equipment> = {}): Equipment => ({ id, baseId: id, name: id, type: 'accessory', rarity: 'rare', category: 'fitness', iconName: 'Sword', stats: { str: 5 }, ...extra });
const weapon = gear('weapon', { type: 'weapon', stats: { str: 100 } });

describe('bag build previews', () => {
  it('counts carried gear only through synergy, never adds its full stats', () => {
    const support = gear('support', { bagX: 1, bagY: 0, bagRot: 0, stats: { str: 999 } });
    expect(loadoutStats({ weapon }, [support], 4)).toMatchObject({ str: 105, crit: 3 });
  });
  it('includes the loss of the old support connection when equipping', () => {
    const item = gear('support', { bagX: 1, bagY: 0, bagRot: 0, stats: { str: 2 } });
    const preview = equipmentChange(item, false, { weapon }, [item], 4);
    expect(preview.delta).toEqual({ str: -3, crit: -3 });
    expect(preview.inventory).toEqual([]);
    expect(preview.equipped.accessory).not.toHaveProperty('bagX');
  });
  it('returns replaced equipment to the same footprint, including its new synergy', () => {
    const old = gear('old', { stats: { str: 10 }, category: 'learning' });
    const item = gear('new', { bagX: 1, bagY: 0, bagRot: 0, stats: { str: 12 } });
    const preview = equipmentChange(item, false, { weapon, accessory: old }, [item], 4);
    expect(preview.inventory[0]).toMatchObject({ id: 'old', bagX: 1, bagY: 0, bagRot: 0 });
    expect(preview.delta.str).toBe(-3); // +2 equipment, -5 same-activity support
  });
  it('unequips into a full tray without losing the item', () => {
    const inventory = emptyOccupancy(4).flatMap((v, i) => v === BAG_CROSS_MARK ? [] : [gear(`fill${i}`, { bagX: i % 5, bagY: Math.floor(i / 5), bagRot: 0 })]);
    const preview = equipmentChange(weapon, true, { weapon }, inventory, 4);
    expect(preview.inventory).toHaveLength(inventory.length + 1);
    expect(preview.inventory.at(-1)?.id).toBe('weapon');
    expect(preview.inventory.at(-1)).not.toHaveProperty('bagX');
    expect(preview.equipped.weapon).toBeUndefined();
  });
  it('matches the actual pre-combat stat calculation', () => {
    const item = gear('support', { bagX: 1, bagY: 0, bagRot: 0 });
    const hero = { ...createDefaultHero(), equipped: { weapon } };
    const combat = computeEffectiveStats(applyBagSynergy(hero, [item], 4));
    expect(statDifference(combat, hero.baseStats)).toEqual(statDifference(loadoutStats(hero.equipped, [item], 4), {}));
  });
});

describe('synergy suggestions', () => {
  it('prefers a position that improves every stat at least as much as an earlier position', () => {
    const photo = gear('photo', { type: 'talisman', photoId: 'p', category: 'learning' });
    const equipped = { weapon, armor: gear('armor', { type: 'armor', stats: { vit: 50 } }) };
    const suggestion = suggestBagPlacement(photo, equipped, [photo], 4)!;
    expect(suggestion.delta).toEqual({ str: 1, vit: 1 });
  });

  it('finds a legal improvement without changing inputs or other positions', () => {
    const item = gear('support', { bagX: 4, bagY: 3, bagRot: 0 });
    const inv = [item];
    const before = JSON.stringify(inv);
    const suggestion = suggestBagPlacement(item, { weapon }, inv, 4)!;
    expect(suggestion.delta).toEqual({ str: 5, crit: 3 });
    const next = [withPlacement(item, suggestion.placement)];
    expect(normalizeBagLayout(next, 4).layout.placed).toHaveLength(1);
    expect(statDifference(computeBagSynergy({ weapon }, next, 4).bonuses, computeBagSynergy({ weapon }, inv, 4).bonuses)).toEqual(suggestion.delta);
    expect(JSON.stringify(inv)).toBe(before);
  });
  it('does not suggest sacrificing an existing stat for a bigger number', () => {
    const photo = gear('photo', { type: 'talisman', photoId: 'p', category: 'learning', bagX: 0, bagY: 1, bagRot: 0 });
    const equipped = { weapon, armor: gear('armor', { type: 'armor', stats: { vit: 50 } }) };
    const s = suggestBagPlacement(photo, equipped, [photo], 4);
    if (s) expect(Object.values(s.delta).every(v => v > 0)).toBe(true);
  });
  it('returns no suggestion for empty slots or an item outside inventory', () => {
    const item = gear('support');
    expect(suggestBagPlacement(item, {}, [item], 4)).toBeNull();
    expect(suggestBagPlacement(item, { weapon }, [], 4)).toBeNull();
  });
  it('does not mistake matching synthesis items for a combat benefit', () => {
    const a = gear('a', { baseId: 'same' }), b = gear('b', { baseId: 'same', bagX: 4, bagY: 3, bagRot: 0 });
    expect(suggestBagPlacement(a, {}, [a, b], 4)).toBeNull();
  });
  it('supports four through eight rows and rotations deterministically', () => {
    for (let rows = 4; rows <= 8; rows++) for (const type of ['weapon','armor','accessory','talisman'] as const) {
      const item = gear('i', { type });
      const inv = [item];
      const a = suggestBagPlacement(item, { weapon }, inv, rows);
      expect(suggestBagPlacement(item, { weapon }, inv, rows)).toEqual(a);
      if (a) {
        expect(normalizeBagLayout([withPlacement(item, a.placement)], rows).layout.placed).toHaveLength(1);
        expect(Object.values(a.delta).every(v => v > 0)).toBe(true);
      }
    }
  });
});
