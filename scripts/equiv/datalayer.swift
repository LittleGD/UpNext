// datalayer.swift — Phase 2.4 데이터 레이어 동치성 검증 (Swift 측).
// 컴파일: Card+Game+UpHero+UpHeroRNG+UpHeroCombat+Dungeons+MonsterPool+EquipmentPool
//         ↔  scripts/datalayer-check.mjs

import Foundation

var lines: [String] = []

// ── 1. 던전 데이터 ─────────────────────────────────────────────
for d in Dungeons.list {
    lines.append("dungeon:\(d.id.rawValue) = \(d.name)|\(d.themeColor)|\(d.affinity.rawValue)|\(d.bossIds.joined(separator: ","))")
}

// ── 2. scaleMonster (결정론) ───────────────────────────────────
func monT(_ id: String) -> MonsterTemplate { MonsterPool.allTemplates.first { $0.id == id }! }
let scaleCfgs: [(String, DungeonId)] = [
    ("fit_wolf", .fitness), ("fit_bear", .fitness), ("fit_goblin", .fitness),
    ("boss_mountain_wolf", .fitness), ("lrn_riddle", .learning),
]
let optCfgs: [(String, ScaleOptions)] = [
    ("d", ScaleOptions()),
    ("ng2", ScaleOptions(ngPlusLevel: 2)),
    ("m", ScaleOptions(hpMult: 1.2, atkMult: 0.8)),
]
for (tid, dg) in scaleCfgs {
    let t = monT(tid)
    for floor in [3, 10, 11, 30] {
        for (on, opts) in optCfgs {
            let m = MonsterPool.scaleMonster(t, dungeonId: dg, floor: floor, opts: opts)
            lines.append("scaleMonster:\(tid):f\(floor):\(on) = hp\(m.hp) atk\(m.atk) def\(m.def) xp\(m.xpReward) coin\(m.coinReward)")
        }
    }
}

// ── 3. rollDropRarity (시드) ───────────────────────────────────
for floor in [5, 15, 25, 35] {
    let bonusCfgs: [(String, Double, Bool)] = [("b0", 0, false), ("b02", 0.02, false), ("flat", 0.05, true)]
    for (bn, bonus, flat) in bonusCfgs {
        for seed in 1...6 {
            var rng = Mulberry32(seed: seed)
            let r = EquipmentPool.rollDropRarity(floor: floor, legendDropBonus: bonus, flatten: flat, rng: &rng)
            lines.append("rollDropRarity:f\(floor):\(bn):s\(seed) = \(r.rawValue)")
        }
    }
}

// ── 4. createEquipmentFromTemplate (시드, id 제외) ─────────────
func eqT(_ baseId: String) -> EquipmentTemplate { EquipmentPool.templates.first { $0.baseId == baseId }! }
func fmtEq(_ eq: Equipment) -> String {
    let stats = eq.stats.keys.sorted { $0.rawValue < $1.rawValue }
        .map { "\($0.rawValue):\(eq.stats[$0]!)" }.joined(separator: ",")
    let affixes = (eq.affixes ?? []).map { $0.rawValue }.joined(separator: "+")
    return "\(eq.name)|\(stats)|affix:\(eq.affix?.rawValue ?? "-")|affixes:\(affixes.isEmpty ? "-" : affixes)"
}
for baseId in ["self_control_sword", "wisdom_glasses", "serenity_charm"] {
    let t = eqT(baseId)
    for rarity in [Rarity.normal, .rare, .unique, .legend] {
        for seed in 1...3 {
            var rng = Mulberry32(seed: seed)
            let eq = EquipmentPool.createEquipmentFromTemplate(t, rarity: rarity, dungeonFloor: 20, rng: &rng)
            lines.append("createEquip:\(baseId):\(rarity.rawValue):s\(seed) = \(fmtEq(eq))")
        }
    }
}

// ── 5. rollEquipmentDrop (시드, id 제외) ───────────────────────
for dg in [DungeonId.fitness, .learning] {
    for rarity in [Rarity.rare, .legend] {
        for seed in 1...4 {
            var rng = Mulberry32(seed: seed)
            let eq = EquipmentPool.rollEquipmentDrop(dungeonId: dg, floor: 15, rarity: rarity, affinitySlot: .weapon, rng: &rng)
            lines.append("rollEquipDrop:\(dg.rawValue):\(rarity.rawValue):s\(seed) = \(fmtEq(eq))")
        }
    }
}

print(lines.joined(separator: "\n"))
