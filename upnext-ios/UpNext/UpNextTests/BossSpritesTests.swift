//
//  BossSpritesTests.swift
//  UpNextTests — Phase 6-E (Track E, 피드백 29) 보스 스프라이트 카탈로그 형태/유일성.
//
//  웹 src/components/uphero/bossSprites.test.ts 미러. Models/BossSprites.swift 는 웹 리터럴
//  복사본이라 여기서 잡히면 양쪽 다 틀린 것 (datalayer 동치 suite 섹션 10 이 바이트 대조).
//

import XCTest
@testable import UpNext

final class BossSpritesTests: XCTestCase {

    private var bossIds: [String] { MonsterPool.allTemplates.filter(\.isBoss).map(\.id) }

    func testKeysMatchTheTwentyFourBossTemplates() {
        XCTAssertEqual(bossIds.count, 24)
        XCTAssertEqual(BossSprites.frames.keys.sorted(), bossIds.sorted())
    }

    func testEveryEntryIsTwoFramesOfTwelveByTwelve() {
        for (id, frames) in BossSprites.frames {
            XCTAssertEqual(frames.count, 2, id)
            for frame in frames {
                XCTAssertEqual(frame.count, 12, id)
                for row in frame {
                    XCTAssertEqual(row.count, 12, "\(id): \(row)")
                    XCTAssertTrue(row.allSatisfy { $0 == "#" || $0 == "." }, "\(id): \(row)")
                }
                let filled = frame.joined().filter { $0 == "#" }.count
                XCTAssertGreaterThanOrEqual(filled, 24, id)
            }
        }
    }

    func testFramesDifferAndSilhouettesAreUnique() {
        var seen: [String: String] = [:]
        let large = MonsterSprite.frames[.large]![0].joined(separator: "|")
        for (id, frames) in BossSprites.frames {
            let f1 = frames[0].joined(separator: "|")
            let f2 = frames[1].joined(separator: "|")
            XCTAssertNotEqual(f1, f2, "\(id): idle 애니메이션은 두 프레임이 달라야 한다")
            XCTAssertNil(seen[f1], "\(id) duplicates \(seen[f1] ?? "")")
            seen[f1] = id
            XCTAssertNotEqual(f1, large, "\(id) equals kind large")
        }
    }

    func testResolveFallsBackToKindFrames() {
        XCTAssertEqual(MonsterSprite.resolveFrames(kind: .large, templateId: nil), MonsterSprite.frames[.large]!)
        XCTAssertEqual(MonsterSprite.resolveFrames(kind: .beast, templateId: "fit_wolf"), MonsterSprite.frames[.beast]!)
        XCTAssertEqual(MonsterSprite.resolveFrames(kind: .large, templateId: "boss_mountain_wolf"),
                       BossSprites.frames["boss_mountain_wolf"]!)
        XCTAssertNil(BossSprites.frames(templateId: nil))
        XCTAssertNil(BossSprites.frames(templateId: "nope"))
    }
}
