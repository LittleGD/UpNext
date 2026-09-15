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

    // 아래 테스트는 @MainActor 클래스를 만들고 테스트 안에서 해제한다. MainActor 기본
    // 격리에서 컴파일러가 붙인 isolated deinit 은 배포 타깃 17 때문에 백포트 경로
    // (swift_task_deinitOnExecutorMainActorBackDeploy) 를 타는데, iOS 26.2 이하 런타임은
    // 동기 XCTest 함수 안(Task 밖)에서 이 경로를 밟으면 TaskLocal::StopLookupScope 에서
    // SIGABRT 로 죽는다 (swiftlang/swift#87316, #85663). CI 러너가 26.2 라 여기서만 깨졌다.
    // async 로 두면 해제가 Task 안에서 일어나 안전하다. await 가 없어도 async 를 지우지 말 것.
    func testFirstAndSecondCompletionsSurviveRestartWithoutRepeatingDismissedPrompts() async {
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

    func testRapidCompletionsQueueBothInOrder() async {
        let setup = RetentionSetup(defaults: defaults)
        setup.challengeCompleted(total: 1)
        setup.challengeCompleted(total: 2)
        XCTAssertEqual(setup.queue, [.notifications, .widget])
        setup.finish(.notifications)
        XCTAssertEqual(setup.queue, [.widget])
    }

    func testDismissClearsOnlyTheVisibleOverlayAndKeepsTheNextInvitation() async {
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

    func testNotificationSettingsHandoffKeepsSelectedTimeAcrossRestart() async {
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

    func testExistingUsersDoNotReceiveHistoricalMilestones() async {
        let setup = RetentionSetup(defaults: defaults)
        XCTAssertTrue(setup.queue.isEmpty)
        for count in [0, 3, 15, 200] { setup.challengeCompleted(total: count) }
        XCTAssertTrue(setup.queue.isEmpty)
    }

    func testWidgetHandoffRestoresUntilDismissedAndCanBeReopenedFromSettings() async {
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
