import XCTest
@testable import UpNext

@MainActor
final class RetentionEngineTests: XCTestCase {
    func testCheckInSameDayNoOp() {
        let first = RetentionEngine.checkIn(.fresh(today: "2026-05-19"), today: "2026-05-19")
        let second = RetentionEngine.checkIn(first.state, today: "2026-05-19")

        XCTAssertTrue(first.changed)
        XCTAssertFalse(second.changed)
        XCTAssertEqual(second.state.currentLightStreak, 1)
        XCTAssertEqual(second.state.checkInDates, ["2026-05-19"])
    }

    func testConsecutiveDayIncrementsStreak() {
        let dayOne = RetentionEngine.checkIn(.fresh(today: "2026-05-19"), today: "2026-05-19")
        let dayTwo = RetentionEngine.checkIn(dayOne.state, today: "2026-05-20")

        XCTAssertEqual(dayTwo.state.currentLightStreak, 2)
        XCTAssertEqual(dayTwo.state.bestLightStreak, 2)
        XCTAssertFalse(dayTwo.usedSaver)
    }

    func testOneMissedDayConsumesSaver() {
        let dayOne = RetentionEngine.checkIn(.fresh(today: "2026-05-19"), today: "2026-05-19")
        let repaired = RetentionEngine.checkIn(dayOne.state, today: "2026-05-21")

        XCTAssertTrue(repaired.usedSaver)
        XCTAssertEqual(repaired.state.currentLightStreak, 2)
        XCTAssertEqual(repaired.state.streakSavers, RetentionEngine.maxMonthlySavers - 1)
        XCTAssertEqual(repaired.state.usedSaverDates, ["2026-05-20"])
    }

    func testLongGapResetsStreak() {
        let dayOne = RetentionEngine.checkIn(.fresh(today: "2026-05-19"), today: "2026-05-19")
        let reset = RetentionEngine.checkIn(dayOne.state, today: "2026-05-24")

        XCTAssertFalse(reset.usedSaver)
        XCTAssertEqual(reset.state.currentLightStreak, 1)
        XCTAssertEqual(reset.state.bestLightStreak, 1)
    }

    func testMonthlySaverRefresh() {
        var state = RetentionState.fresh(today: "2026-04-30")
        state.streakSavers = 0

        let refreshed = RetentionEngine.refreshMonthlySavers(state, today: "2026-05-01")

        XCTAssertEqual(refreshed.streakSavers, RetentionEngine.maxMonthlySavers)
        XCTAssertEqual(refreshed.saverRefreshMonth, "2026-05")
    }

    func testWeeklyReportSummaryGeneration() throws {
        let card = try XCTUnwrap(CardCatalog.allCards.first)
        var progress = GameStore.makeDefaultProgress()
        progress.completionHistory = [
            DayRecord(
                date: "2026-05-05",
                selectedCardIds: [card.id],
                completedCardIds: [card.id],
                wasFullClear: true,
                mode: .normal
            ),
        ]
        var retention = RetentionState.fresh(today: "2026-05-11")
        retention.checkInDates = ["2026-05-04", "2026-05-05", "2026-05-09"]
        retention.usedSaverDates = ["2026-05-06"]
        let photos = [
            PhotoMeta(
                id: "cl_test",
                kind: .challengeLog,
                challengeCardId: card.id,
                challengeTitle: card.title,
                category: card.category,
                date: "2026-05-07",
                timestamp: 1,
                memo: "done",
                weekId: "2026-05-04"
            ),
        ]

        let updated = RetentionEngine.generatePreviousWeekReport(
            retention: retention,
            progress: progress,
            photos: photos,
            today: "2026-05-11"
        )
        let report = try XCTUnwrap(updated.weeklyReports.first)

        XCTAssertEqual(report.weekStart, "2026-05-04")
        XCTAssertEqual(report.weekEnd, "2026-05-10")
        XCTAssertEqual(report.checkInCount, 3)
        XCTAssertEqual(report.completedCardCount, 1)
        XCTAssertEqual(report.topCategory, card.category)
        XCTAssertEqual(report.highlightCardTitle, card.title)
        XCTAssertEqual(report.photoLogCount, 1)
        XCTAssertTrue(report.usedSaver)
    }
}
