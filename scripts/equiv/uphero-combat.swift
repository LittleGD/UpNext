// main.swift — Phase 2.4 "전투" 동치성 검증 (Swift 측)
//
// 실제 포팅 산출물(Card/Game/UpHero/UpHeroRNG/UpHeroCombat.swift)을 컴파일하여
// uphero-combat-check.mjs 와 동일한 입력 + seed 로 동일한 출력 라인을 찍는다.

import Foundation

func f(_ x: Double) -> String { String(format: "%.10f", x) }
func opt(_ v: Int?) -> String { v.map(String.init) ?? "-" }

func mkStats(str: Int = 10, int: Int = 10, vit: Int = 10, dex: Int = 10,
             agi: Int = 10, crit: Int = 0, slotBonus: Int = 0) -> HeroBaseStats {
    HeroBaseStats(str: str, int: int, vit: vit, dex: dex, agi: agi, crit: crit, slotBonus: slotBonus)
}
func mkMonster(level: Int = 10, hp: Int = 100, maxHp: Int? = nil, atk: Int = 30,
               def: Int = 10, isBoss: Bool? = nil, trait: MonsterTrait? = nil) -> Monster {
    Monster(id: "m", name: "M", templateId: nil, kind: .beast, level: level, hp: hp,
            maxHp: maxHp, atk: atk, def: def, xpReward: 10, coinReward: 5,
            isBoss: isBoss, dungeonId: .fitness, trait: trait)
}
func mkHero(classType: ClassType? = nil) -> Hero {
    Hero(name: "H", hp: 100, maxHp: 100,
         baseStats: HeroBaseStats(str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0),
         equipped: [:], classType: classType, appearanceVariant: 0,
         autoSkillEnabled: nil, learnedSkills: nil, skillPoints: nil)
}
func eq(_ id: String) -> Equipment {
    Equipment(id: id, name: id, baseId: nil, type: .weapon, rarity: .normal,
              category: .fitness, iconName: "x", stats: [:], effects: nil, flavor: nil,
              photoId: nil, enhanceLevel: nil, enhanceFailStreak: nil, affix: nil,
              affixes: nil, talismanSkills: nil)
}
func fmtHero(_ h: Hero) -> String {
    let b = h.baseStats
    return "\(b.str),\(b.int),\(b.vit),\(b.dex),\(b.agi),\(b.crit),\(b.slotBonus),hp\(h.hp),max\(h.maxHp)"
}
let classes: [ClassType] = [.warrior, .mage, .monk, .druid, .bard, .chronomancer, .priest, .illusionist]

