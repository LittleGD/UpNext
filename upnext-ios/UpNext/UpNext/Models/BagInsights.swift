import Foundation

enum BagInsights {
    struct Change {
        let equipped: [EquipSlot: Equipment]
        let inventory: [Equipment]
        let delta: [StatKey: Int]
    }
    struct Suggestion {
        let placement: BagPlacement
        let delta: [StatKey: Int]
    }

    static func difference(_ after: [StatKey: Int], _ before: [StatKey: Int]) -> [StatKey: Int] {
        var delta: [StatKey: Int] = [:]
        for key in StatKey.allCases {
            let value = (after[key] ?? 0) - (before[key] ?? 0)
            if value != 0 { delta[key] = value }
        }
        return delta
    }

    static func loadoutStats(_ equipped: [EquipSlot: Equipment], _ inventory: [Equipment], _ rows: Int) -> [StatKey: Int] {
        var total = UpHeroBag.computeBagSynergy(equipped: equipped, inventory: inventory, rows: rows).bonuses
        for slot in UpHeroBag.anchorOrder {
            guard let item = equipped[slot] else { continue }
            for key in StatKey.allCases { total[key, default: 0] += item.stats[key] ?? 0 }
        }
        return total
    }

    static func equipmentChange(_ item: Equipment, worn: Bool, equipped: [EquipSlot: Equipment], inventory: [Equipment], rows: Int) -> Change {
        var nextEquipped = equipped
        let nextInventory: [Equipment]
        if worn {
            nextEquipped.removeValue(forKey: item.type)
            nextInventory = UpHeroBag.placeIntoBag(inventory, item, rows: rows)
        } else {
            let old = equipped[item.type]
            nextEquipped[item.type] = UpHeroBag.withoutPlacement(item)
            if let old {
                nextInventory = inventory.map { $0.id == item.id ? UpHeroBag.inheritPlacement(from: item, to: old) : $0 }
            } else {
                nextInventory = inventory.filter { $0.id != item.id }
            }
        }
        return Change(equipped: nextEquipped, inventory: nextInventory,
                      delta: difference(loadoutStats(nextEquipped, nextInventory, rows), loadoutStats(equipped, inventory, rows)))
    }

    // Deterministic improvement without reducing any stat or moving another item.
    static func suggest(_ item: Equipment, equipped: [EquipSlot: Equipment], inventory: [Equipment], rows: Int) -> Suggestion? {
        guard inventory.contains(where: { $0.id == item.id }) else { return nil }
        let layout = UpHeroBag.normalizeBagLayout(inventory, rows: rows).layout
        let before = UpHeroBag.computeBagSynergy(equipped: equipped, inventory: inventory, rows: rows).bonuses
        let rot = UpHeroBag.normalizeRot(item.bagRot)
        let rotations = UpHeroBag.canRotate(type: item.type) ? [rot, (rot + 1) % 4] : [rot]
        var best: Suggestion?
        for r in rotations {
            for y in 0..<rows {
                for x in 0..<UpHeroBag.cols {
                    guard UpHeroBag.checkPlacement(occ: layout.occupancy, rows: rows, type: item.type, x: x, y: y, rot: r, ignoreId: item.id) == .ok else { continue }
                    let p = BagPlacement(x: x, y: y, rot: r)
                    let next = inventory.map { $0.id == item.id ? UpHeroBag.withPlacement($0, p) : $0 }
                    let delta = difference(UpHeroBag.computeBagSynergy(equipped: equipped, inventory: next, rows: rows).bonuses, before)
                    guard !delta.isEmpty, delta.values.allSatisfy({ $0 > 0 }) else { continue }
                    if let current = best {
                        guard StatKey.allCases.allSatisfy({ (delta[$0] ?? 0) >= (current.delta[$0] ?? 0) }),
                              StatKey.allCases.contains(where: { (delta[$0] ?? 0) > (current.delta[$0] ?? 0) }) else { continue }
                    }
                    best = Suggestion(placement: p, delta: delta)
                }
            }
        }
        return best
    }
}
