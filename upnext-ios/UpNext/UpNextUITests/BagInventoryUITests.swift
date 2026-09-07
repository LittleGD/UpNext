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

        // 배치 버튼은 선택 직후에만 나타난다.
        let actionBar = element("bagActionBar")
        XCTAssertTrue(actionBar.waitForExistence(timeout: 3))
        let placeButton = element("bagMove")
        XCTAssertTrue(placeButton.waitForExistence(timeout: 3))
        placeButton.tap()

        // 배치를 누른 뒤에도 보드는 그대로 서 있어야 한다(액션바가 접히며 리사이즈되지 않는다).
        XCTAssertTrue(element("bagBoard").exists)
    }

    func testEquipAndUnequipStayVisibleAndPreserveSelection() {
        launch()
        let tile = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'bagTile_'" )).firstMatch
        XCTAssertTrue(tile.waitForExistence(timeout: 15))
        tile.tap()
        let inspector = element("bagInspector")
        XCTAssertTrue(inspector.exists)
        let equip = element("bagEquip")
        XCTAssertTrue(equip.isHittable)
        equip.tap()
        let unequip = element("bagUnequip")
        XCTAssertTrue(unequip.waitForExistence(timeout: 5))
        XCTAssertTrue(unequip.isHittable)
        capture("equipped-selection")
        unequip.tap()
        XCTAssertTrue(element("bagEquip").waitForExistence(timeout: 5))
        XCTAssertTrue(element("bagInspector").exists)
    }

    func testUnequipResetsRotationToTheReturnedItem() {
        launch()
        XCTAssertTrue(element("bagBoard").waitForExistence(timeout: 15))
        let tiles = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'bagTile_'"))
        guard let horizontal = tiles.allElementsBoundByIndex.first(where: { $0.frame.width > $0.frame.height * 1.5 }) else {
            return XCTFail("Expected the seeded horizontal weapon")
        }
        let id = horizontal.identifier
        horizontal.tap()
        element("bagEquip").tap()
        XCTAssertTrue(element("bagUnequip").waitForExistence(timeout: 5))
        element("bagUnequip").tap()
        let returned = element(id)
        XCTAssertTrue(returned.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(returned.frame.height, returned.frame.width * 1.5)
        element("bagRotate").tap()
        let destination = app.buttons["4열 1행, 비어 있음"]
        XCTAssertTrue(destination.isHittable)
        destination.tap()
        XCTAssertGreaterThan(returned.frame.width, returned.frame.height * 1.5,
                             "One rotation after unequipping must turn the returned vertical item horizontal")
        capture("unequip-then-rotate")
    }

    func testItemStatsAndComparisonOpenFromInspector() {
        launch()
        let tile = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'bagTile_'" )).firstMatch
        XCTAssertTrue(tile.waitForExistence(timeout: 15))
        tile.tap()
        element("bagInspector").tap()
        XCTAssertTrue(element("bagDetailEquip").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["장착 시 능력치"].exists)
        XCTAssertTrue(app.staticTexts["장착하면 달라지는 능력치"].exists)
        capture("item-detail")
        element("bagDetailClose").tap()
        XCTAssertTrue(element("bagMove").waitForExistence(timeout: 5))
    }

    func testGuideExplainsConnectionsAndSynthesis() {
        launch()
        XCTAssertTrue(element("bagInspector").waitForExistence(timeout: 15))
        element("bagInspector").tap()
        XCTAssertTrue(app.staticTexts["같은 활동끼리"].waitForExistence(timeout: 5))
        capture("connection-guide")
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["사진으로 여러 장비 돕기"].exists)
        capture("photo-guide")
    }

    func testExpandedBagKeepsControlsReachableInEnglish() {
        launch(["UITestSeedBagMax", "UITestLang=en"])
        XCTAssertTrue(element("bagBoard").waitForExistence(timeout: 15))
        let tile = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'bagTile_'" )).firstMatch
        tile.tap()
        XCTAssertTrue(element("bagEquip").isHittable)
        XCTAssertTrue(element("bagInspector").isHittable)
        capture("expanded-bag")
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
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
        let english = extraArguments.contains("UITestLang=en")
        arguments += ["-AppleLanguages", english ? "(en)" : "(ko)", "-AppleLocale", english ? "en_US" : "ko_KR"]
        if !extraArguments.contains(where: { $0.hasPrefix("UITestLang=") }) { arguments.append("UITestLang=ko") }
        app.launchArguments = arguments + extraArguments
        app.launch()
    }
}