// ── 1. isNewbieBuffActive ──────────────────────────────────────
for (hl, fl) in [(1, 5), (4, 10), (4, 11), (5, 5), (5, 10), (10, 3)] {
    print("isNewbieBuffActive(\(hl),\(fl)) = \(UpHeroCombat.isNewbieBuffActive(heroLevel: hl, floorLevel: fl))")
}
// ── 2. shouldNarrate ───────────────────────────────────────────
for o in [CombatOutcome.hit, .crit, .dodge, .miss] {
    print("shouldNarrate(\(o.rawValue)) = \(f(UpHeroCombat.shouldNarrate(o)))")
}
// ── 3. 클래스 배율 ──────────────────────────────────────────────
for c in [ClassType?.none] + classes.map({ Optional($0) }) {
    let label = c.map { $0.rawValue } ?? "null"
    let xp = f(UpHeroCombat.classXpMult(c))
    let co = f(UpHeroCombat.classCoinMult(c))
    let he = f(UpHeroCombat.classHealMult(c))
    let ti = f(UpHeroCombat.classTimeMult(c))
    let dg = f(UpHeroCombat.classDodgeBonus(c))
    let rg = UpHeroCombat.classHpRegen(c)
    print("classMults(\(label)) = \(xp),\(co),\(he),\(ti),\(dg),\(rg)")
}
// ── 4. computeHeroDamage (RNG) ─────────────────────────────────
let hdConfigs: [(String, HeroBaseStats, Monster, Bool)] = [
    ("str20_def10_n", mkStats(str: 20), mkMonster(def: 10), false),
    ("str20_def10_c", mkStats(str: 20), mkMonster(def: 10), true),
    ("str50_def51_n", mkStats(str: 50), mkMonster(def: 51), false),
    ("str5_def0_n", mkStats(str: 5), mkMonster(def: 0), false),
]
for (name, stats, monster, crit) in hdConfigs {
    for seed in 1...8 {
        var rng = Mulberry32(seed: seed)
        let r = UpHeroCombat.computeHeroDamage(stats: stats, monster: monster, crit: crit, rng: &rng)
        print("computeHeroDamage(\(name),seed\(seed)) = \(r)")
    }
}
// ── 5. computeEnemyDamage (RNG) ────────────────────────────────
let edConfigs: [(String, Monster, HeroBaseStats, Bool)] = [
    ("atk30_vit20_n", mkMonster(atk: 30), mkStats(vit: 20), false),
    ("atk30_vit20_c", mkMonster(atk: 30), mkStats(vit: 20), true),
    ("boss_atk1000_vit39_c", mkMonster(atk: 1000, isBoss: true), mkStats(vit: 39), true),
    ("atk5_vit0_n", mkMonster(atk: 5), mkStats(vit: 0), false),
]
for (name, monster, stats, crit) in edConfigs {
    for seed in 1...8 {
        var rng = Mulberry32(seed: seed)
        let r = UpHeroCombat.computeEnemyDamage(monster: monster, stats: stats, crit: crit, rng: &rng)
        print("computeEnemyDamage(\(name),seed\(seed)) = \(r)")
    }
}
// ── 6. rollHeroOutcome (RNG) ───────────────────────────────────
let rhConfigs: [(String, HeroBaseStats, Monster, Int)] = [
    ("normal", mkStats(dex: 20, crit: 10), mkMonster(level: 15), 99),
    ("newbie", mkStats(dex: 20, crit: 10), mkMonster(level: 5), 2),
    ("swift", mkStats(dex: 20, crit: 10), mkMonster(level: 15, trait: .swift), 99),
]
for (name, stats, monster, hl) in rhConfigs {
    for seed in 1...12 {
        var rng = Mulberry32(seed: seed)
        let r = UpHeroCombat.rollHeroOutcome(stats: stats, monster: monster, heroLevel: hl, rng: &rng)
        print("rollHeroOutcome(\(name),seed\(seed)) = \(r.rawValue)")
    }
}
// ── 7. rollEnemyOutcome (RNG) ──────────────────────────────────
let reConfigs: [(String, Monster, HeroBaseStats, Double, Double, Double, Int)] = [
    ("normal", mkMonster(level: 15), mkStats(agi: 30), 0, 0, 0, 99),
    ("newbie", mkMonster(level: 5), mkStats(agi: 30), 0, 0, 0, 2),
    ("burst_bonuses", mkMonster(level: 15, trait: .burst), mkStats(agi: 30), 0.1, 0.05, 0.15, 99),
]
for (name, monster, stats, db, emb, mcb, hl) in reConfigs {
    for seed in 1...12 {
        var rng = Mulberry32(seed: seed)
        let r = UpHeroCombat.rollEnemyOutcome(
            monster: monster, stats: stats, dodgeBonus: db, enemyMissBonus: emb,
            monsterCritBonus: mcb, heroLevel: hl, rng: &rng)
        print("rollEnemyOutcome(\(name),seed\(seed)) = \(r.rawValue)")
    }
}
// ── 8. pickWeighted (RNG) ──────────────────────────────────────
let pwOutcomes: [ChoiceOutcome] = [
    ChoiceOutcome(weight: 70, resultText: "A", resultTextKey: nil, effects: []),
    ChoiceOutcome(weight: 20, resultText: "B", resultTextKey: nil, effects: []),
    ChoiceOutcome(weight: 10, resultText: "C", resultTextKey: nil, effects: []),
]
for seed in 1...10 {
    var rng = Mulberry32(seed: seed)
    print("pickWeighted(seed\(seed)) = \(UpHeroCombat.pickWeighted(pwOutcomes, rng: &rng).resultText)")
}
// ── 9. generateMysteryFloors (RNG) ─────────────────────────────
for cycle in [0, 1, 2] {
    for seed in 1...6 {
        var rng = Mulberry32(seed: seed)
        let out = UpHeroCombat.generateMysteryFloors(cycleIndex: cycle, rng: &rng)
        print("generateMysteryFloors(c\(cycle),seed\(seed)) = \(out.map(String.init).joined(separator: ","))")
    }
}
// ── 10. getBuffBoost ───────────────────────────────────────────
let bb: [CardBuff] = [
    CardBuff(effects: [.special(type: .dropRate, value: 10), .special(type: .coinBoost, value: 20)], description: ""),
    CardBuff(effects: [.special(type: .dropRate, value: 5)], description: ""),
]
print("getBuffBoost(dropRate) = \(f(UpHeroCombat.getBuffBoost(buffs: bb, type: .dropRate)))")
print("getBuffBoost(coinBoost) = \(f(UpHeroCombat.getBuffBoost(buffs: bb, type: .coinBoost)))")
print("getBuffBoost(xpBoost) = \(f(UpHeroCombat.getBuffBoost(buffs: bb, type: .xpBoost)))")
print("getBuffBoost(undefined) = \(f(UpHeroCombat.getBuffBoost(buffs: nil, type: .dropRate)))")
// ── 11. findLastEncounterIndex / computeMonsterHp ──────────────
func encE(_ m: Monster) -> LogEntry { .encounter(monster: m, timestamp: 0) }
func cbtE(_ a: CombatActor, _ d: Int) -> LogEntry {
    .combat(attacker: a, damage: d, outcome: .hit, narrative: nil, narrativeKey: nil, narrativeParams: nil, timestamp: 0)
}
func regenE(_ amt: Int) -> LogEntry {
    .monsterEffect(effect: .regen, amount: amt, narrative: nil, narrativeKey: nil, narrativeParams: nil, timestamp: 0)
}
let narrE: LogEntry = .narrative(text: "x", narrativeKey: nil, narrativeParams: nil, timestamp: 0)
func vicE(_ m: Monster) -> LogEntry {
    .victory(monster: m, xp: 0, coins: 0, narrativeKey: nil, narrativeParams: nil, timestamp: 0)
}
let mon100 = mkMonster(hp: 100, maxHp: 100)
let logs: [(String, [LogEntry])] = [
    ("L0", [narrE, encE(mon100), cbtE(.hero, 30), cbtE(.enemy, 10)]),
    ("L1", [encE(mon100), cbtE(.hero, 20), vicE(mon100), encE(mon100), cbtE(.hero, 15)]),
    ("L2", [encE(mon100), cbtE(.hero, 25), vicE(mon100)]),
    ("L3", [narrE, narrE]),
    ("L4", [encE(mon100), cbtE(.hero, 30), cbtE(.enemy, 10), cbtE(.hero, 0), regenE(5), cbtE(.hero, 20)]),
]
for (name, log) in logs {
    let idx = UpHeroCombat.findLastEncounterIndex(log)
    let hp = idx >= 0 ? String(UpHeroCombat.computeMonsterHp(log: log, encounterIdx: idx, monster: mon100)) : "-"
    print("encounterIdx/monsterHp(\(name)) = \(idx),\(hp)")
}
// ── 12. dedupeDrops ────────────────────────────────────────────
let dd = UpHeroCombat.dedupeDrops([eq("A"), eq("B"), eq("A"), eq("C"), eq("B")])
print("dedupeDrops = \(dd.map { $0.id }.joined(separator: ","))")
// ── 13. summarizeEffects / summarizeEffectsData ────────────────
let effSets: [(String, [ChoiceEffect])] = [
    ("mixed", [.reward(coins: 30, xp: 50, dropEquipmentId: nil), .damage(amount: 10),
               .time(delta: -3), .heal(amount: 20), .reward(coins: 5, xp: nil, dropEquipmentId: nil)]),
    ("posTime", [.time(delta: 8), .reward(coins: nil, xp: 15, dropEquipmentId: nil)]),
    ("empty", [.fight, .nothing]),
]
for (name, eff) in effSets {
    let d = UpHeroCombat.summarizeEffectsData(eff)
    print("summarizeEffectsData(\(name)) = xp\(opt(d.xp)),co\(opt(d.coins)),he\(opt(d.heal)),da\(opt(d.damage)),ti\(opt(d.timeDelta))")
    print("summarizeEffects(\(name)) = [\(UpHeroCombat.summarizeEffects(eff))]")
}
// ── 14. amplifyChoiceOptions ───────────────────────────────────
let ampOpts: [ChoiceOption] = [
    ChoiceOption(label: "a", labelKey: nil, labelParams: nil,
                 effect: .reward(coins: 10, xp: 20, dropEquipmentId: nil), outcomes: nil,
                 resultText: nil, resultTextKey: nil),
    ChoiceOption(label: "b", labelKey: nil, labelParams: nil, effect: nil,
                 outcomes: [ChoiceOutcome(weight: 1, resultText: "x", resultTextKey: nil,
                                          effects: [.damage(amount: 5), .time(delta: -2)])],
                 resultText: nil, resultTextKey: nil),
    ChoiceOption(label: "c", labelKey: nil, labelParams: nil, effect: .heal(amount: 7),
                 outcomes: nil, resultText: nil, resultTextKey: nil),
    ChoiceOption(label: "d", labelKey: nil, labelParams: nil, effect: .fight,
                 outcomes: nil, resultText: nil, resultTextKey: nil),
]
let amp = UpHeroCombat.amplifyChoiceOptions(ampOpts, factor: 1.6)
if case let .reward(c, x, _) = amp[0].effect! {
    print("amplify.opt0 = \(c!),\(x!)")
}
if case let .damage(a) = amp[1].outcomes![0].effects[0],
   case let .time(d) = amp[1].outcomes![0].effects[1] {
    print("amplify.opt1 = \(a),\(d)")
}
if case let .heal(a) = amp[2].effect! {
    print("amplify.opt2 = \(a)")
}
if case .fight = amp[3].effect! {
    print("amplify.opt3 = fight")
}
// ── 15. applyStatAndHealBuffs ──────────────────────────────────
let buffStat = CardBuff(effects: [.stat(stats: [.str: 5, .vit: 3])], description: "")
let buffHeal = CardBuff(effects: [.special(type: .healStart, value: 30)], description: "")
let buffAffinity = CardBuff(effects: [.affinity(category: .fitness, multiplier: 2),
                                      .stat(stats: [.str: 10])], description: "")
