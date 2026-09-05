// sync.swift — Phase 3.1 Firestore 스키마 동치성 검증 (Swift 측).
//
// FirestoreModels 의 UserDoc/DailyDoc 디코더로 픽스처 문서를 디코드 →
// FirestoreSchema.hydrateDaily/dehydrateDaily 처리 → 구조적 사실 dump.
// scripts/sync-check.mjs 가 같은 픽스처를 웹 sync.ts 로 처리한 출력과 비교.
//
// 컴파일: Card + Game + FirestoreModels  ↔  scripts/sync-check.mjs

import Foundation

// MARK: - 카드 카탈로그 (Cards.json 파일 경로 로드)
// CLI 검증기엔 Bundle.main 리소스가 없으므로 CardCatalog 대신 직접 로드 → lookup 주입.

struct CatFile: Decodable { let cards: [ChallengeCard] }

let catalog: [String: ChallengeCard] = {
    let url = URL(fileURLWithPath: "upnext-ios/UpNext/UpNext/Cards.json")
    guard let data = try? Data(contentsOf: url),
          let f = try? JSONDecoder().decode(CatFile.self, from: data) else {
        FileHandle.standardError.write(Data("FATAL: Cards.json 로드 실패\n".utf8))
        exit(1)
    }
    return Dictionary(f.cards.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
}()
let lookup: (String) -> ChallengeCard? = { catalog[$0] }

// MARK: - 픽스처 로드 + 문서별 분리
// corrupt 는 통째로 디코딩 시 throw 하므로 JSONSerialization 으로 문서를 분리.

let fxData = try! Data(contentsOf: URL(fileURLWithPath: "scripts/equiv/user-doc.json"))
let root = try! JSONSerialization.jsonObject(with: fxData) as! [String: Any]
func docData(_ key: String) -> Data {
    try! JSONSerialization.data(withJSONObject: root[key]!)
}

// MARK: - dump 헬퍼

var lines: [String] = []
let dec = JSONDecoder()

func ids(_ cards: [ChallengeCard]) -> String { cards.map(\.id).joined(separator: ",") }
func ob(_ x: Bool?) -> String { x.map { "\($0)" } ?? "nil" }
func sortedKV(_ d: [String: Int]) -> String {
    d.sorted { $0.key < $1.key }.map { "\($0.key):\($0.value)" }.joined(separator: " ")
}

func dumpDaily(_ tag: String, _ st: DailyState) {
    lines.append("\(tag).daily date=\(st.date) phase=\(st.challengePhase.rawValue) reroll=\(st.rerollUsed) nudge=\(st.extraNudgeScheduled) penalty=\(st.penaltyCardId ?? "nil")")
    lines.append("\(tag).daily drawn=\(ids(st.drawnCards)) selected=\(ids(st.selectedCards)) completed=\(st.completedIds.joined(separator: ","))")
    lines.append("\(tag).daily flags draw=\(st.isDrawComplete) sel=\(st.isSelectionComplete)")
    lines.append("\(tag).daily extra drawn=\(ids(st.extraDrawnCards)) sel=\(ids(st.extraSelectedCards)) done=\(st.extraCompletedIds.joined(separator: ",")) dc=\(st.extraDrawComplete) sc=\(st.extraSelectionComplete)")
    lines.append("\(tag).daily super drawn=\(ids(st.superDrawnCards)) sel=\(ids(st.superSelectedCards)) done=\(st.superCompletedIds.joined(separator: ",")) dc=\(st.superDrawComplete) sc=\(st.superSelectionComplete)")
    lines.append("\(tag).daily hasPenalty=\(st.hasPenalty)")
}

func dumpRedehydrate(_ tag: String, _ d: DailyDoc) {
    lines.append("\(tag).redehydrate drawnIds=\(d.drawnCardIds.joined(separator: ",")) phase=\(d.challengePhase.rawValue) penalty=\(d.penaltyCardId ?? "nil") nudge=\(d.extraNudgeScheduled)")
}

func dumpProgress(_ tag: String, _ p: UserProgress) {
    lines.append("\(tag).progress lvl=\(p.level) xp=\(p.xp) days=\(p.totalDaysCompleted) streak=\(p.currentStreak)/\(p.longestStreak) unlocked=\(p.unlockedCardIds.count) mode=\(p.mode.rawValue) lang=\(p.language.rawValue)")
    lines.append("\(tag).progress dtnl=\(p.daysTowardNextLevel) packs=\(p.pendingPacks) bonus=\(p.pendingBonusCards) full=\(p.pendingFullPacks) extraC=\(p.extraChallengesCompleted) superC=\(p.superChallengesCompleted)")
    lines.append("\(tag).progress titleEq=\(p.equippedTitleId ?? "nil") titlesSeen=\(p.seenTitleIds.count) pendPenalty=\(p.hasPendingPenalty) pendMode=\(p.pendingMode?.rawValue ?? "nil")")
    lines.append("\(tag).progress sound=\(p.soundEnabled) haptic=\(p.hapticEnabled) notif=\(p.notificationsEnabled) notifTime=\(p.notificationTime)")
    lines.append("\(tag).progress tickets=\(p.tickets) mgRuns=\(p.minigameRunsPlayed) mgBest=\(p.minigameBestMatches)")
    let shop = p.cardmatchShopDaily.map { "\($0.date):\($0.bought)" } ?? "nil"
    lines.append("\(tag).progress shop=\(shop) patch=\(p.lastSeenPatchVersion ?? "nil") collDone=\(p.collectionCompletedAt ?? "nil")")
    lines.append("\(tag).progress cats=\(sortedKV(p.categoryCompletions))")
    lines.append("\(tag).progress cardC=\(sortedKV(p.cardCompletions))")
    lines.append("\(tag).progress history=\(p.completionHistory.count)")
    for (i, r) in p.completionHistory.enumerated() {
        lines.append("\(tag).progress hist\(i)=\(r.date) mode=\(r.mode.rawValue) clear=\(r.wasFullClear) extra=\(ob(r.extraCompleted)) super=\(ob(r.superCompleted)) fail=\(ob(r.wasFailed))")
    }
}

// MARK: - full — 완전한 문서

do {
    let d = try dec.decode(UserDoc.self, from: docData("full"))
    lines.append("full valid=\(d.progress != nil) onboarding=\(ob(d.onboardingComplete)) device=\(d.meta?.lastDeviceId ?? "nil")")
    let st = FirestoreSchema.hydrateDaily(d.daily!, catalog: lookup)
    dumpDaily("full", st)
    dumpRedehydrate("full", FirestoreSchema.dehydrateDaily(st))
    dumpProgress("full", d.progress!)
} catch {
    lines.append("full DECODE FAILED: \(error)")
}

// MARK: - legacy — 옛 버전 최소 문서 (관대 디코딩 기본값 경로)

do {
    let d = try dec.decode(UserDoc.self, from: docData("legacy"))
    lines.append("legacy valid=\(d.progress != nil)")
    let st = FirestoreSchema.hydrateDaily(d.daily!, catalog: lookup)
    dumpDaily("legacy", st)
    dumpRedehydrate("legacy", FirestoreSchema.dehydrateDaily(st))
} catch {
    lines.append("legacy DECODE FAILED: \(error)")
}

// MARK: - corrupt — UserProgress 필수 필드 검증 실패 → UserDoc 디코딩 throw 기대

let corruptValid = (try? dec.decode(UserDoc.self, from: docData("corrupt"))) != nil
lines.append("corrupt valid=\(corruptValid)")

print(lines.joined(separator: "\n"))
