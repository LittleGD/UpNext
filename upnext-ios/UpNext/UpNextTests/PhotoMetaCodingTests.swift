import XCTest
@testable import UpNext

final class PhotoMetaCodingTests: XCTestCase {
    func testChallengeLogEncodingDecoding() throws {
        let card = try XCTUnwrap(CardCatalog.allCards.first)
        let meta = PhotoMeta(
            id: "cl_roundtrip",
            kind: .challengeLog,
            challengeCardId: card.id,
            challengeTitle: card.title,
            category: card.category,
            date: "2026-05-19",
            timestamp: 123,
            memo: "short caption",
            timeSlot: "09:10",
            caption: "short caption",
            weekId: "2026-05-18"
        )

        let data = try JSONEncoder().encode(meta)
        let decoded = try JSONDecoder().decode(PhotoMeta.self, from: data)

        XCTAssertEqual(decoded, meta)
        XCTAssertEqual(decoded.kind, .challengeLog)
        XCTAssertEqual(decoded.challengeCardId, card.id)
        XCTAssertEqual(decoded.challengeTitle, card.title)
        XCTAssertEqual(decoded.category, card.category)
        XCTAssertEqual(decoded.timeSlot, "09:10")
        XCTAssertEqual(decoded.caption, "short caption")
        XCTAssertEqual(decoded.weekId, "2026-05-18")
    }

    func testLegacyPhotoMetaDefaultsToFreeKind() throws {
        let data = Data("""
        {
          "id": "vp_legacy",
          "date": "2026-05-19",
          "timestamp": 1,
          "memo": ""
        }
        """.utf8)

        let decoded = try JSONDecoder().decode(PhotoMeta.self, from: data)

        XCTAssertEqual(decoded.kind, .free)
        XCTAssertNil(decoded.challengeCardId)
        XCTAssertNil(decoded.weekId)
    }
}
