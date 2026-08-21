import XCTest

/// 리텐션(불꽃·리포트·듀오) + 챌린지 완료 흐름 스모크.
///
/// 모든 단언은 접근성 식별자만 쓴다 — 앱이 기기 로케일이 아닌 인앱 언어로 렌더되고
/// (ContentView 의 `.environment(\.locale)`), 시뮬레이터 기본 언어가 한국어가 아니면
/// 한국어 카피 매칭이 통째로 빗나가기 때문. 식별자 기반이면 ko/en/ja/zh 어느 기기에서도
/// 동일하게 통과한다.
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

    /// 챌린지 완료 확인은 시스템 `.alert` 이 아니라 GbConfirm 오버레이(05-modal-design)이고,
    /// 사진 인증은 완료 이후의 "2초 로그" 시트가 아니라 확인창의 옵트인 CTA 다
    /// (14-completion-delay / b5373e4). 두 갈래가 다 살아있는지 확인한다.
    func testChallengeCompletionOffersPhotoLogCTA() {
        launch(["UITestSeedBoard"])

        let card = app.buttons["boardCard"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 6))
        card.tap()

        XCTAssertTrue(app.buttons["challengeCompleteWithPhotoButton"].waitForExistence(timeout: 3))

        // 시뮬레이터엔 카메라가 없어 사진 경로는 켜지 않는다 — 사진 없는 완료로 카드가
        // 완료 상태로 뒤집히는지까지 확인.
        app.buttons["challengeCompleteWithoutPhotoButton"].tap()
        XCTAssertTrue(app.buttons["boardCardCompleted"].waitForExistence(timeout: 3))
    }

    func testWeekBoundaryShowsWeeklyReportCard() {
        launch(["UITestSeedReport", "UITestNow=2026-05-11"])
        goToRecordTab()

        let reportCard = app.buttons["weeklyReportCard"]
        XCTAssertTrue(reportCard.waitForExistence(timeout: 6))
        reportCard.tap()
        XCTAssertTrue(app.staticTexts["weeklyReportSheetTitle"].waitForExistence(timeout: 3))
    }

    func testChallengeLogAlbumBadgeSmoke() {
        launch(["UITestSeedChallengeLog"])

        app.buttons["collectionTabButton"].tap()
        app.buttons["albumTabButton"].tap()

        XCTAssertTrue(app.buttons["challengeLogBadge"].waitForExistence(timeout: 4))
    }

    /// 비로그인(익명) 사용자에게 2인 불꽃은 로그인 게이트로 보인다 — 초대/참여 컨트롤 대신
    /// 로그인 유도 버튼만. 과거엔 버튼이 조용히 no-op 이었던 자리(53a6d93).
    func testDuoAnonymousShowsLoginGate() {
        launch()
        goToRecordTab()

        let gate = app.buttons["duoCreateInviteButton"]
        XCTAssertTrue(gate.waitForExistence(timeout: 6))
        XCTAssertFalse(app.textFields["duoJoinCodeField"].exists)

        gate.tap()
        XCTAssertTrue(app.buttons["loginOverlaySkipButton"].waitForExistence(timeout: 3))
    }

    /// 초대/참여 컨트롤은 `auth.uid != nil` 일 때만 렌더된다 — UITestSignedIn 시드로 로그인
    /// 상태를 고정해 진입한다.
    func testDuoInviteAndJoinSmoke() {
        launch(["UITestSignedIn"])
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
}
