import XCTest
@testable import UpNext

@MainActor
final class RetentionSetupTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suite: String!

    override func setUp() {
        super.setUp()
        suite = "RetentionSetupTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)!
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
        super.tearDown()
    }

    func testFirstAndSecondCompletionsSurviveRestartWithoutRepeatingDismissedPrompts() {
        let setup = RetentionSetup(defaults: defaults)
        setup.challengeCompleted(total: 1)
        setup.challengeCompleted(total: 1)
        XCTAssertEqual(setup.queue, [.notifications])
        let restored = RetentionSetup(defaults: defaults)
        XCTAssertEqual(restored.queue, [.notifications])
        restored.finish(.notifications)
        restored.challengeCompleted(total: 1)
        restored.challengeCompleted(total: 2)
        XCTAssertEqual(restored.queue, [.widget])
        restored.finish(.widget)
        let relaunched = RetentionSetup(defaults: defaults)
        relaunched.challengeCompleted(total: 2)
        relaunched.challengeCompleted(total: 3)
        XCTAssertTrue(relaunched.queue.isEmpty)
    }

    func testRapidCompletionsQueueBothInOrder() {
        let setup = RetentionSetup(defaults: defaults)
        setup.challengeCompleted(total: 1)
        setup.challengeCompleted(total: 2)
        XCTAssertEqual(setup.queue, [.notifications, .widget])
        setup.finish(.notifications)
        XCTAssertEqual(setup.queue, [.widget])
    }

    func testDismissClearsOnlyTheVisibleOverlayAndKeepsTheNextInvitation() {
        let setup = RetentionSetup(defaults: defaults)
        setup.challengeCompleted(total: 1)
        setup.challengeCompleted(total: 2)
        setup.presented = .notifications
        setup.reminderTime = "20:00"
        setup.dismiss()
        XCTAssertNil(setup.presented)
        XCTAssertNil(setup.reminderTime)
        XCTAssertEqual(setup.queue, [.widget])
        setup.dismiss()
        XCTAssertEqual(setup.queue, [.widget])
    }

    func testNotificationSettingsHandoffKeepsSelectedTimeAcrossRestart() {
        let setup = RetentionSetup(defaults: defaults)
        setup.challengeCompleted(total: 1)
        setup.reminderTime = "20:00"
        setup.waitingForNotificationSettings = true
        let restored = RetentionSetup(defaults: defaults)
        XCTAssertEqual(restored.queue, [.notifications])
        XCTAssertEqual(restored.reminderTime, "20:00")
        XCTAssertTrue(restored.waitingForNotificationSettings)
        restored.finish(.notifications)
        XCTAssertNil(restored.reminderTime)
        XCTAssertFalse(restored.waitingForNotificationSettings)
    }

    func testExistingUsersDoNotReceiveHistoricalMilestones() {
        let setup = RetentionSetup(defaults: defaults)
        XCTAssertTrue(setup.queue.isEmpty)
        for count in [0, 3, 15, 200] { setup.challengeCompleted(total: count) }
        XCTAssertTrue(setup.queue.isEmpty)
    }

    func testWidgetHandoffRestoresUntilDismissedAndCanBeReopenedFromSettings() {
        let setup = RetentionSetup(defaults: defaults)
        setup.challengeCompleted(total: 2)
        setup.widgetStep = 3
        let restored = RetentionSetup(defaults: defaults)
        XCTAssertEqual(restored.queue, [.widget])
        XCTAssertEqual(restored.widgetStep, 3)
        restored.finish(.widget)
        XCTAssertEqual(restored.widgetStep, 0)
        restored.openFromSettings(.widget)
        XCTAssertEqual(restored.queue, [.widget])
        XCTAssertEqual(restored.manualRequest, .widget)
    }
}