let buffCrit = CardBuff(effects: [.special(type: .critBonus, value: 8)], description: "")
print("applyStatAndHealBuffs(A) = \(fmtHero(UpHeroCombat.applyStatAndHealBuffs(hero: mkHero(), buffs: [buffStat, buffHeal], dungeonId: .fitness)))")
print("applyStatAndHealBuffs(B) = \(fmtHero(UpHeroCombat.applyStatAndHealBuffs(hero: mkHero(), buffs: [buffAffinity], dungeonId: .fitness)))")
print("applyStatAndHealBuffs(C) = \(fmtHero(UpHeroCombat.applyStatAndHealBuffs(hero: mkHero(), buffs: [buffAffinity], dungeonId: .nutrition)))")
print("applyStatAndHealBuffs(D) = \(fmtHero(UpHeroCombat.applyStatAndHealBuffs(hero: mkHero(), buffs: [buffCrit], dungeonId: .fitness)))")
// ── 16. applyClassStartEffects ─────────────────────────────────
for c in [ClassType?.none, .priest, .illusionist, .warrior] {
    let label = c.map { $0.rawValue } ?? "null"
    print("applyClassStartEffects(\(label)) = \(fmtHero(UpHeroCombat.applyClassStartEffects(mkHero(classType: c))))")
}
// ── 17. floorRewardScale (Phase 4-D) ───────────────────────────
for (fl, ng) in [(1, 0), (5, 0), (10, 0), (20, 0), (30, 0), (30, 1), (60, 2), (200, 0)] {
    let r = UpHeroCombat.floorRewardScale(floor: fl, ngPlusLevel: ng)
    print("floorRewardScale(\(fl),ng\(ng)) = \(r.coins),\(r.xp)")
}
// ── 18. scaleChoiceEffectsForFloor (Phase 4-D) ─────────────────
func fmtFx(_ e: ChoiceEffect) -> String {
    switch e {
    case let .reward(c, x, _): return "reward(\(opt(c)),\(opt(x)))"
    case let .damage(a): return "damage(\(a))"
    case let .heal(a): return "heal(\(a))"
    case let .time(d): return "time(\(d))"
    case let .runBuff(s, p, fl): return "runBuff(\(s.rawValue),\(p),\(opt(fl)))"
    case let .runCurse(s, p, fl): return "runCurse(\(s.rawValue),\(p),\(opt(fl)))"
    case let .stealth(n): return "stealth(\(n))"
    case let .guaranteedDrop(c): return "guaranteedDrop(\(opt(c)))"
    case .spinSlot: return "spinSlot"
    case .skipFloors: return "skipFloors"
    case .revealBoss: return "revealBoss"
    case .nothing: return "nothing"
    case .fight: return "fight"
    case .flee: return "flee"
    case .startMinigame: return "startMinigame"
    }
}
let scaleFx: [ChoiceEffect] = [
    .reward(coins: 35, xp: 10, dropEquipmentId: nil),
    .damage(amount: 15),
    .heal(amount: 20),
    .time(delta: -3),
    .spinSlot(cost: 30),
    .runBuff(stat: .str, pct: 5, floors: 5),
]
for (fl, hp, ng) in [(1, 100, 0), (10, 100, 0), (20, 388, 0), (30, 388, 1)] {
    let out = UpHeroCombat.scaleChoiceEffectsForFloor(scaleFx, floor: fl, heroMaxHp: hp, ngPlusLevel: ng)
    print("scaleChoiceEffectsForFloor(F\(fl),hp\(hp),ng\(ng)) = \(out.map(fmtFx).joined(separator: "|"))")
}
// ── 19. summarizeEffectsData — 런 한정 효과 (Phase 4-D) ─────────
let runFx: [ChoiceEffect] = [
    .runBuff(stat: .str, pct: 5, floors: 5),
    .runCurse(stat: .agi, pct: 5, floors: 3),
    .runCurse(stat: .all, pct: 10, floors: nil),
    .stealth(encounters: 1),
    .guaranteedDrop(count: nil),
    .revealBoss,
    .skipFloors(count: 2),
    .time(delta: -4),
]
do {
    let d = UpHeroCombat.summarizeEffectsData(runFx)
    let rm = (d.runMods ?? []).map { "\($0.stat.rawValue)\($0.pct >= 0 ? "+" : "")\($0.pct)/\(opt($0.floorsLeft))" }
        .joined(separator: ",")
    print("summarizeEffectsData(runMods) = sk\(opt(d.skipFloors)),rm[\(rm)],st\(opt(d.stealth)),gd\(opt(d.guaranteedDrop)),bp\(opt(d.bossDmgPct)),ti\(opt(d.timeDelta))")
    print("summarizeEffects(runMods) = [\(UpHeroCombat.summarizeEffects(runFx))]")
}
// ── 20. sessionStats — combatBuff 뒤 런 보정 2단 반올림 (Phase 4-D) ──
do {
    var statHero = mkHero()
    statHero.baseStats = HeroBaseStats(str: 20, int: 13, vit: 17, dex: 9, agi: 10, crit: 7, slotBonus: 1)
    let buff = CombatBuff(pct: 10, battlesLeft: 3)
    let mods: [RunStatMod] = [
        RunStatMod(stat: .str, pct: 5, floorsLeft: nil),
        RunStatMod(stat: .all, pct: -50, floorsLeft: 2),
        RunStatMod(stat: .agi, pct: 200, floorsLeft: nil),
    ]
    func fmtStats(_ st: HeroBaseStats) -> String {
        "\(st.str),\(st.int),\(st.vit),\(st.dex),\(st.agi),\(st.crit),\(st.slotBonus)"
    }
    print("sessionStats(stack) = \(fmtStats(UpHeroCombat.sessionStats(hero: statHero, combatBuff: buff, runStatMods: mods)))")
    print("sessionStats(noBuff) = \(fmtStats(UpHeroCombat.sessionStats(hero: statHero, combatBuff: nil, runStatMods: mods)))")
    print("sessionStats(noMods) = \(fmtStats(UpHeroCombat.sessionStats(hero: statHero, combatBuff: buff, runStatMods: nil)))")
}
