//
//  WeeklyNightmareUITests.swift
//  UpNextUITests — 주간 악몽 던전 진입 배선 검증 (Phase 11c 이식).
//
//  시드: UITestSeedWeekly — fitness F30 클리어 이력(해금) + 현재 주 weeklyVariant.
//  검증 대상 배선: 아지트 ribbon → WeeklyNightmareView → 던전 탭 →
//  UpHeroStore.enterWeeklyVariant(isWeeklyVariant=true 세션 생성) → DungeonView 전환.
//

import XCTest

final class WeeklyNightmareUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
    }

    /// ribbon 이 아지트 홈에 노출되고, 탭하면 주간 악몽 진입 view 가 열린다.
    func testRibbonOpensWeeklyNightmareView() {
        launch(["UITestSeedWeekly"])
        goToPlaygroundTab()

        let ribbon = app.buttons["weeklyNightmareRibbon"]
        XCTAssertTrue(ribbon.waitForExistence(timeout: 6))
        ribbon.tap()

        XCTAssertTrue(app.buttons["weeklyLeaderboardButton"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["weeklyDungeon-fitness"].exists)
    }

    /// 해금된 던전 탭 → 세션 생성 → 전투 화면(DungeonView) 전환.
    /// ("VS" 는 카탈로그 미등록 리터럴 — 언어 무관 전투 화면 마커.)
    func testEligibleDungeonTapStartsWeeklySession() {
        launch(["UITestSeedWeekly", "UITestCampNightmare"])
        goToPlaygroundTab()

        let fitness = app.buttons["weeklyDungeon-fitness"]
        XCTAssertTrue(fitness.waitForExistence(timeout: 6))
        fitness.tap()

        XCTAssertTrue(app.staticTexts["VS"].waitForExistence(timeout: 6))
    }

    /// 뱃지가 "F30 미도달"인 타일도 *글로벌* 해금(아무 던전 F30 클리어)이면 진입된다 —
    /// 웹 파리티: 타일 뱃지는 던전별 표시일 뿐, 실제 게이트는 enterWeeklyVariant 의
    /// 글로벌 f30EverCleared (useUpHeroStore.ts:1213-1222).
    func testDimmedTileStillEntersWithGlobalUnlock() {
        launch(["UITestSeedWeekly", "UITestCampNightmare"])
        goToPlaygroundTab()

        // 시드는 fitness 만 F30 클리어 — learning 타일은 dimmed 지만 탭 가능·진입 가능.
        let dimmed = app.buttons["weeklyDungeon-learning"]
        XCTAssertTrue(dimmed.waitForExistence(timeout: 6))
        dimmed.tap()

        XCTAssertTrue(app.staticTexts["VS"].waitForExistence(timeout: 6))
    }

    /// 글로벌 잠김(어느 던전도 F30 미클리어) — dead-end 방지: 타일은 탭 가능하되
    /// 화면 전환 없이 토스트 안내만 (웹 Phase 11c R2 · "not-unlocked" 분기).
    func testGloballyLockedTapStaysWithToast() {
        launch(["UITestSeedWeeklyLocked", "UITestCampNightmare"])
        goToPlaygroundTab()

        let tile = app.buttons["weeklyDungeon-fitness"]
        XCTAssertTrue(tile.waitForExistence(timeout: 6))
        tile.tap()

        // 전투로 전환되지 않고 진입 view 에 머무른다.
        XCTAssertTrue(app.buttons["weeklyDungeon-fitness"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.staticTexts["VS"].exists)
    }

    // MARK: - 헬퍼 (RetentionFlowUITests 패턴)

    private func goToPlaygroundTab() {
        let tab = app.buttons["playgroundTabButton"]
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
