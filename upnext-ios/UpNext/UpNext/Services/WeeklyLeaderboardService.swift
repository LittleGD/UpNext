//
//  WeeklyLeaderboardService.swift
//  UpNext — 주간 악몽 던전 Firestore 리더보드 데이터 계층 (17-leaderboard-dummy).
//
//  웹 src/lib/weeklyLeaderboard.ts 1:1 이식. 그동안 iOS 는 UI 셸만 있고 데이터 계층이
//  전혀 이식되지 않아 WeeklyLeaderboardView 가 하드코딩 mock(민지/수아…)을 가드 없이
//  프로덕션에 노출했다(블로커). 이 파일이 read(fetchWeeklyTop/fetchMyRank) + write
//  (uploadWeeklyScore) 를 채워 실데이터로 전환한다.
//
//  Firestore 경로: `weekly-leaderboard/{weekId}/entries/{uid}`
//    { uid, displayName, score, floorsCleared, heroLevel, classType, clearedAt }
//  rules 는 이미 배포됨(firestore.rules:155) — read: if true, write: 인증 uid 매칭 +
//  공식 상한 검증. 여기 sanitize 는 rules rejection(빌드된 read 낭비)을 전송 전에 막는다.
//
//  DuoStore(FirebaseFirestore 직접 사용) 패턴 재사용. Firestore 자체는 앱에 풀 연결됨.
//

import Foundation
import FirebaseFirestore
import FirebaseAuth

/// 리더보드 엔트리 — 웹 `WeeklyLeaderboardEntry` 대응. Firestore 문서 1:1.
struct WeeklyLeaderboardEntry: Identifiable, Equatable {
    var uid: String
    var displayName: String
    var score: Int
    var floorsCleared: Int
    var heroLevel: Int
    var classType: String?   // ClassType.rawValue 또는 nil (legacy/미전직)
    var clearedAt: Int       // epoch ms
    var id: String { uid }
}

enum WeeklyLeaderboardService {

    /// 업로드 결과 — 웹 uploadWeeklyScore 반환값 대응.
    enum UploadResult { case ok, noAuth, error }

    // 웹 sanitizeEntry(weeklyLeaderboard.ts:53-90) 의 공식 상한 상수와 동일.
    private static let maxFloors = 30
    private static let maxHeroLevel = 500
    private static let completionBonus = 2000
    private static let timeBonusCap = 440           // BASE_EXPEDITION_TIME 220 × 2
    private static let minClearedAt = 1_704_067_200_000  // 2024-01-01

    private static var db: Firestore { Firestore.firestore() }

    /// 현재 로그인 여부 — 뷰의 빈 상태 문구 분기(참여 유도)에 사용. FirebaseAuth 를
    /// 뷰가 직접 import 하지 않도록 서비스가 노출.
    static var isSignedIn: Bool { Auth.auth().currentUser != nil }

    private static func entriesCollection(_ weekId: String) -> CollectionReference {
        db.collection("weekly-leaderboard").document(weekId).collection("entries")
    }

    // MARK: - Read

    /// 이번 주 상위 N명 — orderBy(score desc), limit. 익명도 read 가능(rules read: if true).
    /// 웹 fetchWeeklyTop(weeklyLeaderboard.ts:190-227). corrupted doc 은 디코딩 가드로 필터.
    static func fetchWeeklyTop(weekId: String, limit: Int = 100) async -> [WeeklyLeaderboardEntry] {
        do {
            let q = entriesCollection(weekId)
                .order(by: "score", descending: true)
                .limit(to: limit)
            let snap = try await q.getDocuments()
            return snap.documents.compactMap { decodeEntry($0.data()) }
        } catch {
            #if DEBUG
            print("[WeeklyLeaderboardService] fetchWeeklyTop failed: \(error)")
            #endif
            return []
        }
    }

