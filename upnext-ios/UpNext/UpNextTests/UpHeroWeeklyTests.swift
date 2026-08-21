//
//  UpHeroWeeklyTests.swift
//  UpNextTests — 주간 악몽 던전 (Phase 11c 이식) 단위 테스트.
//
//  기대값은 웹 ground truth 실행 결과로 고정:
//    npx tsx → src/types/uphero.ts getISOWeekId/computeWeeklyScore,
//    src/data/weeklyAffixes.ts pickWeeklyAffix.
//  (scripts/verify-equivalence.sh 의 uphero/affix-narrative suite 가 함수 자체의
//   웹↔Swift 동치를 넓게 검증하고, 여기는 회귀 가드 + 세션 배선을 좁게 고정한다.)
//

import XCTest
@testable import UpNext

@MainActor
final class UpHeroWeeklyTests: XCTestCase {

    /// 로컬 달력 y/m/d → Date. 웹 `new Date(y, m-1, d)` (로컬 자정)과 동일 semantics.
    private func localDate(_ y: Int, _ m: Int, _ d: Int) -> Date {
        var dc = DateComponents()
        dc.year = y; dc.month = m; dc.day = d
        return Calendar.current.date(from: dc)!
    }

    // MARK: - getISOWeekId (웹 npx tsx 실행값 고정)

    func testISOWeekIdMatchesWebGroundTruth() {
        let cases: [(Int, Int, Int, String)] = [
            (2026, 8, 20, "2026-W34"),   // 이번 작업 시점 주차
            (2026, 1, 1, "2026-W01"),    // 목요일 — 그 해 W01
            (2025, 12, 29, "2026-W01"),  // 월요일 — 다음 해 W01 로 넘어감
            (2024, 12, 31, "2025-W01"),
            (2026, 12, 31, "2026-W53"),  // 2026 은 53주 해
            (2021, 1, 1, "2020-W53"),    // 금요일 — 전 해 W53 에 속함
            (2027, 1, 3, "2026-W53"),
            (2027, 1, 4, "2027-W01"),
        ]
        for (y, m, d, expected) in cases {
            XCTAssertEqual(UpHeroRules.getISOWeekId(localDate(y, m, d)), expected,
                           "\(y)-\(m)-\(d)")
        }
    }

    func testISOWeekIdFormatMatchesRulesRegex() {
        // firestore.rules 의 weekId regex(^\d{4}-W\d{2}$) 와 반드시 맞아야 업로드 허용.
        let id = UpHeroRules.getISOWeekId()
        XCTAssertNotNil(id.range(of: #"^[0-9]{4}-W[0-9]{2}$"#, options: .regularExpression))
    }

    // MARK: - pickWeeklyAffix (weekId 기반 결정론 — 전 유저·웹과 동일 affix)

    func testPickWeeklyAffixMatchesWebGroundTruth() {
        let cases: [(String, String)] = [
            ("2026-W34", "fragile_world"),
            ("2026-W01", "time_pressure"),
            ("2025-W01", "iron_will"),
            ("2026-W53", "long_march"),
            ("2027-W01", "chaos_treasures"),
        ]
        for (week, affixId) in cases {
            XCTAssertEqual(WeeklyAffixes.pickWeeklyAffix(weekId: week).id, affixId, week)
        }
    }

    // MARK: - computeWeeklyScore (웹 실행값 고정)

    func testComputeWeeklyScoreMatchesWebGroundTruth() {
        XCTAssertEqual(UpHeroRules.computeWeeklyScore(
            floorsCleared: 30, remainingTime: 100, heroLevel: 30), 7000)
        XCTAssertEqual(UpHeroRules.computeWeeklyScore(
            floorsCleared: 0, remainingTime: 220, heroLevel: 1), 442)
        XCTAssertEqual(UpHeroRules.computeWeeklyScore(
            floorsCleared: 1, remainingTime: 50, heroLevel: 40), 3400)
    }

    // MARK: - 주간 세션 생성 (enterWeeklyVariant 가 넘기는 옵션의 엔진 결과)

    func testWeeklySessionShape() {
        let hero = UpHeroRules.createDefaultHero(language: .ko)
        var rng = SystemRandom()
        let session = UpHeroSession.createSession(
            dungeonId: .fitness, hero: hero, startFloor: 30,
            activeBuffs: nil,
            options: CreateSessionOptions(
                ngPlusLevel: 0, isWeeklyVariant: true,
                weeklyAffixId: "time_pressure", heroLevel: 12),
            rng: &rng)

        // 업로드 가드(session.isWeeklyVariant == true)가 살아나는 핵심 플래그.
        XCTAssertEqual(session.isWeeklyVariant, true)
        XCTAssertEqual(session.weeklyAffixId, "time_pressure")
        XCTAssertEqual(session.startFloor, 30)
        XCTAssertEqual(session.ngPlusLevel, 0)
        XCTAssertEqual(session.heroLevel, 12)

        // affix 적용 — time_pressure: maxTime = round(220 × 0.7) = 154.
        XCTAssertEqual(session.maxTime, 154)
        XCTAssertLessThanOrEqual(session.time, session.maxTime)

        // F30 보스 선삽입 + paused (보스 등장 연출 대기) — 없으면 보스전이 영영 안 뜬다.
        let bossFloors: [Int] = session.log.compactMap {
            if case let .boss(_, floor, _) = $0 { return floor }
            return nil
        }
        XCTAssertEqual(bossFloors, [30])
        XCTAssertEqual(session.status, .paused)
    }

    func testNormalSessionHasNoWeeklyFlag() {
        let hero = UpHeroRules.createDefaultHero(language: .ko)
        var rng = SystemRandom()
        let session = UpHeroSession.createSession(
            dungeonId: .fitness, hero: hero, startFloor: 1,
            activeBuffs: [],
            options: CreateSessionOptions(
                ngPlusLevel: 0, isWeeklyVariant: nil, weeklyAffixId: nil, heroLevel: 1),
            rng: &rng)
        XCTAssertNotEqual(session.isWeeklyVariant, true)
        XCTAssertTrue(session.log.allSatisfy {
            if case .boss = $0 { return false }
            return true
        })
    }

    // MARK: - 계정 삭제 정리 — 주차 열거 (WeeklyLeaderboardService.deleteAllMyEntries)

    func testAllWeekIdsSinceLaunchCoversLaunchToCurrentWeek() {
        let ids = WeeklyLeaderboardService.allWeekIdsSinceLaunch()
        // 리더보드 출시(2026-04, 첫 rules 배포) 이전 주부터 현재 주까지 빠짐없이.
        XCTAssertTrue(ids.contains("2026-W01"))
        XCTAssertTrue(ids.contains(UpHeroRules.getISOWeekId()))
        // 전부 rules regex 포맷 — 아니면 delete 경로가 조용히 어긋난다.
        for id in ids {
            XCTAssertNotNil(id.range(of: #"^[0-9]{4}-W[0-9]{2}$"#, options: .regularExpression), id)
        }
        // 중복 없음 + 열거 크기 sanity (7일 스텝 — 주당 정확히 1개).
        XCTAssertEqual(ids.count, Set(ids).count)
        XCTAssertGreaterThanOrEqual(ids.count, 30)
        XCTAssertLessThan(ids.count, 600)   // 배치 청크(400) 2개 이내 — 수년 뒤에도 안전
    }
}
