//
//  EquipmentRepairTests.swift
//  UpNextTests — Phase 6-E (Track E) 장비/도감 수리 (EquipmentRepair.swift).
//
//  웹 src/lib/upHeroMigrations.test.ts 의 픽스처 그대로. iOS 는 버전 게이트 없이
//  loadPersisted / adoptCloudState 가 매번 돌리므로 멱등성이 핵심 계약이다.
//

import XCTest
@testable import UpNext

@MainActor
final class EquipmentRepairTests: XCTestCase {

    private func legacyRobe(id: String = "eq_침묵의로브_rare_123_45",
                            name: String = "빛나는 침묵의 로브 of 힘",
                            rarity: Rarity = .rare, type: EquipSlot = .armor,
                            iconName: String = "Hanger", stats: [StatKey: Int] = [.int: 14, .str: 2],
                            baseId: String? = nil, photoId: String? = nil,
                            dropFloor: Int? = nil) -> Equipment {
        Equipment(id: id, name: name, baseId: baseId, type: type, rarity: rarity,
                  category: .mindfulness, iconName: iconName, stats: stats, effects: nil,
                  flavor: nil, photoId: photoId, enhanceLevel: nil, enhanceFailStreak: nil,
                  affix: nil, affixes: nil, talismanSkills: nil, dropFloor: dropFloor)
    }

    // MARK: - repairItem

    func testLegacyIdResolvesTemplateAndSeedsBaseIdIconDropFloor() {
        let out = EquipmentRepair.repairItem(legacyRobe())
        XCTAssertEqual(out.baseId, "silence_robe")
        XCTAssertEqual(out.iconName, "Shirt")
        // (14 / 1.4 - 5) * 2 = 10 — 부동소수 오차로 9 가 될 수 있어 [9, 10].
        XCTAssertNotNil(out.dropFloor)
        XCTAssertGreaterThanOrEqual(out.dropFloor ?? -1, 9)
        XCTAssertLessThanOrEqual(out.dropFloor ?? 99, 10)
        XCTAssertNil(out.stats[.slotBonus])
    }

    func testBaseIdWinsOverLegacyId() {
        let out = EquipmentRepair.repairItem(legacyRobe(id: "weird", baseId: "grain_armor"))
        XCTAssertEqual(out.iconName, "Wall")
        XCTAssertEqual(out.baseId, "grain_armor")
    }

    func testNoTemplateFallsBackToIconRemapOnly() {
        let out = EquipmentRepair.repairItem(legacyRobe(id: "custom_1", name: "이상한 것"))
        XCTAssertEqual(out.iconName, "Shirt")
        XCTAssertNil(out.baseId)
        XCTAssertNil(out.dropFloor)
        let keep = EquipmentRepair.repairItem(legacyRobe(id: "custom_2", iconName: "Sword"))
        XCTAssertEqual(keep.iconName, "Sword")
        // UUID id (iOS 생성) 는 legacy 파서에 걸리지 않는다.
        XCTAssertNil(EquipmentPool.findTemplateByLegacyId("eq_침묵의로브_rare_\(UUID().uuidString)"))
    }

    func testTalismanSlotBonusIsAtLeastOne() {
        let t = EquipmentRepair.repairItem(legacyRobe(
            id: "eq_평정의부적_normal_1_2", name: "평정의 부적", rarity: .normal, type: .talisman,
            iconName: "Moon", stats: [.agi: 5]))
        XCTAssertEqual(t.stats[.slotBonus], 1)
        XCTAssertEqual(t.baseId, "serenity_charm")
        XCTAssertEqual(t.iconName, "Moon")
        let two = EquipmentRepair.repairItem(legacyRobe(id: "x", type: .talisman, stats: [.agi: 5, .slotBonus: 2]))
        XCTAssertEqual(two.stats[.slotBonus], 2)
    }

    func testPhotoTalismanKeepsIdentityAndSeedsSlotBonus() {
        let out = EquipmentRepair.repairItem(legacyRobe(
            id: "photoTal_1", name: "달리기…", rarity: .rare, type: .talisman,
            iconName: "Camera", stats: [.str: 6], photoId: "p-1"))
        XCTAssertEqual(out.photoId, "p-1")
        XCTAssertEqual(out.iconName, "Camera")
        XCTAssertNil(out.baseId)
        XCTAssertNil(out.dropFloor)
        XCTAssertEqual(out.stats[.slotBonus], 1)
    }

    func testExistingDropFloorIsKept() {
        XCTAssertEqual(EquipmentRepair.repairItem(legacyRobe(dropFloor: 33)).dropFloor, 33)
    }

    // MARK: - estimateDropFloor (Track B enhancePrimaryGrowthTotal 보정)

    private var sword: EquipmentTemplate { EquipmentPool.findTemplate(baseId: "self_control_sword")! }

    private func swordItem(str: Int, rarity: Rarity, level: Int? = nil) -> Equipment {
        var e = legacyRobe(id: "s", name: "검", rarity: rarity, type: .weapon, iconName: "Sword", stats: [.str: str])
        e.enhanceLevel = level
        return e
    }

    func testEstimateInvertsDropFormulaAndSubtractsEnhanceGrowth() {
        // round((5 + 20 * 0.5) * 1.6) = 24
        XCTAssertEqual(EquipmentRepair.estimateDropFloor(swordItem(str: 24, rarity: .rare), template: sword), 20)
        let growth = UpHeroRules.enhancePrimaryGrowthTotal(level: 15)
        XCTAssertEqual(growth, 10)
        XCTAssertEqual(EquipmentRepair.estimateDropFloor(
            swordItem(str: 24 + growth, rarity: .rare, level: 15), template: sword), 20)
        // 보정하지 않았다면 (34/1.6 - 5) * 2 = 32.5 → 33 층으로 틀렸을 것.
        XCTAssertEqual(EquipmentRepair.estimateDropFloor(
            swordItem(str: 24 + growth, rarity: .rare), template: sword), 33)
        // legend mult 3: F30 → 60; +20 growth 15 → 75
        XCTAssertEqual(EquipmentRepair.estimateDropFloor(
            swordItem(str: 75, rarity: .legend, level: 20), template: sword), 30)
    }

