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

print(allOK ? "✅ 오케스트레이션 스모크 전체 통과" : "❌ 스모크 실패")
exit(allOK ? 0 : 1)
