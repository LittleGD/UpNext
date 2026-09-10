import XCTest

// Run on a dedicated simulator with no UpNext home widget. The permission-denial
// test starts with notification access either not determined or already denied.
final class RetentionSetupUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
    }

    func testFirstCompletionReminderThenSecondCompletionInteractiveWidgetGuide() {
        launch()
        completeChallenge()
        XCTAssertTrue(app.buttons["enableReminderButton"].waitForExistence(timeout: 10))
        app.buttons["reminderPreset-20:00"].tap()
        capture("01-reminder-time")
        let wasDenied = app.buttons["enableReminderButton"].label == "기기 알림 설정 열기"
        app.buttons["enableReminderButton"].tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.alerts.buttons["Allow"]
        if wasDenied { allowNotificationsInSettings() }
        else if allow.waitForExistence(timeout: 3) { allow.tap() }
        // Already denied on a previous simulator run: exercise the real Settings path.
        if !app.buttons["retentionSetupDone"].waitForExistence(timeout: 3) {
            app.buttons["enableReminderButton"].tap()
            allowNotificationsInSettings()
        }
        XCTAssertTrue(app.buttons["retentionSetupDone"].waitForExistence(timeout: 8))
        capture("02-reminder-scheduled")
        app.buttons["retentionSetupDone"].tap()
        completeChallenge()
        XCTAssertTrue(app.buttons["widgetTutorialNext"].waitForExistence(timeout: 10))
        capture("03-widget-hold")
        app.descendants(matching: .any)["widgetPracticeHold"].firstMatch.press(forDuration: 0.8)
        XCTAssertTrue(app.buttons["widgetPracticeEdit"].waitForExistence(timeout: 3))
        app.buttons["widgetPracticeEdit"].tap()
        capture("04-widget-edit-menu")
        app.buttons["widgetPracticeAddMenu"].tap()
        XCTAssertTrue(app.buttons["widgetPracticePlace"].waitForExistence(timeout: 3))
        app.segmentedControls["widgetPracticeSize"].buttons.element(boundBy: 0).tap()
        capture("05-widget-size-small")
        app.segmentedControls["widgetPracticeSize"].buttons.element(boundBy: 1).tap()
        app.buttons["widgetPracticePlace"].tap()
        XCTAssertTrue(app.staticTexts["widgetPracticeFinished"].waitForExistence(timeout: 3))
        capture("06-widget-placed-practice")
        app.buttons["widgetTutorialNext"].tap()
        XCTAssertTrue(app.buttons["checkWidgetButton"].waitForExistence(timeout: 3))
        capture("07-widget-real-instructions")
        app.buttons["checkWidgetButton"].tap()
        XCTAssertTrue(app.staticTexts["retentionSetupError"].waitForExistence(timeout: 6))
        XCTAssertFalse(app.buttons["retentionSetupDone"].exists, "Practice must never claim an actual widget was installed")
        app.terminate()
        app.launchArguments.removeAll { $0 == "UITestResetRetentionSetup" }
        app.launch()
        XCTAssertTrue(app.buttons["checkWidgetButton"].waitForExistence(timeout: 10), "Restore the handoff after relaunch")
        app.buttons["retentionSetupLater"].tap()
        XCTAssertTrue(app.buttons["settingsTabButton"].waitForExistence(timeout: 5))
        app.buttons["settingsTabButton"].tap()
        let guide = app.buttons["widgetSetupGuide"]
        if !guide.isHittable { app.swipeUp() }
        guide.tap()
        XCTAssertTrue(app.buttons["widgetTutorialNext"].waitForExistence(timeout: 6))
    }

    func testSkippingReminderStillShowsWidgetAfterSecondCompletion() {
        launch()
        completeChallenge()
        XCTAssertTrue(app.buttons["retentionSetupLater"].waitForExistence(timeout: 10))
        app.buttons["retentionSetupLater"].tap()
        completeChallenge()
        XCTAssertTrue(app.buttons["widgetTutorialNext"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["enableReminderButton"].exists)
    }

    func testEnglishWidgetGuideAndReducedMotion() {
        launch(["UITestRetentionSecond", "UITestLang=en", "-UIAccessibilityReduceMotionEnabled", "YES"])
        completeChallenge()
        XCTAssertTrue(app.buttons["widgetTutorialNext"].waitForExistence(timeout: 10))
        capture("08-widget-english")
        for _ in 0..<3 { app.buttons["widgetTutorialNext"].tap() }
        XCTAssertTrue(app.buttons["checkWidgetButton"].waitForExistence(timeout: 3))
        capture("09-widget-english-handoff")
    }

    func testDeniedPermissionCanRecoverThroughDeviceSettings() {
        launch()
        completeChallenge()
        XCTAssertTrue(app.buttons["enableReminderButton"].waitForExistence(timeout: 10))
        if app.buttons["enableReminderButton"].label != "기기 알림 설정 열기" {
            app.buttons["enableReminderButton"].tap()
            let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
            let deny = springboard.alerts.buttons["Don’t Allow"]
            let alternateDeny = springboard.alerts.buttons["Don't Allow"]
            if deny.waitForExistence(timeout: 3) { deny.tap() }
            else if alternateDeny.exists { alternateDeny.tap() }
        }
        XCTAssertTrue(app.staticTexts["알림을 다시 켜볼까요?"].waitForExistence(timeout: 5))
        capture("10-reminder-permission-denied")
        app.buttons["enableReminderButton"].tap()
        allowNotificationsInSettings()
        XCTAssertTrue(app.buttons["retentionSetupDone"].waitForExistence(timeout: 8))
        capture("11-reminder-settings-recovered")
    }

    func testWidgetInstallationIsDetectedAfterReturningFromHomeScreen() {
        launch(["UITestRetentionSecond"])
        completeChallenge()
        XCTAssertTrue(app.buttons["widgetTutorialNext"].waitForExistence(timeout: 10))
        for _ in 0..<3 { app.buttons["widgetTutorialNext"].tap() }
        XCTAssertTrue(app.buttons["checkWidgetButton"].waitForExistence(timeout: 3))
        XCUIDevice.shared.press(.home)
        let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        home.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.68)).press(forDuration: 1.2)
        let edit = home.buttons["Edit"]
        XCTAssertTrue(edit.waitForExistence(timeout: 5))
        edit.tap()
        let addWidget = home.buttons["Add Widget"]
        XCTAssertTrue(addWidget.waitForExistence(timeout: 3))
        addWidget.tap()
        let search = home.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 4))
        search.tap()
        search.typeText("UpNext")
        let result = home.cells["UpNext"].firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 5))
        result.tap()
        let confirmAdd = home.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Add Widget")).firstMatch
        XCTAssertTrue(confirmAdd.waitForExistence(timeout: 5))
        confirmAdd.tap()
        let done = home.buttons["Done"]
        if done.waitForExistence(timeout: 3) { done.tap() }
        let attachment = XCTAttachment(screenshot: home.screenshot())
        attachment.name = "12-widget-installed-on-home-screen"
        attachment.lifetime = .keepAlways
        add(attachment)
        app.activate()
        XCTAssertTrue(app.buttons["retentionSetupDone"].waitForExistence(timeout: 10))
        capture("13-widget-installation-confirmed")
    }

    private func allowNotificationsInSettings() {
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        let toggle = settings.switches.matching(NSPredicate(format: "label CONTAINS %@", "Allow Notifications")).firstMatch
        let notifications = settings.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Notifications")).firstMatch
        if !toggle.waitForExistence(timeout: 5) {
            if !notifications.exists {
                let apps = settings.buttons["com.apple.settings.apps"]
                for _ in 0..<5 where !apps.isHittable { settings.swipeUp() }
                if apps.exists { apps.tap() }
                let appRow = settings.buttons["UpNext"]
                let search = settings.searchFields.firstMatch
                if !appRow.isHittable, search.exists { search.tap(); search.typeText("UpNext") }
                if appRow.waitForExistence(timeout: 3) { appRow.tap() }
            }
            if notifications.waitForExistence(timeout: 3) { notifications.tap() }
        }
        XCTAssertTrue(toggle.waitForExistence(timeout: 6))
        if toggle.value as? String == "0" {
            // Settings exposes the whole labelled row as a switch; its center is
            // the label, so tap the actual trailing control.
            toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        }
        let enabled = NSPredicate(format: "value == %@", "1")
        XCTAssertTrue(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: enabled, object: toggle)], timeout: 3) == .completed)
        app.activate()
    }

    private func launch(_ extra: [String] = []) {
        app.launchArguments = ["UITestBypassAuth", "UITestRetentionSetup", "UITestResetRetentionSetup",
                               "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        if !extra.contains(where: { $0.hasPrefix("UITestLang=") }) { app.launchArguments += ["UITestLang=ko"] }
        app.launchArguments += extra
        app.launch()
    }

    private func completeChallenge() {
        let korean = app.staticTexts["탭하여 완료"].firstMatch
        let english = app.staticTexts["Tap to complete"].firstMatch
        if korean.waitForExistence(timeout: 6) { korean.tap() } else { english.tap() }
        let noPhoto = app.buttons["사진없이 완료"]
        if noPhoto.waitForExistence(timeout: 2) { noPhoto.tap() }
        else { app.buttons["Complete without photo"].tap() }
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
