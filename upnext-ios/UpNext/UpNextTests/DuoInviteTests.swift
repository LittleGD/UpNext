import XCTest
@testable import UpNext
@MainActor final class DuoInviteTests: XCTestCase {
    func testWebAndAppLinksUseTheSameCode() {
        for link in ["https://up-next-phi.vercel.app/i/abcd23", "upnext://invite/ABCD23"] {
            XCTAssertEqual(DuoInviteLink.parse(URL(string: link)!), "ABCD23")
        }
        XCTAssertEqual(DuoInviteLink.url("ABCD23").absoluteString, "https://up-next-phi.vercel.app/i/ABCD23")
    }
    func testRejectsUntrustedURLs() {
        for link in ["https://up-next-phi.vercel.app.evil.com/i/ABCD23", "http://up-next-phi.vercel.app/i/ABCD23", "https://x@up-next-phi.vercel.app/i/ABCD23", "upnext://daily/ABCD23", "upnext://invite/ABC123"] {
            XCTAssertNil(DuoInviteLink.parse(URL(string: link)!))
        }
    }
    // 아래 테스트는 @MainActor 클래스를 만들고 테스트 안에서 해제한다. MainActor 기본
    // 격리에서 컴파일러가 붙인 isolated deinit 은 배포 타깃 17 때문에 백포트 경로
    // (swift_task_deinitOnExecutorMainActorBackDeploy) 를 타는데, iOS 26.2 이하 런타임은
    // 동기 XCTest 함수 안(Task 밖)에서 이 경로를 밟으면 TaskLocal::StopLookupScope 에서
    // SIGABRT 로 죽는다 (swiftlang/swift#87316, #85663). CI 러너가 26.2 라 여기서만 깨졌다.
    // async 로 두면 해제가 Task 안에서 일어나 안전하다. await 가 없어도 async 를 지우지 말 것.
    func testPendingInviteSurvivesLoginResetAndRelaunchUntilDismissed() async {
        let duo = DuoStore()
        duo.receiveInviteLink(URL(string: "upnext://invite/ABCD23")!)
        duo.reset()
        XCTAssertEqual(duo.pendingInviteCode, "ABCD23")
        let restored = DuoStore()
        XCTAssertEqual(restored.pendingInviteCode, "ABCD23")
        restored.dismissInviteLink()
        XCTAssertNil(DuoStore().pendingInviteCode)
    }
}
