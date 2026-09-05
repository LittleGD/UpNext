import XCTest

/// Up Hero 격자 가방 — 보드가 실제로 그려지고 탭 → 배치 경로가 살아 있는지.
///
/// 단언은 **접근성 식별자만** 쓴다. 가방 화면 문구는 4개 언어로 번역돼 있어 한국어
/// 리터럴로 찾으면 러너 로케일에 따라 깨진다(RetentionFlowUITests 의 교훈).
final class BagInventoryUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
    }

    /// 보드가 뜨고 시드한 가방 타일이 실제로 그려진다.
    func testBagBoardRendersSeededTiles() {
        launch()

        XCTAssertTrue(element("bagBoard").waitForExistence(timeout: 15))
        let tiles = app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier BEGINSWITH 'bagTile_'"))
        XCTAssertTrue(tiles.firstMatch.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(tiles.count, 4, "시드한 가방 타일 8개 중 일부라도 보여야 한다")
        // 트레이·액션바는 선택과 무관하게 항상 마운트된다 (보드 리사이즈 방지).
        XCTAssertTrue(element("bagTray").exists)
        XCTAssertTrue(element("bagActionBar").exists)
    }

    /// 타일 탭 = 선택 → 액션바에 배치 버튼이 뜨고 눌린다(=placing 진입).
    /// "빈 칸을 탭해서 놓으세요" 힌트는 선택이 없을 때만 그려지는 자리라(웹 동일)
    /// 문구가 아니라 **버튼 존재/동작**으로 검증한다.
    func testTapTileEnablesPlaceAction() {
        launch()

        let tile = app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier BEGINSWITH 'bagTile_'")).firstMatch
        XCTAssertTrue(tile.waitForExistence(timeout: 10))
        tile.tap()

        // 액션바 첫 버튼(배치)은 선택 직후에만 존재한다 — 유휴 상태에선 힌트 한 줄뿐.
        let actionBar = element("bagActionBar")
        XCTAssertTrue(actionBar.waitForExistence(timeout: 3))
        let placeButton = actionBar.buttons.element(boundBy: 0)
        XCTAssertTrue(placeButton.waitForExistence(timeout: 3))
        placeButton.tap()

        // 배치를 누른 뒤에도 보드는 그대로 서 있어야 한다(액션바가 접히며 리사이즈되지 않는다).
        XCTAssertTrue(element("bagBoard").exists)
    }

    /// SwiftUI 컨테이너는 요소 타입이 런타임마다 갈린다(other/group/…) — 타입을 고정하지 않는다.
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func launch(_ extraArguments: [String] = []) {
        var arguments = [
            "UITestBypassAuth", "UITestSeedCamp", "UITestSeedGear",
            "UITestTabPlayground", "UITestOpenGear",
        ]
        arguments += ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR", "UITestLang=ko"]
        app.launchArguments = arguments + extraArguments
        app.launch()
    }
}
