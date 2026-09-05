// main.swift — Phase 2.4 "스킬" 동치성 검증 (Swift 측)
//
// 실제 포팅 산출물(Card/Game/UpHero/UpHeroRNG/UpHeroCombat/ClassSkills.swift)을
// 컴파일하여 classskills-check.mjs 와 동일 입력으로 동일 출력 라인을 찍는다.

import Foundation

func f10(_ x: Double?) -> String { x.map { String(format: "%.10f", $0) } ?? "-" }
func dash<T>(_ v: T?) -> String { v.map { "\($0)" } ?? "-" }

func mkMonster(hp: Int = 400, level: Int = 20, isBoss: Bool = false) -> Monster {
    Monster(id: "m", name: "M", templateId: "tmpl", kind: .beast, level: level, hp: hp,
            maxHp: nil, atk: 30, def: 10, xpReward: 10, coinReward: 5,
            isBoss: isBoss, dungeonId: .fitness, trait: nil)
}

func mkSession(
    hp: Int = 470, maxHp: Int = 500, intStat: Int = 50, time: Int = 215, maxTime: Int = 220,
    classResource: Int = 100, classType: ClassType? = nil, learnedSkills: [String]? = nil,
    autoSkillEnabled: Bool? = nil, skillCooldown: Int? = nil, skillCooldowns: [String: Int]? = nil,
    heroAtkBonusRounds: AtkBonusEffect? = nil, enemyStunnedRounds: Int? = nil,
    heroDmgReductionRounds: DmgReductionEffect? = nil, guaranteedCritAttacks: Int? = nil,
    heroInvulnerableRounds: Int? = nil, revivePending: Bool? = nil,
    nextHeroDamageMult: Double? = nil, forcedDodgeRounds: Int? = nil,
    forcedEnemyMisses: Int? = nil, nextCoinMult: Double? = nil
) -> CombatSession {
    let hero = Hero(
        name: "H", hp: hp, maxHp: maxHp,
        baseStats: HeroBaseStats(str: 10, int: intStat, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0),
        equipped: [:], classType: classType, appearanceVariant: 0,
        autoSkillEnabled: autoSkillEnabled, learnedSkills: learnedSkills, skillPoints: nil)
    return CombatSession(
        dungeonId: .fitness, startFloor: 1, currentFloor: 1, log: [], hero: hero,
        rewards: SessionRewards(xp: 0, coins: 0, drops: []), status: .active,
        pendingChoiceIndex: nil, speed: 1, activeBuffs: nil, time: time, maxTime: maxTime,
        skillCooldown: skillCooldown, classResource: classResource, skillCooldowns: skillCooldowns,
        heroAtkBonusRounds: heroAtkBonusRounds, enemyStunnedRounds: enemyStunnedRounds,
        heroDmgReductionRounds: heroDmgReductionRounds, guaranteedCritAttacks: guaranteedCritAttacks,
        heroInvulnerableRounds: heroInvulnerableRounds, revivePending: revivePending,
        pendingMinigame: nil, recentEventPrompts: nil, nextHeroDamageMult: nextHeroDamageMult,
        forcedDodgeRounds: forcedDodgeRounds, forcedEnemyMisses: forcedEnemyMisses,
        nextCoinMult: nextCoinMult, talismanMods: nil, extraDropAvailable: nil,
        talismanAgiStack: nil, roundCounter: nil, ngPlusLevel: nil, heroLevel: nil,
        isWeeklyVariant: nil, weeklyAffixId: nil, monsterAtkMult: nil, monsterHpMult: nil,
        xpMult: nil, monsterCritBonus: nil, heroPoisonRounds: nil, monsterRegenAmount: nil,
        monsterShieldHits: nil, flattenDropRarity: nil, restChanceBonus: nil,
        mysteryFloors: nil, startedAt: 0)
}

func effSummary(_ s: CombatSession) -> String {
    let atk = s.heroAtkBonusRounds.map { "\($0.rounds)/\(f10($0.mult))" } ?? "-"
    let dr = s.heroDmgReductionRounds.map { "\($0.rounds)/\(f10($0.reduction))" } ?? "-"
    let cd: String
    if let cds = s.skillCooldowns {
        cd = cds.keys.sorted().map { "\($0):\(cds[$0]!)" }.joined(separator: ";")
    } else {
        cd = "-"
    }
    return "ndm=\(f10(s.nextHeroDamageMult)) atk=\(atk) stun=\(dash(s.enemyStunnedRounds)) dr=\(dr) inv=\(dash(s.heroInvulnerableRounds)) fd=\(dash(s.forcedDodgeRounds)) fem=\(dash(s.forcedEnemyMisses)) ncm=\(f10(s.nextCoinMult)) gca=\(dash(s.guaranteedCritAttacks)) rev=\(dash(s.revivePending)) cd=\(cd)"
}

