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
        // "챌린지 완료" 확인창은 시스템 .alert 가 아니라 커스텀 GbConfirm(05-modal-design).
        // iOS 18 런타임은 레거시 AX 속성으로 이걸 Alert 로 분류해 app.alerts[...] 가
        // 우연히 매칭됐지만, iOS 26 은 Other 로 분류한다("Automation type mismatch:
        // computed Other from legacy attributes vs Alert from modern attribute").
        // 버튼도 2버튼 리디자인(14-completion-delay)으로 "완료" 가 아니라
        // "사진없이 완료"/"사진으로 인증하고 완료"/"취소" — 라벨로 직접 탭한다
        // (launch() 가 ko 를 고정하므로 라벨 결정적).
        // 사진 인증 CTA — 구 "2초 로그" 시트의 현행 진입점. 구 시트(challengeLogPicker)
        // 는 폴라로이드 캡처 플로우로 대체돼 여는 코드가 없는 데드 코드라 단언 대상이
        // 될 수 없다(별도 정리 브랜치 존재). 진입점이 확인창 버튼으로 이동했으므로
        // 여기서 노출을 검증한다.
        XCTAssertTrue(app.buttons["사진으로 인증하고 완료"].waitForExistence(timeout: 3))

        let noPhoto = app.buttons["사진없이 완료"]
        XCTAssertTrue(noPhoto.waitForExistence(timeout: 3))
        noPhoto.tap()

        // 사진 없이 완료 → 보드가 완료 배너로 전환 (시드는 1장 선택이라 즉시 풀클리어).
        XCTAssertTrue(app.staticTexts["오늘의 챌린지 완료!"].waitForExistence(timeout: 4))
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
        // CI 는 키체인에 Firebase 세션이 없어 uid == nil → 듀오 카드가 로그인 게이트
        // 분기로 렌더되고 join 필드/버튼이 아예 존재하지 않는다(개발 머신은 이전
        // 세션의 키체인 로그인이 남아 우연히 통과). UITestFakeSignedIn 으로 로그인
        // 상태를 결정적으로 고정해 서명-인 UI 스모크라는 원래 의도를 유지한다.
        launch(["UITestFakeSignedIn"])
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
        // 러너 로케일 독립성 — 시뮬레이터 시스템 언어가 en 이면 SwiftUI `Text` 리터럴이
        // 카탈로그의 영어 번역("탭하여 완료"→"Tap to complete")으로 렌더되어 이 파일의
        // 한국어 문자열 단언이 전부 깨진다. i18n 감사로 en 번역이 채워지면서 드러났다
        // (그 전엔 미번역 키가 한국어 원문으로 폴백해 en 러너에서도 우연히 통과).
        // 시스템 번들(-AppleLanguages)과 인앱 언어(UITestLang)를 모두 ko 로 고정해
        // 어떤 러너 로케일에서도 결정적으로 렌더한다.
        arguments += ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        if !extraArguments.contains(where: { $0.hasPrefix("UITestLang=") }) {
            arguments.append("UITestLang=ko")
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
