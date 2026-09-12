import XCTest
final class DuoInviteUITests: XCTestCase {
    func testLinkOpensInvitationAndSurvivesRelaunch() throws {
        guard #available(iOS 16.4, *) else { throw XCTSkip("Opening URLs requires iOS 16.4") }
        let app = XCUIApplication()
        app.launchArguments = ["UITestBypassAuth", "UITestSeedBoard", "UITestLang=ko"]
        app.launch()
        app.open(URL(string: "upnext://invite/ABCD23")!)
        XCTAssertTrue(app.buttons["duoAcceptLinkButton"].waitForExistence(timeout: 10))
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "duo-link-invitation"; capture.lifetime = .keepAlways; add(capture)
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["duoAcceptLinkButton"].waitForExistence(timeout: 10))
        app.buttons["duoDismissLinkButton"].tap()
        XCTAssertFalse(app.buttons["duoAcceptLinkButton"].exists)
        app.open(URL(string: "upnext://invite/ABC123")!)
        XCTAssertFalse(app.buttons["duoAcceptLinkButton"].exists)
    }
}
