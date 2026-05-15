// main.swift — Phase 2.4 "타입" 동치성 검증 (Swift 측)
//
// 실제 포팅 산출물(Card.swift + Game.swift + UpHero.swift)을 그대로 컴파일하여
// uphero-check.mjs 와 동일한 입력으로 동일한 출력 라인을 찍는다.

import Foundation

func f(_ x: Double) -> String { String(format: "%.10f", x) }

// 1. ngPlusScaleMult
let ngInputs: [Int?] = [nil, 0, 1, 2, 3, 5, -1]
for n in ngInputs {
    let label = n.map { String($0) } ?? "undefined"
    print("ngPlusScaleMult(\(label)) = \(f(UpHeroRules.ngPlusScaleMult(n)))")
}
// 2. ngPlusLegendBonus
for n in ngInputs {
    let label = n.map { String($0) } ?? "undefined"
    print("ngPlusLegendBonus(\(label)) = \(f(UpHeroRules.ngPlusLegendBonus(n)))")
}
// 3. getISOWeekId
let iso = ISO8601DateFormatter()
let dateStrings = [
    "2026-05-15T12:00:00Z",
    "2026-01-01T12:00:00Z",
    "2025-12-31T12:00:00Z",
    "2024-12-30T12:00:00Z",
    "2024-12-29T12:00:00Z",
    "2027-01-04T12:00:00Z",
    "2026-12-28T12:00:00Z",
    "2023-01-01T12:00:00Z",
]
for ds in dateStrings {
    let d = iso.date(from: ds)!
    print("getISOWeekId(\(ds)) = \(UpHeroRules.getISOWeekId(d))")
}
// 4. computeWeeklyScore
let wsInputs: [(Int, Int, Int)] = [(0, 0, 1), (15, 50, 10), (30, 100, 30), (45, 0, 50), (10, 200, 1)]
for (fl, t, lv) in wsInputs {
    print("computeWeeklyScore(\(fl),\(t),\(lv)) = \(UpHeroRules.computeWeeklyScore(floorsCleared: fl, remainingTime: t, heroLevel: lv))")
}
// 5. enhanceSuccessRate
for r in [Rarity.normal, .rare, .unique, .legend] {
    for lv in [0, 3, 9] {
        for st in [0, 5, 15] {
            let rate = UpHeroRules.enhanceSuccessRate(rarity: r, currentLevel: lv, failStreak: st)
            print("enhanceSuccessRate(\(r.rawValue),\(lv),\(st)) = \(f(rate))")
        }
    }
}
// 6. enhanceCost
for r in [Rarity.normal, .rare, .unique, .legend] {
    for lv in [0, 3, 9] {
        print("enhanceCost(\(r.rawValue),\(lv)) = \(UpHeroRules.enhanceCost(rarity: r, currentLevel: lv))")
    }
}
// 7. getHeroAppearanceVariant
for lv in [1, 9, 10, 29, 30, 50] {
    print("getHeroAppearanceVariant(\(lv)) = \(UpHeroRules.getHeroAppearanceVariant(level: lv))")
}
// 8. getEffectiveHeroLevel
let ghlInputs: [(Int, Int?)] = [(1, nil), (41, 41), (42, 41), (50, 1), (5, 10)]
for (g, h) in ghlInputs {
    let hl = h.map { String($0) } ?? "undefined"
    print("getEffectiveHeroLevel(\(g),\(hl)) = \(UpHeroRules.getEffectiveHeroLevel(gameLevel: g, heroStartLevel: h))")
}

// ── Hero / Equipment 테스트 픽스처 ──────────────────────────────
func mkHero(equipped: [EquipSlot: Equipment] = [:], classType: ClassType? = nil, hp: Int = 100) -> Hero {
    Hero(name: "Test", hp: hp, maxHp: 100,
         baseStats: HeroBaseStats(str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0),
         equipped: equipped, classType: classType, appearanceVariant: 0,
         autoSkillEnabled: nil, learnedSkills: nil, skillPoints: nil)
}
func mkEquip(_ type: EquipSlot, _ stats: [StatKey: Int]) -> Equipment {
    Equipment(id: type.rawValue, name: type.rawValue, baseId: nil, type: type,
              rarity: .normal, category: .fitness, iconName: "x", stats: stats,
              effects: nil, flavor: nil, photoId: nil, enhanceLevel: nil,
              enhanceFailStreak: nil, affix: nil, affixes: nil, talismanSkills: nil)
}

// 9. computeEffectiveStats
let h9 = mkHero(equipped: [
    .weapon: mkEquip(.weapon, [.str: 5, .crit: 3]),
    .armor: mkEquip(.armor, [.vit: 8]),
])
let s9 = UpHeroRules.computeEffectiveStats(h9)
print("computeEffectiveStats = \(s9.str),\(s9.int),\(s9.vit),\(s9.dex),\(s9.agi),\(s9.crit),\(s9.slotBonus)")

// 10. computeHeroForLevel
func fmtHero(_ r: Hero) -> String {
    let b = r.baseStats
    return "\(r.hp),\(r.maxHp),\(b.str),\(b.int),\(b.vit),\(b.dex),\(b.agi),\(b.crit),\(b.slotBonus)"
}
for lv in [1, 10, 30, 50] {
    print("computeHeroForLevel(default,\(lv)) = \(fmtHero(UpHeroRules.computeHeroForLevel(mkHero(), level: lv)))")
}
print("computeHeroForLevel(injured,10) = \(fmtHero(UpHeroRules.computeHeroForLevel(mkHero(hp: 50), level: 10)))")
for cls in [ClassType.warrior, .mage, .monk, .druid, .bard, .chronomancer, .priest, .illusionist] {
    print("computeHeroForLevel(\(cls.rawValue),42) = \(fmtHero(UpHeroRules.computeHeroForLevel(mkHero(classType: cls), level: 42)))")
}
// 11. computeStatMax — 8개 클래스 전부 (classStatGrowth 테이블 완전 검증)
let smInputs: [(Int, ClassType?)] = [
    (1, nil), (42, .warrior), (42, .mage), (42, .monk), (42, .druid),
    (42, .bard), (42, .chronomancer), (42, .priest), (42, .illusionist), (30, .monk), (50, nil),
]
for (lv, cls) in smInputs {
    let m = UpHeroRules.computeStatMax(level: lv, classType: cls)
    let clsLabel = cls.map { $0.rawValue } ?? "null"
    print("computeStatMax(\(lv),\(clsLabel)) = \(m[.str]!),\(m[.int]!),\(m[.vit]!),\(m[.dex]!),\(m[.agi]!),\(m[.crit]!)")
}
// 12. getBuffSlotCount
let cases12: [(Hero, Int)] = [
    (mkHero(), 1),
    (mkHero(), 5),
    (mkHero(equipped: [.accessory: mkEquip(.accessory, [.slotBonus: 1])]), 5),
    (mkHero(equipped: [
        .accessory: mkEquip(.accessory, [.slotBonus: 1]),
        .talisman: mkEquip(.talisman, [.slotBonus: 1]),
    ]), 5),
    (mkHero(equipped: [
        .accessory: mkEquip(.accessory, [.slotBonus: 2]),
        .talisman: mkEquip(.talisman, [.slotBonus: 2]),
    ]), 5),
]
for (i, pair) in cases12.enumerated() {
    print("getBuffSlotCount(case\(i),\(pair.1)) = \(UpHeroRules.getBuffSlotCount(hero: pair.0, level: pair.1))")
}
