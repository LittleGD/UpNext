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
    func testPendingInviteSurvivesLoginResetAndRelaunchUntilDismissed() {
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
