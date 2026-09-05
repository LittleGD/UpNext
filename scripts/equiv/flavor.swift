// flavor.swift — Phase 2.4 flavor 디코더 구조 동치성 검증 (Swift 측).
// Flavor.json 을 FlavorPool.loadData(custom Decodable)로 디코드 → 구조적 사실 dump.
// 컴파일: Card+Game+UpHero+UpHeroRNG+FlavorPool  ↔  scripts/flavor-check.mjs

import Foundation

let fd = FlavorPool.loadData(
    from: URL(fileURLWithPath: "upnext-ios/UpNext/UpNext/Flavor.json"))

var lines: [String] = []
var kinds: [String: Int] = [:]
var totEvents = 0, totOptions = 0, totOutcomes = 0

func bump(_ k: String) { kinds[k, default: 0] += 1 }

func simpleKind(_ e: SimpleChoiceEffect) -> String {
    switch e {
    case .reward: return "reward"
    case .damage: return "damage"
    case .heal: return "heal"
    case .time: return "time"
    case .skipFloors: return "skipFloors"
    case .revealBoss: return "revealBoss"
    case .nothing: return "nothing"
    }
}
func effectKind(_ e: ChoiceEffect) -> String {
    switch e {
    case .reward: return "reward"
    case .damage: return "damage"
    case .heal: return "heal"
    case .skipFloors: return "skipFloors"
    case .revealBoss: return "revealBoss"
    case .nothing: return "nothing"
    case .time: return "time"
    case .fight: return "fight"
    case .flee: return "flee"
    case .startMinigame: return "startMinigame"
    // 웹 flavor-check 는 e.kind 를 그대로 찍는다 (fmtFx 도 default: e.kind).
    case .spinSlot: return "spinSlot"
    }
}
func countEffect(_ e: ChoiceEffect) {
    bump(effectKind(e))
    if case let .startMinigame(_, _, succ, fail) = e {
        for s in succ { bump(simpleKind(s)) }
        for s in fail { bump(simpleKind(s)) }
    }
}
func walk(_ events: [DungeonEvent]) {
    for ev in events {
        totEvents += 1
        for opt in ev.options {
            totOptions += 1
            if let effect = opt.effect { countEffect(effect) }
            for o in opt.outcomes ?? [] {
                totOutcomes += 1
                for e in o.effects { countEffect(e) }
            }
        }
    }
}
func fmtFx(_ e: ChoiceEffect) -> String {
    switch e {
    case let .reward(coins, xp, _):
        return "reward(\(coins.map(String.init) ?? "-"),\(xp.map(String.init) ?? "-"))"
    case let .damage(amount): return "damage(\(amount))"
    case let .heal(amount): return "heal(\(amount))"
    case let .time(delta): return "time(\(delta))"
    case let .skipFloors(count): return "skipFloors(\(count))"
    case let .flee(successChance): return "flee(\(successChance))"
    case let .startMinigame(minigame, difficulty, succ, fail):
        return "startMinigame(\(minigame.rawValue),\(difficulty),s\(succ.count),f\(fail.count))"
    case .revealBoss: return "revealBoss"
    case .nothing: return "nothing"
    case .fight: return "fight"
    case .spinSlot: return "spinSlot"
    }
}

let dg = ["fitness", "learning", "mindfulness", "nutrition", "social", "productivity", "wellness", "trending"]
for d in dg {
    let pool = fd.eventPool[d] ?? []
    lines.append("eventPool:\(d) = \(pool.count)")
    walk(pool)
}
lines.append("universal = \(fd.universalEvents.count)")
walk(fd.universalEvents)
lines.append("mystery = \(fd.mysteryEvents.count)")
walk(fd.mysteryEvents)
for d in dg {
    let np = fd.narrativePool[d]?.count ?? 0
    let npi = fd.narrativePoolIds[d]?.count ?? 0
    lines.append("narrative:\(d) = \(np)/\(npi)")
}
lines.append("treasure = \(fd.treasureDescriptions.count)/\(fd.treasureIds.count)")
lines.append("rest = \(fd.restDescriptions.count)/\(fd.restIds.count)")
lines.append("ambience = \(fd.campAmbienceKeys.count)")
lines.append("totals = ev\(totEvents) opt\(totOptions) out\(totOutcomes)")
let kindStr = kinds.keys.sorted().map { "\($0):\(kinds[$0]!)" }.joined(separator: " ")
lines.append("effectKinds = \(kindStr)")

// 깊은 샘플
let mst0 = fd.mysteryEvents[0]
lines.append("mst0.prompt = \(mst0.prompt)")
lines.append("mst0.promptKey = \(mst0.promptKey ?? "nil")")
lines.append("mst0.opt0.label = \(mst0.options[0].label)")
lines.append("mst0.opt0.out0.w = \(mst0.options[0].outcomes![0].weight)")
lines.append("mst0.opt0.out0.fx = \(mst0.options[0].outcomes![0].effects.map(fmtFx).joined(separator: "|"))")
lines.append("fit1.opt0.effect = \(fmtFx(fd.eventPool["fitness"]![1].options[0].effect!))")
lines.append("univ0.prompt = \(fd.universalEvents[0].prompt)")

print(lines.joined(separator: "\n"))
