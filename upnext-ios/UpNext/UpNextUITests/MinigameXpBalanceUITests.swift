import XCTest

final class MinigameXpBalanceUITests: XCTestCase {
    func testCappedRewardIsVisibleAndCanBeClaimed() {
        let app = XCUIApplication()
        app.launchArguments = [
            "UITestBypassAuth", "UITestSeedCamp", "UITestSeedTickets",
            "UITestTabPlayground", "UITestSeedMinigameResult", "UITestLang=ko",
            "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR",
        ]
        app.launch()
        let cardMatch = app.buttons["카드매치"]
        XCTAssertTrue(cardMatch.waitForExistence(timeout: 10))
        cardMatch.tap()
        let play = app.buttons["플레이"]
        XCTAssertTrue(play.waitForExistence(timeout: 5))
        play.tap()
        XCTAssertTrue(app.staticTexts["총 XP: 100"].waitForExistence(timeout: 5))
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "card-match-balanced-xp"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.buttons["받기"].tap()
        XCTAssertTrue(play.waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["총 XP: 100"].exists)
    }
}
