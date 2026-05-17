// affix-narrative.swift — Phase 2.4 weeklyAffixes + upHeroNarrative 검증 (Swift).
// 컴파일: Card+Game+UpHero+UpHeroRNG+UpHeroCombat+WeeklyAffixes+CombatFlavor+UpHeroNarrative
//         ↔  scripts/affix-narrative-check.mjs

import Foundation

var lines: [String] = []

// ── 1. pickWeeklyAffix ─────────────────────────────────────────
for wk in ["2026-W16", "2026-W01", "2025-W52", "2024-W30", "2027-W09", "2026-W42"] {
    lines.append("pickWeeklyAffix:\(wk) = \(WeeklyAffixes.pickWeeklyAffix(weekId: wk).id)")
}
// ── 2. getWeeklyAffixById ──────────────────────────────────────
for id in ["glass_cannon", "iron_will", "nonexistent"] {
    lines.append("getWeeklyAffixById:\(id) = \(WeeklyAffixes.getWeeklyAffixById(id)?.name ?? "nil")")
}
// ── 3. affix.apply ─────────────────────────────────────────────
func mkSess() -> CombatSession {
    let hero = Hero(name: "H", hp: 200, maxHp: 200,
        baseStats: HeroBaseStats(str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0),
        equipped: [:], classType: nil, appearanceVariant: 0,
        autoSkillEnabled: nil, learnedSkills: nil, skillPoints: nil)
    return CombatSession(
        dungeonId: .fitness, startFloor: 1, currentFloor: 1, log: [], hero: hero,
        rewards: SessionRewards(xp: 0, coins: 0, drops: []), status: .active,
        pendingChoiceIndex: nil, speed: 1, activeBuffs: nil, time: 220, maxTime: 220,
        skillCooldown: nil, classResource: nil, skillCooldowns: nil, heroAtkBonusRounds: nil,
        enemyStunnedRounds: nil, heroDmgReductionRounds: nil, guaranteedCritAttacks: nil,
        heroInvulnerableRounds: nil, revivePending: nil, pendingMinigame: nil,
        recentEventPrompts: nil, nextHeroDamageMult: nil, forcedDodgeRounds: nil,
        forcedEnemyMisses: nil, nextCoinMult: nil, talismanMods: nil, extraDropAvailable: nil,
        talismanAgiStack: nil, roundCounter: nil, ngPlusLevel: nil, heroLevel: nil,
        isWeeklyVariant: nil, weeklyAffixId: nil, monsterAtkMult: nil, monsterHpMult: nil,
        xpMult: nil, monsterCritBonus: nil, heroPoisonRounds: nil, monsterRegenAmount: nil,
        monsterShieldHits: nil, flattenDropRarity: nil, restChanceBonus: nil,
        mysteryFloors: nil, startedAt: 0)
}
func dumpSess(_ s: CombatSession) -> String {
    let b = s.hero.baseStats
    func od(_ v: Double?) -> String { v.map { "\($0)" } ?? "-" }
    func ob(_ v: Bool?) -> String { v.map { "\($0)" } ?? "-" }
    return "hp\(s.hero.hp) max\(s.hero.maxHp) str\(b.str) agi\(b.agi) crit\(b.crit)"
        + " | atkM\(od(s.monsterAtkMult)) hpM\(od(s.monsterHpMult)) critB\(od(s.monsterCritBonus))"
        + " | maxT\(s.maxTime) t\(s.time) | flat\(ob(s.flattenDropRarity)) rest\(od(s.restChanceBonus))"
        + " | dodge\(od(s.talismanMods?.dodgeBonus)) buffs\((s.activeBuffs ?? []).count)"
}
for affix in WeeklyAffixes.pool {
    var s = mkSess()
    affix.apply(&s)
    lines.append("affixApply:\(affix.id) = \(dumpSess(s))")
}

// ── 4. narrative ──────────────────────────────────────────────
let kinds: [MonsterKind] = [.beast, .goblin, .spirit, .construct, .book, .creature, .large]
let outcomes: [CombatOutcome] = [.hit, .crit, .dodge, .miss]
func mkMon(_ kind: MonsterKind) -> Monster {
    Monster(id: "m", name: "몬스터", templateId: "tmpl_x", kind: kind, level: 10, hp: 100,
            maxHp: nil, atk: 30, def: 10, xpReward: 10, coinReward: 5,
            isBoss: nil, dungeonId: .fitness, trait: nil)
}
for kind in kinds {
    let m = mkMon(kind)
    for oc in outcomes {
        for seed in 1...2 {
            var rng1 = Mulberry32(seed: seed)
            let h = UpHeroNarrative.heroAttackNarrativeI18n(monster: m, outcome: oc, damage: 42, rng: &rng1)
            lines.append("heroNarr:\(kind.rawValue):\(oc.rawValue):s\(seed) = [\(h.text)] key=\(h.key ?? "")")
            var rng2 = Mulberry32(seed: seed)
            let e = UpHeroNarrative.monsterAttackNarrativeI18n(monster: m, outcome: oc, damage: 42, rng: &rng2)
            lines.append("monsterNarr:\(kind.rawValue):\(oc.rawValue):s\(seed) = [\(e.text)] key=\(e.key ?? "")")
        }
    }
}

print(lines.joined(separator: "\n"))