    /// 내 순위 — top100 밖일 때 하단 표기용. count aggregation 으로 O(1) billed read
    /// (전체 getDocuments 로 O(N) 읽지 않는다 — 웹 R1 주석 참고, weeklyLeaderboard.ts:232-236).
    /// tie-break: 동점 중 clearedAt 이 내 것보다 빠른(먼저 클리어한) 유저 수를 더한다.
    static func fetchMyRank(weekId: String) async -> (rank: Int, entry: WeeklyLeaderboardEntry)? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        do {
            let col = entriesCollection(weekId)
            let myDoc = try await col.document(uid).getDocument()
            guard myDoc.exists, let mine = decodeEntry(myDoc.data() ?? [:]) else { return nil }

            // score > myScore 인 doc 수 (count aggregation).
            let higherSnap = try await col
                .whereField("score", isGreaterThan: mine.score)
                .count.getAggregation(source: .server)
            // 동점 tie-break — 같은 점수 중 clearedAt 이 내 것보다 먼저인 유저 수.
            let tieSnap = try await col
                .whereField("score", isEqualTo: mine.score)
                .whereField("clearedAt", isLessThan: mine.clearedAt)
                .count.getAggregation(source: .server)

            let rank = Int(truncating: higherSnap.count)
                + Int(truncating: tieSnap.count) + 1
            return (rank, mine)
        } catch {
            #if DEBUG
            print("[WeeklyLeaderboardService] fetchMyRank failed: \(error)")
            #endif
            return nil
        }
    }

    // MARK: - Write

    /// 세션 클리어(최고 점수 경신) 시 fire-and-forget 업로드. 웹 uploadWeeklyScore
    /// (weeklyLeaderboard.ts:121-161) + getDisplayName(L307-317). 비로그인이면 skip,
    /// 공식 상한으로 clamp, displayName 40자 cap. rules allowlist 와 일치하는 키만 write.
    /// displayName 은 Auth.currentUser.displayName 에서 해석(없으면 anonymousFallback —
    /// 웹처럼 유저의 앱 언어로 i18n 된 "익명 영웅" 라벨을 caller 가 전달).
    @discardableResult
    static func uploadWeeklyScore(
        weekId: String,
        score: Int,
        floorsCleared: Int,
        heroLevel: Int,
        classType: String?,
        clearedAt: Int,
        anonymousFallback: String
    ) async -> UploadResult {
        guard let user = Auth.auth().currentUser else { return .noAuth }
        let uid = user.uid

        // 웹 sanitizeEntry — 범위 밖이면 업로드 skip, 유효하면 score 를 공식 상한으로 clamp.
        let floors = floorsCleared
        guard floors >= 0, floors <= maxFloors,
              heroLevel >= 1, heroLevel <= maxHeroLevel,
              score >= 0, clearedAt >= minClearedAt else { return .error }
        let cap = floors * 100 + completionBonus + timeBonusCap + heroLevel * heroLevel * 2
        let clampedScore = min(score, cap)

        // displayName 40자 cap(악성 profile 방어) + 빈 값이면 i18n 익명 라벨.
        let raw = user.displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let safeName = String((raw.isEmpty ? anonymousFallback : raw).prefix(40))

        var doc: [String: Any] = [
            "uid": uid,
            "displayName": safeName,
            "score": clampedScore,
            "floorsCleared": floors,
            "heroLevel": heroLevel,
            "clearedAt": clearedAt,
        ]
        // classType 은 known enum 일 때만 포함(rules: null 또는 알려진 enum).
        if let classType, !classType.isEmpty { doc["classType"] = classType }

        do {
            try await entriesCollection(weekId).document(uid).setData(doc)  // merge:false
            return .ok
        } catch {
            #if DEBUG
            print("[WeeklyLeaderboardService] upload failed: \(error)")
            #endif
            return .error
        }
    }

    // MARK: - Delete (계정 삭제 정리 — GameStore.deleteAccount cloudCleanup 에서 호출)

    /// 유저의 리더보드 entry 를 *모든 주차*에서 제거. entry 는 displayName·점수가
    /// `read: if true` 로 전체 공개라, 계정 삭제 후 남기면 영구 공개 고아 PII 가 된다
    /// (Auth 삭제 뒤엔 rules 의 uid 매칭 delete 를 아무도 통과할 수 없어 지금이 유일한 시점).
    ///
    /// weekId 는 결정론적 ISO 주차라 열거 가능 — 컬렉션 그룹 쿼리/인덱스 없이 기능 출시
    /// 주(2026-W01)부터 다음 주까지 blind delete 배치를 커밋한다 (존재하지 않는 doc 의
    /// delete 는 Firestore 에서 no-op 허용).
    /// ⚠️ rules 의 `allow delete`(uid 매칭) 분기가 배포돼 있어야 성공한다 — firestore.rules
    /// 수정 커밋 ≠ 배포. 미배포면 batch 전체가 permission-denied 로 실패해 false 반환.
    static func deleteAllMyEntries() async -> Bool {
        guard let uid = Auth.auth().currentUser?.uid else { return true }  // 비로그인 — 정리 대상 없음
        let weekIds = allWeekIdsSinceLaunch()
        do {
            // Firestore 배치 상한 500 op — 여유롭게 400 단위로 쪼갠다 (수년 뒤에도 안전).
            var index = 0
            while index < weekIds.count {
                let chunk = weekIds[index..<min(index + 400, weekIds.count)]
                let batch = db.batch()
                for weekId in chunk {
                    batch.deleteDocument(entriesCollection(weekId).document(uid))
                }
                try await batch.commit()
                index += 400
            }
            return true
        } catch {
            #if DEBUG
            print("[WeeklyLeaderboardService] deleteAllMyEntries failed: \(error)")
            #endif
            return false
        }
    }

    /// 리더보드 출시 주(2026-W01)부터 now+7일(기기 시계 skew 여유)까지의 ISO week id 열거.
    /// 7일 간격 스텝은 ISO 주를 정확히 한 번씩 지나므로 누락 없음. 시작점 2025-12-29(월)는
    /// 첫 rules 배포(2026-04)보다 충분히 앞선 안전 마진.
    static func allWeekIdsSinceLaunch(now: Date = Date()) -> [String] {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        var dc = DateComponents()
        dc.year = 2025; dc.month = 12; dc.day = 29
        guard let launch = utc.date(from: dc) else { return [UpHeroRules.getISOWeekId(now)] }
        var ids: [String] = []
        var cursor = launch
        let end = now.addingTimeInterval(7 * 86_400)
        while cursor <= end {
            let id = UpHeroRules.getISOWeekId(cursor)
            if ids.last != id { ids.append(id) }
            cursor = cursor.addingTimeInterval(7 * 86_400)
        }
        return ids
    }

    // MARK: - Decode 가드 (웹 isValidEntry — corrupted/legacy doc 필터)

    private static func decodeEntry(_ data: [String: Any]) -> WeeklyLeaderboardEntry? {
        guard let uid = data["uid"] as? String,
              let displayName = data["displayName"] as? String,
              let score = intField(data["score"]),
              let floors = intField(data["floorsCleared"]),
              let heroLevel = intField(data["heroLevel"]),
              let clearedAt = intField(data["clearedAt"]) else { return nil }
        // classType: 없음/null/string 모두 허용(legacy doc 호환).
        let classType = data["classType"] as? String
        return WeeklyLeaderboardEntry(
            uid: uid, displayName: displayName, score: score,
            floorsCleared: floors, heroLevel: heroLevel,
            classType: classType, clearedAt: clearedAt)
    }

    /// Firestore 정수 필드 안전 추출 — NSNumber(Int64)로 받아 큰 epoch ms 도 손실 없이.
    private static func intField(_ value: Any?) -> Int? {
        if let n = value as? NSNumber { return Int(truncatingIfNeeded: n.int64Value) }
        if let i = value as? Int { return i }
        if let d = value as? Double { return Int(d) }
        return nil
    }
}