func lastSkillId(_ log: [LogEntry]) -> String {
    for e in log.reversed() {
        if case let .skill(_, sid, _, _, _, _, _) = e { return sid ?? "none" }
    }
    return "none"
}

let classOrder: [ClassType] = [.warrior, .mage, .monk, .druid, .bard, .chronomancer, .priest, .illusionist]
var allSkills = ClassSkills.noviceSkills
for c in classOrder { allSkills += ClassSkills.classSkillTrees[c]! }

// ── A. apply ───────────────────────────────────────────────────
let applyMonster = mkMonster(hp: 400, level: 20, isBoss: false)
for sk in allSkills {
    var s = mkSession(skillCooldowns: ["warrior_smash_t1": 3, "mage_lightning_t1": 5])
    let prev = s.log.count
    sk.apply(&s, applyMonster)
    var combatDmg = "-"
    var skillNarr = "-"
    var skillIdStr = "-"
    for e in s.log[prev...] {
        if case let .combat(_, damage, _, _, _, _, _) = e { combatDmg = String(damage) }
        if case let .skill(_, sid, _, narr, _, _, _) = e { skillNarr = narr; skillIdStr = sid ?? "-" }
    }
    print("apply:\(sk.id) = hp\(s.hero.hp) t\(s.time) combat\(combatDmg) | \(effSummary(s)) | \(skillNarr) | \(skillIdStr)")
}

// ── B. shouldFire ──────────────────────────────────────────────
let sfMon = mkMonster(hp: 400, level: 20, isBoss: false)
let sfMonMid = mkMonster(hp: 100, level: 5, isBoss: false)
let variants: [(String, CombatSession, Monster)] = [
    ("full", mkSession(hp: 206, maxHp: 207, time: 219, maxTime: 220,
                       skillCooldowns: ["warrior_smash_t1": 2]), sfMon),
    ("low", mkSession(hp: 10, maxHp: 207, time: 10, maxTime: 220), sfMon),
    ("mid", mkSession(hp: 103, maxHp: 207, time: 110, maxTime: 220,
                      heroAtkBonusRounds: AtkBonusEffect(rounds: 3, mult: 1.3),
                      enemyStunnedRounds: 1, guaranteedCritAttacks: 3, revivePending: true), sfMonMid),
]
for sk in allSkills {
    for (vn, vs, vm) in variants {
        print("shouldFire:\(sk.id):\(vn) = \(sk.shouldFire(vs, vm))")
    }
}

// ── C. findSkillById ───────────────────────────────────────────
for id in ["warrior_smash_t1", "mage_meteor_t4", "novice_brace", "nonexistent"] {
    print("findSkillById:\(id) = \(ClassSkills.findSkillById(id)?.name ?? "nil")")
}

// ── D. canFireSkill ────────────────────────────────────────────
let dS = mkSession(classResource: 50,
    learnedSkills: ["warrior_smash_t1", "warrior_berserk_t2", "warrior_crush_t3"],
    skillCooldowns: ["warrior_berserk_t2": 3])
for id in ["warrior_smash_t1", "warrior_berserk_t2", "warrior_crush_t3", "novice_heal"] {
    let r = ClassSkills.canFireSkill(dS, skillId: id)
    print("canFireSkill:\(id) = \(r.ok),\(r.reason?.rawValue ?? "-")")
}

// ── E. fireSkill ───────────────────────────────────────────────
var eS = mkSession(classResource: 80, learnedSkills: ["warrior_smash_t1"])
let eOk = ClassSkills.fireSkill(&eS, skillId: "warrior_smash_t1", monster: applyMonster)
print("fireSkill = \(eOk) res\(eS.classResource ?? 0) cd\((eS.skillCooldowns ?? [:])["warrior_smash_t1"] ?? -1) t1cd\(dash(eS.skillCooldown)) ndm\(f10(eS.nextHeroDamageMult))")

