import XCTest

final class RetentionFlowUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
    }

    func testFirstEntryCheckInUpdatesStreak() {
        launch()
        goToRecordTab()

        let button = app.buttons["todayFlameButton"]
        XCTAssertTrue(button.waitForExistence(timeout: 6))
        button.tap()

        XCTAssertTrue(app.staticTexts["lightStreakLabel"].waitForExistence(timeout: 2))
    }

    func testChallengeCompletionShowsTwoSecondLogCTA() {
        launch(["UITestSeedBoard"])

        let completeHint = app.staticTexts["탭하여 완료"].firstMatch
        XCTAssertTrue(completeHint.waitForExistence(timeout: 6))
        completeHint.tap()
        tapButton(korean: "완료", english: "Done", in: app.alerts["챌린지 완료"])

        XCTAssertTrue(app.buttons["challengeLogPicker"].waitForExistence(timeout: 3))
    }

    func testWeekBoundaryShowsWeeklyReportCard() {
        launch(["UITestSeedReport", "UITestNow=2026-05-11"])
        goToRecordTab()

        XCTAssertTrue(app.buttons["weeklyReportCard"].waitForExistence(timeout: 6))
        app.buttons["weeklyReportCard"].tap()
        XCTAssertTrue(app.staticTexts["지난주 리포트"].waitForExistence(timeout: 2))
    }

    func testChallengeLogAlbumBadgeSmoke() {
        launch(["UITestSeedChallengeLog"])

        app.buttons["collectionTabButton"].tap()
        app.buttons["albumTabButton"].tap()

        XCTAssertTrue(app.buttons["challengeLogBadge"].waitForExistence(timeout: 4))
    }

    func testDuoInviteAndJoinSmoke() {
        launch()
        goToRecordTab()

        XCTAssertTrue(app.buttons["duoCreateInviteButton"].waitForExistence(timeout: 6))
        XCTAssertTrue(app.textFields["duoJoinCodeField"].exists)
        XCTAssertTrue(app.buttons["duoJoinButton"].exists)
    }

    /// 리텐션(불꽃·리포트·듀오) UI 는 '불꽃' 탭으로 이전됨 — 테스트도 해당 탭으로 이동.
    private func goToRecordTab() {
        let tab = app.buttons["recordTabButton"]
        if tab.waitForExistence(timeout: 6) { tab.tap() }
    }

    private func launch(_ extraArguments: [String] = []) {
        var arguments = ["UITestBypassAuth"]
        if !extraArguments.contains(where: { $0.hasPrefix("UITestNow=") }) {
            arguments.append("UITestNow=2026-05-19")
        }
        app.launchArguments = arguments + extraArguments
        app.launch()
    }

    private func tapButton(korean: String, english: String, in container: XCUIElement) {
        let localized = container.buttons[korean]
        if localized.waitForExistence(timeout: 2) {
            localized.tap()
            return
        }
        container.buttons[english].tap()
    }
}
