// datalayer.swift — Phase 2.4 데이터 레이어 동치성 검증 (Swift 측).
// 컴파일: Card+Game+UpHero+UpHeroRNG+UpHeroCombat+Dungeons+MonsterPool+EquipmentPool+BossSprites
//         (Phase 6-E: 7 sellPrice / 8 synthesizeEquipment / 9 equipmentBaseName / 10 bossSprites)
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

// ── 6. createMonsterForFloor (시드, 템플릿 선택 + 보스 사이클 인덱스) ──
// Phase 16 (Track C) — 웹 createMonsterForFloor 가 rng() 를 쓰므로 시드별 템플릿
// 선택을 대조한다 (호출 순서: newbie roll → power 티어 roll → 티어 내 인덱스 roll).
for dg in [DungeonId.fitness, .learning] {
    for floor in [3, 8, 15, 25, 45] {
        for seed in 1...3 {
            var rng = Mulberry32(seed: seed)
            let m = MonsterPool.createMonsterForFloor(dungeonId: dg, floor: floor, isBoss: false, rng: &rng)
            lines.append("createMonster:\(dg.rawValue):f\(floor):s\(seed) = \(m.templateId ?? "-") hp\(m.hp) atk\(m.atk) def\(m.def)")
        }
    }
    for floor in [10, 20, 30, 40, 50, 60] {
        var rng = Mulberry32(seed: 1)  // 보스 생성은 rng 를 소비하지 않는다.
        let b = MonsterPool.createMonsterForFloor(dungeonId: dg, floor: floor, isBoss: true, rng: &rng)
        lines.append("createBoss:\(dg.rawValue):f\(floor) = \(b.templateId ?? "-") hp\(b.hp) atk\(b.atk) def\(b.def) xp\(b.xpReward) coin\(b.coinReward)")
    }
}

// ── 7. sellPrice (Phase 6-E, Track E — 정수 표 산술) ────────────
let sellCfgs: [(Rarity, Int, Int)] = [
    (.normal, 0, 0), (.normal, 30, 0), (.rare, 12, 3),
    (.unique, 20, 10), (.legend, 30, 10), (.legend, 120, 25),
]
for (rarity, floor, level) in sellCfgs {
    let p = UpHeroRules.sellPrice(rarity: rarity, dropFloor: floor, enhanceLevel: level)
    lines.append("sellPrice:\(rarity.rawValue):f\(floor):l\(level) = \(p)")
}

// ── 8. synthesizeEquipment (시드, id 제외) ─────────────────────
//   rng 호출 순서: 풀 인덱스 1회 → createEquipmentFromTemplate 내부.
func synthSources(_ rarity: Rarity) -> [Equipment] {
    func mk(_ id: String, _ category: DungeonId, _ dropFloor: Int) -> Equipment {
        Equipment(id: id, name: "x", baseId: nil, type: .weapon, rarity: rarity, category: category,
                  iconName: "Sword", stats: [.str: 5], effects: nil, flavor: nil, photoId: nil,
                  enhanceLevel: nil, enhanceFailStreak: nil, affix: nil, affixes: nil,
                  talismanSkills: nil, dropFloor: dropFloor)
    }
    return [mk("a", .fitness, 12), mk("b", .learning, 20), mk("c", .learning, 15)]
}
for rarity in [Rarity.normal, .rare, .unique] {
    for seed in 1...4 {
        var rng = Mulberry32(seed: seed)
        let out = EquipmentPool.synthesizeEquipment(synthSources(rarity), rng: &rng)!
        lines.append("synth:\(rarity.rawValue):s\(seed) = \(out.baseId ?? "-")|\(out.rarity.rawValue)|f\(out.dropFloor.map(String.init) ?? "undefined")|\(fmtEq(out))")
    }
}
do {
    var rng = Mulberry32(seed: 1)
    lines.append("synth:legend:s1 = \(EquipmentPool.synthesizeEquipment(synthSources(.legend), rng: &rng) == nil ? "null" : "?")")
}

// ── 9. equipmentBaseName ───────────────────────────────────────
let nameCfgs: [(String?, String, Rarity)] = [
    ("self_control_sword", "신성한 자기절제의 검 of 민첩, 힘 +7", .legend),
    (nil, "신성한 자기절제의 검 of 민첩, 힘 +7", .legend),
    (nil, "빛나는 곡물의 갑옷 of 힘", .rare),
    (nil, "꾸준함의 방패 +3", .normal),
    (nil, "메모의 펜", .normal),
    ("nope", "빛나는 지혜의 안경 of 힘", .rare),
]
for (i, cfg) in nameCfgs.enumerated() {
    lines.append("baseName:\(i) = \(EquipmentPool.equipmentBaseName(name: cfg.1, rarity: cfg.2, baseId: cfg.0))")
}

// ── 10. bossSprites (24 × 2 프레임 12×12) ──────────────────────
for id in BossSprites.frames.keys.sorted() {
    let f = BossSprites.frames[id]!
    lines.append("boss:\(id) = \(f[0].joined(separator: "|"))/\(f[1].joined(separator: "|"))")
}

print(lines.joined(separator: "\n"))
