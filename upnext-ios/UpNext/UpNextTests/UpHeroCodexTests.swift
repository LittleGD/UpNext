//
//  UpHeroCodexTests.swift
//  UpNextTests — Phase 6-E (Track E, 피드백 18) 도감 장비 키.
//
//  웹 src/data/upHeroEquipment.test.ts (getEquipmentBaseName) · src/lib/sessionReward.test.ts
//  (calculateCodexDelta) 의 iOS 미러. baseName 픽스처 6개는 datalayer 동치 suite 섹션 9 와
//  같은 입력이다.
//

import XCTest
@testable import UpNext

final class UpHeroCodexTests: XCTestCase {

    private func eq(_ id: String, name: String, rarity: Rarity, baseId: String? = nil,
                    photoId: String? = nil) -> Equipment {
        Equipment(id: id, name: name, baseId: baseId, type: .weapon, rarity: rarity,
                  category: .fitness, iconName: "Sword", stats: [.str: 5], effects: nil,
                  flavor: nil, photoId: photoId, enhanceLevel: nil, enhanceFailStreak: nil,
                  affix: nil, affixes: nil, talismanSkills: nil)
    }

    // MARK: - equipmentBaseName (웹 getEquipmentBaseName — 6 픽스처)

    func testBaseNameResolvesBaseIdFirst() {
        XCTAssertEqual(EquipmentPool.equipmentBaseName(
            name: "신성한 자기절제의 검 of 민첩, 힘 +7", rarity: .legend, baseId: "self_control_sword"),
            "자기절제의 검")
    }

    func testBaseNameStripsPrefixThenEnhanceThenAffix() {
        XCTAssertEqual(EquipmentPool.equipmentBaseName(
            name: "신성한 자기절제의 검 of 민첩, 힘 +7", rarity: .legend, baseId: nil), "자기절제의 검")
        XCTAssertEqual(EquipmentPool.equipmentBaseName(
            name: "빛나는 곡물의 갑옷 of 힘", rarity: .rare, baseId: nil), "곡물의 갑옷")
        XCTAssertEqual(EquipmentPool.equipmentBaseName(
            name: "꾸준함의 방패 +3", rarity: .normal, baseId: nil), "꾸준함의 방패")
        XCTAssertEqual(EquipmentPool.equipmentBaseName(
            name: "메모의 펜", rarity: .normal, baseId: nil), "메모의 펜")
    }

    func testBaseNameUnknownBaseIdFallsBackToNameRules() {
        XCTAssertEqual(EquipmentPool.equipmentBaseName(
            name: "빛나는 지혜의 안경 of 힘", rarity: .rare, baseId: "nope"), "지혜의 안경")
        XCTAssertEqual(EquipmentPool.equipmentBaseName(
            eq("x", name: "빛나는 지혜의 안경 of 힘", rarity: .rare, baseId: "nope")), "지혜의 안경")
    }

    // MARK: - calculateCodexDelta (웹 sessionReward.test.ts)

    private func drop(_ e: Equipment) -> LogEntry { .drop(equipment: e, timestamp: 0) }

    func testCodexDeltaRecordsBaseNamesFromLogAndDedupes() {
        let log: [LogEntry] = [
            drop(eq("a", name: "신성한 자기절제의 검 of 민첩, 힘", rarity: .legend, baseId: "self_control_sword")),
            drop(eq("b", name: "빛나는 곡물의 갑옷 of 힘", rarity: .rare)),
            drop(eq("c", name: "빛나는 곡물의 갑옷 of 지성", rarity: .rare)),
        ]
        let out = SessionReward.calculateCodexDelta(
            log: log, current: Codex(monsters: [], equipment: ["메모의 펜"], bosses: []))
        XCTAssertEqual(out.equipment, ["메모의 펜", "자기절제의 검", "곡물의 갑옷"])
    }

    func testCodexDeltaUnionsRewardDropsAndSkipsPhotoTalismans() {
        let photo = eq("p", name: "달리기…", rarity: .rare, photoId: "ph-1")
        let log: [LogEntry] = [drop(photo)]
        let rewardDrops = [
            eq("r1", name: "지혜의 안경", rarity: .normal, baseId: "wisdom_glasses"),
            photo,
            eq("r2", name: "지혜의 안경", rarity: .normal, baseId: "wisdom_glasses"),
        ]
        let out = SessionReward.calculateCodexDelta(
            log: log, current: Codex(monsters: [], equipment: [], bosses: []),
            rewardDrops: rewardDrops)
        XCTAssertEqual(out.equipment, ["지혜의 안경"])
        // 기본 인자 — rewardDrops 없이도 예전 시그니처 그대로 동작.
        XCTAssertEqual(SessionReward.calculateCodexDelta(
            log: log, current: Codex(monsters: [], equipment: [], bosses: [])).equipment, [])
    }
}