// ── F. maybeFireSkill ──────────────────────────────────────────
var f1 = mkSession(classResource: 100, classType: .warrior, learnedSkills: ["warrior_smash_t1", "warrior_rage_burst_t4"], autoSkillEnabled: true)
ClassSkills.maybeFireSkill(&f1, monster: applyMonster)
print("maybeFireSkill:hiTier = \(lastSkillId(f1.log))")

var f2 = mkSession(classResource: 100, classType: .warrior, learnedSkills: ["warrior_smash_t1"], autoSkillEnabled: false)
ClassSkills.maybeFireSkill(&f2, monster: applyMonster)
print("maybeFireSkill:autoOff = log\(f2.log.count)")

var f3 = mkSession(hp: 100, maxHp: 500, classResource: 0, learnedSkills: ["novice_heal"], autoSkillEnabled: true)
ClassSkills.maybeFireSkill(&f3, monster: applyMonster)
print("maybeFireSkill:novice = \(lastSkillId(f3.log))")

// Phase 3-F — 레거시 [T1, T2a, T2b] 둘 다 준비 + hp 50% → 선언 순서 (a) 우선.
var f4 = mkSession(hp: 250, maxHp: 500, classResource: 100, classType: .warrior,
                   learnedSkills: ["warrior_smash_t1", "warrior_berserk_t2", "warrior_ironwall_t2"],
                   autoSkillEnabled: true)
ClassSkills.maybeFireSkill(&f4, monster: applyMonster)
print("maybeFireSkill:tieBreak = \(lastSkillId(f4.log))")

// ── G. advanceSkillCounters ────────────────────────────────────
var gS = mkSession(
    skillCooldown: 2, skillCooldowns: ["a": 3, "b": 1, "c": 0],
    heroAtkBonusRounds: AtkBonusEffect(rounds: 1, mult: 1.3), enemyStunnedRounds: 2,
    heroDmgReductionRounds: DmgReductionEffect(rounds: 1, reduction: 0.3),
    heroInvulnerableRounds: 3, forcedDodgeRounds: 1)
ClassSkills.advanceSkillCounters(&gS)
print("advanceSkillCounters = \(effSummary(gS)) t1cd\(dash(gS.skillCooldown))")

// ── H. learnStatus 매트릭스 + siblingSkill (Phase 3-F) ────────────
do {
    let W1 = "warrior_smash_t1", W2A = "warrior_berserk_t2", W2B = "warrior_ironwall_t2"
    let W3A = "warrior_crush_t3", W3B = "warrior_warcry_t3", W4 = "warrior_rage_burst_t4"
    // (case, learned, points, heroLevel, classType) — classskills-check.mjs 섹션 H 와 동일.
    let cases: [(String, [String], Int, Int, ClassType?)] = [
        ("t1only", [W1], 5, 45, .warrior),
        ("t2a", [W1, W2A], 5, 45, .warrior),
        ("t2b", [W1, W2B], 5, 45, .warrior),
        ("t2a_t3b", [W1, W2A, W3B], 5, 45, .warrior),
        ("full", [W1, W2A, W3A, W4], 5, 45, .warrior),
        ("legacyBoth", [W1, W2A, W2B], 5, 45, .warrior),
        ("lv34", [W1], 5, 34, .warrior),
        ("lv39", [W1, W2A], 5, 39, .warrior),
        ("lv44", [W1, W2A, W3A], 5, 44, .warrior),
        ("sp0", [W1], 0, 45, .warrior),
        ("sp1", [W1, W2A, W3A], 1, 45, .warrior),
        ("mage", [W1], 5, 45, .mage),
        ("noClass", [W1], 5, 45, nil),
    ]
    let ids = [W1, W2A, W2B, W3A, W3B, W4, "mage_chain_t3"]
    for id in ids {
        let sk = ClassSkills.findSkillById(id)!
        for (cn, learned, points, heroLevel, classType) in cases {
            let st = ClassSkills.learnStatus(sk, classType: classType, heroLevel: heroLevel,
                                             learned: learned, points: points)
            print("learnStatus:\(id):\(cn) = \(st.webName)")
        }
    }
    for id in ids {
        let sib = ClassSkills.siblingSkill(of: ClassSkills.findSkillById(id)!)
        print("sibling:\(id) = \(sib?.id ?? "nil")")
    }
    let nov = ClassSkills.siblingSkill(of: ClassSkills.findSkillById("novice_heal")!)
    print("sibling:novice_heal = \(nov?.id ?? "nil")")
}
