// main.swift — Phase 2.4 talismanSkills + sessionReward 동치성 검증 (Swift).

import Foundation

func f10(_ x: Double?) -> String { x.map { String(format: "%.10f", $0) } ?? "-" }

func fmtMods(_ m: TalismanModifiers) -> String {
    "dodge=\(f10(m.dodgeBonus)) emiss=\(f10(m.enemyMissBonus)) cdmg=\(f10(m.critDmgBonus)) coin=\(f10(m.coinMult)) time=\(f10(m.timeCostMult)) heal=\(f10(m.healEffectMult)) regen=\(m.hpRegenEvery2Rounds) edrop=\(f10(m.extraDropChance)) legend=\(f10(m.legendDropBonus)) btime=\(m.bossTimeRecover) counter=\(f10(m.counterChance)) lowhp=\(f10(m.lowHpDmgBonus)) agiacc=\(m.agiRoundAccum) agicap=\(m.agiRoundCap) cdred=\(m.classSkillCdReduce) sxp=\(m.startXp) shpm=\(f10(m.startHpMult)) shpf=\(m.startHpFlat)"
}

func mkEquip(id: String, name: String? = nil, type: EquipSlot = .weapon,
             rarity: Rarity = .normal, talismanSkills: [String]? = nil) -> Equipment {
    Equipment(id: id, name: name ?? id, baseId: nil, type: type, rarity: rarity,
              category: .fitness, iconName: "x", stats: [:], effects: nil, flavor: nil,
              photoId: nil, enhanceLevel: nil, enhanceFailStreak: nil, affix: nil,
              affixes: nil, talismanSkills: talismanSkills)
}
func mkMonster(name: String, isBoss: Bool) -> Monster {
    Monster(id: "m", name: name, templateId: nil, kind: .beast, level: 10, hp: 100,
            maxHp: nil, atk: 30, def: 10, xpReward: 10, coinReward: 5,
            isBoss: isBoss, dungeonId: .fitness, trait: nil)
}
func mkSess(currentFloor: Int = 10, log: [LogEntry] = [], drops: [Equipment] = [],
            heroHp: Int = 100, heroMaxHp: Int = 100) -> CombatSession {
    let hero = Hero(name: "H", hp: heroHp, maxHp: heroMaxHp,
        baseStats: HeroBaseStats(str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0),
        equipped: [:], classType: nil, appearanceVariant: 0,
        autoSkillEnabled: nil, learnedSkills: nil, skillPoints: nil)
    return CombatSession(
        dungeonId: .fitness, startFloor: 1, currentFloor: currentFloor, log: log, hero: hero,
        rewards: SessionRewards(xp: 0, coins: 0, drops: drops), status: .completed,
        pendingChoiceIndex: nil, speed: 1, activeBuffs: nil, time: 0, maxTime: 220,
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

let skillIDs = ["fit_5", "fit_10", "lrn_5", "lrn_10", "mnd_5", "mnd_10", "ntr_5", "ntr_10",
                "soc_5", "soc_10", "prd_5", "prd_10", "wel_5", "wel_10", "trd_5", "trd_10"]

// ── A. 부적 스킬 16종 apply ─────────────────────────────────────
for id in skillIDs {
    var m = TalismanModifiers()
    TalismanSkills.catalog[id]!.apply(&m)
    print("talismanApply:\(id) = \(fmtMods(m))")
}

// ── B. computeTalismanSkillIds ─────────────────────────────────
let cats: [Category] = [.fitness, .learning, .mindfulness, .nutrition, .social, .productivity, .wellness, .trending]
for cat in cats {
    for lvl in [0, 4, 5, 9, 10] {
        let ids = TalismanSkills.computeTalismanSkillIds(category: cat, enhanceLevel: lvl)
        print("computeTalismanSkillIds:\(cat.rawValue):\(lvl) = [\(ids.joined(separator: ","))]")
    }
}

// ── C. collectTalismanMods ─────────────────────────────────────
let cHero = Hero(name: "H", hp: 100, maxHp: 100,
    baseStats: HeroBaseStats(str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0),
    equipped: [
        .talisman: mkEquip(id: "t", type: .talisman, talismanSkills: ["fit_5", "fit_10"]),
        .weapon: mkEquip(id: "w", type: .weapon, talismanSkills: ["soc_5", "wel_5"]),
        .armor: mkEquip(id: "a", type: .armor, talismanSkills: nil),
    ],
    classType: nil, appearanceVariant: 0, autoSkillEnabled: nil, learnedSkills: nil, skillPoints: nil)
print("collectTalismanMods = \(fmtMods(TalismanSkills.collectTalismanMods(cHero)))")

// ── D. applyTalismanSkillStartEffects ──────────────────────────
var dSession = mkSess(heroHp: 200, heroMaxHp: 200)
var dMods = TalismanModifiers()
dMods.startHpMult = 1.1
dMods.startHpFlat = 20
dMods.startXp = 15
TalismanSkills.applyTalismanSkillStartEffects(&dSession, mods: dMods)
print("applyTalismanStart = hp\(dSession.hero.hp) max\(dSession.hero.maxHp) xp\(dSession.rewards.xp)")

// ── E. equipmentBaseName ───────────────────────────────────────
let nameRarity: [(String, Rarity)] = [
    ("검", .normal), ("빛나는 검", .rare), ("전설적 갑옷", .unique),
    ("신성한 부적", .legend), ("빛나는검", .rare),
]
for (name, rarity) in nameRarity {
    let eq = mkEquip(id: name, name: name, rarity: rarity)
    print("equipBaseName:\(name):\(rarity.rawValue) = \(SessionReward.equipmentBaseName(eq))")
}

func eqArr(_ ids: [String]) -> [Equipment] { ids.map { mkEquip(id: $0) } }
func endE(_ reason: SessionEndReason) -> LogEntry {
    .sessionEnd(reason: reason, detail: nil, detailKey: nil, detailMonsterTemplateId: nil,
                detailMonsterFallback: nil, detailFloor: nil, timestamp: 0)
}

// ── F. calculateKeptDrops (결정론 분기) ────────────────────────
var krng = Mulberry32(seed: 1)
let s1 = mkSess(log: [endE(.bossDefeated)], drops: eqArr(["A", "B", "C"]))
print("keptDrops:notDied = \(SessionReward.calculateKeptDrops(s1, rng: &krng).map { $0.id }.joined(separator: ","))")
let s2 = mkSess(log: [endE(.heroDied)], drops: eqArr(["A", "B", "C", "D"]))
print("keptDrops:died4 = \(SessionReward.calculateKeptDrops(s2, rng: &krng).map { $0.id }.joined(separator: ","))")
let s3 = mkSess(log: [endE(.defeat)], drops: eqArr(["A", "B", "C", "D", "E"]))
print("keptDrops:defeat5 = \(SessionReward.calculateKeptDrops(s3, rng: &krng).map { $0.id }.joined(separator: ","))")

// ── G. calculateBossesDefeated ─────────────────────────────────
func bossE(_ floor: Int) -> LogEntry { .boss(monster: mkMonster(name: "B", isBoss: true), floor: floor, timestamp: 0) }
func vic(_ name: String, _ isBoss: Bool) -> LogEntry {
    .victory(monster: mkMonster(name: name, isBoss: isBoss), xp: 0, coins: 0,
             narrativeKey: nil, narrativeParams: nil, timestamp: 0)
}
let bdLog: [LogEntry] = [bossE(10), vic("B", true), bossE(20), vic("m", false), bossE(30), vic("B", true)]
print("bossesDefeated:A = [\(SessionReward.calculateBossesDefeated(log: bdLog, existing: [5]).map(String.init).joined(separator: ","))]")
print("bossesDefeated:B = [\(SessionReward.calculateBossesDefeated(log: bdLog, existing: [20]).map(String.init).joined(separator: ","))]")

// ── H. calculateCodexDelta ─────────────────────────────────────
func encE(_ name: String, _ isBoss: Bool) -> LogEntry { .encounter(monster: mkMonster(name: name, isBoss: isBoss), timestamp: 0) }
func dropE(_ name: String, _ rarity: Rarity) -> LogEntry {
    .drop(equipment: mkEquip(id: name, name: name, rarity: rarity), timestamp: 0)
}
let cdLog: [LogEntry] = [encE("고블린", false), encE("드래곤", true), encE("고블린", false),
                         dropE("빛나는 검", .rare), dropE("검", .normal)]
let cx = SessionReward.calculateCodexDelta(log: cdLog, current: Codex(monsters: ["슬라임"], equipment: ["방패"], bosses: []))
print("codexDelta = m[\(cx.monsters.joined(separator: "|"))] b[\(cx.bosses.joined(separator: "|"))] e[\(cx.equipment.joined(separator: "|"))]")

// ── I. calculateDungeonProgress ────────────────────────────────
let dpDied = mkSess(currentFloor: 45, log: [endE(.heroDied)])
let p1 = SessionReward.calculateDungeonProgress(
    session: dpDied,
    existing: DungeonProgress(dungeonId: .fitness, floorReached: 20, bestFloorReached: 40, bossesDefeated: [10]),
    newBossesDefeated: [10, 20])
print("dungeonProgress:died = f\(p1.floorReached) best\(p1.bestFloorReached) boss[\(p1.bossesDefeated.map(String.init).joined(separator: ","))]")
let dpClear = mkSess(currentFloor: 33, log: [endE(.bossDefeated)])
let p2 = SessionReward.calculateDungeonProgress(session: dpClear, existing: nil, newBossesDefeated: [30])
print("dungeonProgress:cleared = f\(p2.floorReached) best\(p2.bestFloorReached) boss[\(p2.bossesDefeated.map(String.init).joined(separator: ","))]")
print("checkpointInterval = \(SessionReward.dungeonCheckpointInterval)")