    func testEstimateClampsAndNilWithoutPrimary() {
        XCTAssertEqual(EquipmentRepair.estimateDropFloor(swordItem(str: 1, rarity: .normal), template: sword), 0)
        XCTAssertEqual(EquipmentRepair.estimateDropFloor(swordItem(str: 999, rarity: .normal), template: sword), 60)
        var noPrimary = swordItem(str: 0, rarity: .normal)
        noPrimary.stats = [.int: 9]
        XCTAssertNil(EquipmentRepair.estimateDropFloor(noPrimary, template: sword))
    }

    // MARK: - 목록 / 슬롯 맵 / 도감

    func testListAndEquippedRepair() {
        XCTAssertEqual(EquipmentRepair.repairList([legacyRobe()]).first?.iconName, "Shirt")
        let eq = EquipmentRepair.repairEquipped([.armor: legacyRobe()])
        XCTAssertEqual(eq[.armor]?.iconName, "Shirt")
        XCTAssertNil(eq[.weapon])
        XCTAssertEqual(EquipmentRepair.repairEquipped([:]), [:])
    }

    func testCodexKeysNormalizeToTemplateBaseNames() {
        XCTAssertEqual(EquipmentRepair.repairCodexEquipment([
            "자기절제의 검 of 민첩, 힘", "빛나는 곡물의 갑옷", "eq_지혜의안경_rare_1_2", "???",
        ]), ["자기절제의 검", "곡물의 갑옷", "지혜의 안경"])
        XCTAssertEqual(EquipmentRepair.repairCodexEquipment([
            "곡물의 갑옷", "신성한 곡물의 갑옷 +12", "메모의 펜", "곡물의 갑옷",
        ]), ["곡물의 갑옷", "메모의 펜"])
        XCTAssertEqual(EquipmentRepair.normalizeCodexEquipmentKey("전설적 메모의 펜 +20"), "메모의 펜")
        XCTAssertNil(EquipmentRepair.normalizeCodexEquipmentKey("eq_없는것_rare_1_2"))
        XCTAssertEqual(EquipmentRepair.repairCodexEquipment([]), [])
    }

    func testIdempotent() {
        let items = [
            legacyRobe(),
            legacyRobe(id: "eq_평정의부적_unique_9_9", type: .talisman, stats: [.agi: 20]),
            legacyRobe(id: "custom", iconName: "Grid"),
        ]
        let once = EquipmentRepair.repairList(items)
        XCTAssertEqual(EquipmentRepair.repairList(once), once)
        XCTAssertEqual(once[2].iconName, "Grid3x3")
        let keys = ["빛나는 곡물의 갑옷", "eq_지혜의안경_rare_1_2"]
        XCTAssertEqual(EquipmentRepair.repairCodexEquipment(EquipmentRepair.repairCodexEquipment(keys)),
                       EquipmentRepair.repairCodexEquipment(keys))
    }

    // MARK: - loadPersisted 경로 — uphero.json 에 'Hanger' 가 있어도 로드 시 수리된다

    func testLoadPersistedRepairsHandWrittenSaveFile() throws {
        var s = UpHeroStore.makeDefaultState()
        s.inventory = [legacyRobe()]
        s.hero.equipped[.talisman] = legacyRobe(
            id: "eq_평정의부적_normal_1_2", name: "평정의 부적", rarity: .normal, type: .talisman,
            iconName: "Moon", stats: [.agi: 5])
        s.codex.equipment = ["빛나는 곡물의 갑옷 of 힘", "eq_지혜의안경_rare_1_2"]
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("uphero.json")
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(PersistedUpHeroState(s)).write(to: url, options: .atomic)
        defer { try? FileManager.default.removeItem(at: url) }

        let store = UpHeroStore()
        XCTAssertEqual(store.state.inventory.first?.iconName, "Shirt")
        XCTAssertEqual(store.state.inventory.first?.baseId, "silence_robe")
        XCTAssertEqual(store.state.hero.equipped[.talisman]?.stats[.slotBonus], 1)
        XCTAssertEqual(store.state.codex.equipment, ["곡물의 갑옷", "지혜의 안경"])
        XCTAssertEqual(store.state.overflowDrops, [])
        store.resetForSignOut()
    }

    /// 클라우드 채택 경로도 같은 수리를 거친다 (구 클라이언트가 옛 iconName 을 올릴 수 있다).
    func testAdoptCloudStateRepairs() throws {
        let json = #"{"inventory": [{"id": "eq_침묵의로브_rare_123_45", "name": "빛나는 침묵의 로브 of 힘", "type": "armor", "rarity": "rare", "category": "mindfulness", "iconName": "Hanger", "stats": {"int": 14, "str": 2}}], "codex": {"monsters": [], "equipment": ["신성한 곡물의 갑옷 +12"], "bosses": []}}"#
        let cloud = try JSONDecoder().decode(CloudUpHeroState.self, from: Data(json.utf8))
        let store = UpHeroStore()
        store.resetAllData()
        store.adoptCloudState(cloud)
        XCTAssertEqual(store.state.inventory.first?.iconName, "Shirt")
        XCTAssertEqual(store.state.codex.equipment, ["곡물의 갑옷"])
        store.resetAllData()
    }
}
