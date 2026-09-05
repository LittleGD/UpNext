// main.swift — Phase 2.4 오케스트레이션 스모크 테스트.
//
// tickSession 은 비결정론(Math.random 대응) — 동치 검증 불가. 대신 시드 고정
// Mulberry32 로 세션을 끝까지 돌려 (1) 크래시 없음 (2) 불변식(HP/time 범위)
// (3) 세션 종료 보장 을 확인한다.

import Foundation

let flavor = FlavorPool.loadData(
    from: URL(fileURLWithPath: "upnext-ios/UpNext/UpNext/Flavor.json"))

func smokeHero() -> Hero {
    UpHeroRules.computeHeroForLevel(UpHeroRules.createDefaultHero(language: .ko), level: 25)
}

func runSession(seed: Int, weekly: Bool) -> Bool {
    var rng = Mulberry32(seed: seed)
    let opts = CreateSessionOptions(
        ngPlusLevel: 0, isWeeklyVariant: weekly,
        weeklyAffixId: weekly ? "glass_cannon" : nil, heroLevel: 25)
    var session = UpHeroSession.createSession(
        dungeonId: .fitness, hero: smokeHero(), startFloor: weekly ? 30 : 1,
        activeBuffs: nil, options: opts, rng: &rng)
    var ticks = 0
    var maxFloor = session.currentFloor
    var invariantsOK = true
    while session.status != .completed && ticks < 8000 {
        ticks += 1
        switch session.status {
        case .active:
            session = UpHeroSession.tickSession(session, flavor: flavor, rng: &rng)
        case .paused:
            session.status = .active
        case .awaitingChoice:
            session = UpHeroSession.resolveChoice(session, optionIndex: 0, rng: &rng)
        case .awaitingMinigame:
            session = UpHeroSession.resolveMinigame(session, success: true, rng: &rng)
        case .completed:
            break
        }
        maxFloor = max(maxFloor, session.currentFloor)
        if session.hero.hp < 0 || session.hero.hp > session.hero.maxHp { invariantsOK = false }
        if session.time < 0 || session.time > session.maxTime { invariantsOK = false }
    }
    let terminated = session.status == .completed
    let ok = invariantsOK && terminated && ticks < 8000
    let tag = weekly ? "seed\(seed)/weekly" : "seed\(seed)"
    print("\(tag) = \(ok ? "✅" : "❌") ticks\(ticks) floor\(maxFloor) "
        + "status:\(session.status.rawValue) hp\(session.hero.hp)/\(session.hero.maxHp) "
        + "log\(session.log.count) xp\(session.rewards.xp) coin\(session.rewards.coins) "
        + "drops\(session.rewards.drops.count)")
    return ok
}

var allOK = true
for seed in 1...6 where !runSession(seed: seed, weekly: false) { allOK = false }
if !runSession(seed: 42, weekly: true) { allOK = false }

// abandonSession — 진행 중 세션 포기.
var rngA = Mulberry32(seed: 7)
var sA = UpHeroSession.createSession(
    dungeonId: .learning, hero: smokeHero(), startFloor: 1, activeBuffs: nil,
    options: CreateSessionOptions(ngPlusLevel: 0, isWeeklyVariant: false,
                                  weeklyAffixId: nil, heroLevel: 25), rng: &rngA)
for _ in 0..<25 {
    switch sA.status {
    case .active: sA = UpHeroSession.tickSession(sA, flavor: flavor, rng: &rngA)
    case .paused: sA.status = .active
    case .awaitingChoice: sA = UpHeroSession.resolveChoice(sA, optionIndex: 0, rng: &rngA)
    case .awaitingMinigame: sA = UpHeroSession.resolveMinigame(sA, success: false, rng: &rngA)
    case .completed: break
    }
    if sA.status == .completed { break }
}
let abandoned = UpHeroSession.abandonSession(sA)
let abOK = abandoned.status == .completed
print("abandon = \(abOK ? "✅" : "❌") status:\(abandoned.status.rawValue) log\(abandoned.log.count)")
if !abOK { allOK = false }

// Phase 16 (Track C) — 시작층이 보스층 (startFloor 20) 이면 createSession 이 보스를
// 바로 스폰하고 paused 로 둔다 (주간 특례의 일반화).
var rngS = Mulberry32(seed: 11)
let s20 = UpHeroSession.createSession(
    dungeonId: .fitness, hero: smokeHero(), startFloor: 20, activeBuffs: nil,
    options: CreateSessionOptions(ngPlusLevel: 0, isWeeklyVariant: false,
                                  weeklyAffixId: nil, heroLevel: 25), rng: &rngS)
// 웹 upHeroSessionLoop.test.ts 와 같이 마지막 엔트리가 boss(floor 20) 이고 paused 여야 한다
// (시작 narrative 뒤에 붙는다). 보스 템플릿은 던전 bossIds[1] (F20 = 두 번째 보스).
var bossAt20 = false
if let e = s20.log.last, case let .boss(monster, floor, _) = e {
    bossAt20 = floor == 20 && monster.isBoss == true && monster.level == 20
        && monster.templateId == Dungeons.all[.fitness]!.bossIds[1]
}
let bossEntries20 = s20.log.filter { if case .boss = $0 { return true }; return false }.count
let start20OK = bossAt20 && bossEntries20 == 1 && s20.status == .paused
print("startFloor20 = \(start20OK ? "✅" : "❌") status:\(s20.status.rawValue) log\(s20.log.count) bossEntries\(bossEntries20)")
if !start20OK { allOK = false }

// Phase 16 (Track C) — 보스층에서 포기하면 floorReached 는 보스층 - 1 로 롤백된다.
let abandoned20 = UpHeroSession.abandonSession(s20)
let bosses20 = SessionReward.calculateBossesDefeated(log: abandoned20.log, existing: [10])
let progress20 = SessionReward.calculateDungeonProgress(
    session: abandoned20,
    existing: DungeonProgress(dungeonId: .fitness, floorReached: 15, bestFloorReached: 15, bossesDefeated: [10]),
    newBossesDefeated: bosses20)
let rollbackOK = progress20.floorReached == 19 && progress20.bestFloorReached == 20
    && progress20.bossesDefeated == [10]
    && SessionReward.resolveStartFloor(progress20) == 20
print("abandonAtBoss = \(rollbackOK ? "✅" : "❌") floorReached\(progress20.floorReached) best\(progress20.bestFloorReached) next\(SessionReward.resolveStartFloor(progress20))")
if !rollbackOK { allOK = false }

print(allOK ? "✅ 오케스트레이션 스모크 전체 통과" : "❌ 스모크 실패")
exit(allOK ? 0 : 1)
