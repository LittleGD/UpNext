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

    /// 챌린지 완료 확인 — GbConfirm 의 사진 인증 옵트인 2버튼 구조를 검증한다.
    /// 구 버전(testChallengeCompletionShowsTwoSecondLogCTA)은 시스템 .alert 확인 후
    /// PhotosPicker "2초 로그" 시트(challengeLogPicker)를 기대했으나, 그 시트의 진입점은
    /// b5373e4 에서 사라졌고 사진 인증은 beginCapture(카메라) 플로우로 대체됐다.
    /// ①("사진으로 인증하고 완료")은 카메라 권한/세션이 필요해 시뮬레이터에서 불안정하므로
    /// 존재만 확인하고, 완료 커밋 자체는 ②("사진없이 완료")로 검증한다.
    func testChallengeCompletionOffersPhotoOptIn() {
        launch(["UITestSeedBoard"])

        let completeHint = app.staticTexts["탭하여 완료"].firstMatch
        XCTAssertTrue(completeHint.waitForExistence(timeout: 6))
        completeHint.tap()

        XCTAssertTrue(app.staticTexts["챌린지 완료"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["사진으로 인증하고 완료"].exists)

        let completeWithoutPhoto = app.buttons["사진없이 완료"]
        XCTAssertTrue(completeWithoutPhoto.exists)
        completeWithoutPhoto.tap()

        // 완료되면 카드의 "탭하여 완료" CTA 가 사라지고 완료 배지로 교체된다.
        XCTAssertTrue(completeHint.waitForNonExistence(timeout: 3))
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
        // 인앱 언어를 고정한다 — 이 스위트의 단언 문자열("탭하여 완료", "지난주 리포트" 등)이
        // 한국어 리터럴인데, 미지정 시 GameStore.bootLanguage() 가 기기 로케일을 따라가
        // 영어 시뮬레이터에서 전부 빗나갔다(언어 비결정성).
        var arguments = ["UITestBypassAuth"]
        if !extraArguments.contains(where: { $0.hasPrefix("UITestLang=") }) {
            arguments.append("UITestLang=ko")
        }
        if !extraArguments.contains(where: { $0.hasPrefix("UITestNow=") }) {
            arguments.append("UITestNow=2026-05-19")
        }
        app.launchArguments = arguments + extraArguments
        app.launch()
    }
}
