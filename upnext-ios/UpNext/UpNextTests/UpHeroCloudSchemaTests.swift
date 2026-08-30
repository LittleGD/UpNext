//
//  UpHeroCloudSchemaTests.swift
//  UpNextTests — Up Hero 클라우드 와이어 포맷 (UpHeroCloudSchema.swift).
//
//  WEB_FIXTURE 는 웹 정본에서 실측 생성한 JSON 이다:
//  src/lib/sync.ts 의 normalizeUpHeroState → encodeUpHeroForCloud 를 vitest 로
//  실행한 출력 (2026-08-29, 웹 커밋 9c2bf93 계약). Swift 가 이 JSON 을 읽고
//  같은 JSON 으로 다시 쓰면 웹↔iOS 가 같은 Firestore 필드를 안전하게 공유한다.
//

import XCTest
@testable import UpNext

@MainActor
final class UpHeroCloudSchemaTests: XCTestCase {

    /// 웹 encodeUpHeroForCloud 실측 출력 — 키 이름·명시적 null(빈 장비 슬롯,
    /// classType)·coinPouchClaimed 기본 false 가 모두 계약이다.
    private static let webFixture = """
    {
      "hero": {
        "name": "테오",
        "hp": 84,
        "maxHp": 120,
        "baseStats": { "str": 12, "int": 7, "vit": 9, "dex": 5, "agi": 6, "crit": 2, "slotBonus": 1 },
        "equipped": {
          "weapon": {
            "id": "sword_f10_1700000000000",
            "name": "eq_iron_sword",
            "baseId": "iron_sword",
            "type": "weapon",
            "rarity": "rare",
            "category": "fitness",
            "iconName": "sword",
            "stats": { "str": 4, "crit": 1 },
            "enhanceLevel": 3,
            "affix": "agi"
          },
          "armor": null,
          "accessory": null,
          "talisman": {
            "id": "talisman_photo_1700000000001",
            "name": "약속의 부적",
            "type": "talisman",
            "rarity": "unique",
            "category": "mindfulness",
            "iconName": "talisman",
            "stats": { "vit": 3 },
            "photoId": "photo_abc",
            "talismanSkills": ["ts_guard"],
            "effects": ["eff_1"],
            "flavor": "flavor text"
          }
        },
        "classType": null,
        "appearanceVariant": 1,
        "autoSkillEnabled": false,
        "learnedSkills": ["warrior_smash_t1"],
        "skillPoints": 2
      },
      "inventory": [
        {
          "id": "armor_f3_1700000000002",
          "name": "eq_cloth_armor",
          "baseId": "cloth_armor",
          "type": "armor",
          "rarity": "normal",
          "category": "wellness",
          "iconName": "armor",
          "stats": { "vit": 2 }
        }
      ],
      "coins": 264,
      "passes": { "fitness": 2, "learning": 0 },
      "dungeons": {
        "fitness": { "dungeonId": "fitness", "floorReached": 12, "bestFloorReached": 14, "bossesDefeated": [10] }
      },
      "codex": { "monsters": ["슬라임"], "equipment": ["iron_sword"], "bosses": [] },
      "cosmetics": { "tentColor": "#CDF564" },
      "lastIdleAccrualAt": 1756400000000,
      "ngPlusLevel": 1,
      "hasSeenCampTutorial": true,
      "welcomeGrantClaimed": true,
      "lastSeenAt": 1756400001000,
      "schemaVersion": 5,
      "shopDaily": { "coinPouchClaimed": false, "date": "2026-08-28", "passesBought": 1 },
      "weeklyVariant": {
        "week": "2026-W35",
        "affixId": "frenzy",
        "clearedDungeons": ["fitness"],
        "bestScore": 3140,
        "lastUploadedAt": 1756400002000
      },
      "heroStartLevel": 3
    }
    """

    private func decodeFixture() throws -> CloudUpHeroState {
        try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(Self.webFixture.utf8))
    }

    // MARK: - 웹 픽스처 왕복

    /// 웹이 쓴 JSON 을 읽고 → 같은 JSON 으로 다시 쓰는지 (요구 계약의 핵심).
    /// 키 순서는 JSON 의미에 없으므로 NSDictionary(오브젝트) 동등성으로 비교한다.
    func testWebFixtureRoundTripsByteIdenticalStructure() throws {
        let decoded = try decodeFixture()
        let reencoded = try XCTUnwrap(decoded.firestoreValue())
        let expected = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(Self.webFixture.utf8)) as? [String: Any])
        XCTAssertEqual(
            NSDictionary(dictionary: reencoded),
            NSDictionary(dictionary: expected),
            "Swift 재인코딩이 웹 encodeUpHeroForCloud 출력과 구조 단위로 달라졌다")
    }

    /// 디코드 값 스팟 체크 — CodingKeys 매핑(welcomeGrantClaimed→welcomeGiftClaimed)
    /// 과 명시적 null 슬롯의 생략 처리.
    func testWebFixtureDecodesDomainValues() throws {
        let decoded = try decodeFixture()
        XCTAssertEqual(decoded.hero.name, "테오")
        XCTAssertEqual(decoded.hero.equipped.count, 2)          // null 슬롯 2개는 생략
        XCTAssertEqual(decoded.hero.equipped[.weapon]?.enhanceLevel, 3)
        XCTAssertEqual(decoded.hero.equipped[.talisman]?.photoId, "photo_abc")
        XCTAssertNil(decoded.hero.classType)
        XCTAssertEqual(decoded.hero.autoSkillEnabled, false)
        XCTAssertEqual(decoded.inventory.map(\.id), ["armor_f3_1700000000002"])
        XCTAssertEqual(decoded.coins, 264)
        XCTAssertEqual(decoded.passes, [.fitness: 2, .learning: 0])  // 0 도 키 유지
        XCTAssertEqual(decoded.dungeons[.fitness]?.bestFloorReached, 14)
        XCTAssertEqual(decoded.codex.monsters, ["슬라임"])
        XCTAssertEqual(decoded.cosmetics.tentColor, "#CDF564")
        XCTAssertTrue(decoded.welcomeGiftClaimed)                // ← "welcomeGrantClaimed"
        XCTAssertEqual(decoded.shopDaily?.coinPouchClaimed, false)
        XCTAssertEqual(decoded.weeklyVariant?.clearedDungeons, [.fitness])
        XCTAssertEqual(decoded.heroStartLevel, 3)
        XCTAssertTrue(decoded.hasFootprint)
    }

    // MARK: - 관용 디코드 (웹 normalizeUpHeroState)

    /// 필드 하나가 깨져도 전체를 버리지 않고 그 필드만 기본값으로 메꾼다.
    /// 배열/맵은 원소 단위로 걸러낸다.
    func testTolerantDecodeRepairsCorruptFieldsIndividually() throws {
        let corrupt = """
        {
          "hero": { "name": 42, "hp": "bad", "equipped": { "weapon": null, "armor": { "id": "a1" } } },
          "inventory": [ { "id": "ok1", "type": "weapon" }, { "type": "armor" }, "garbage" ],
          "coins": "many",
          "passes": { "fitness": "x", "learning": 3, "unknownDungeon": 5 },
          "dungeons": { "fitness": { "floorReached": "x" } },
          "codex": { "monsters": ["a", 5], "equipment": "nope" },
          "lastIdleAccrualAt": "soon",
          "shopDaily": { "passesBought": 3 },
          "weeklyVariant": { "week": "2026-W35" },
          "welcomeGrantClaimed": "yes"
        }
        """
        let before = Int(Date().timeIntervalSince1970 * 1000)
        let decoded = try JSONDecoder().decode(CloudUpHeroState.self, from: Data(corrupt.utf8))

        XCTAssertEqual(decoded.hero.hp, 100)                       // 기본 영웅 hp 로 교정
        XCTAssertTrue(decoded.hero.equipped.isEmpty)               // null·type 결손 슬롯 제거
        XCTAssertEqual(decoded.inventory.map(\.id), ["ok1"])       // 깨진 원소만 버림
        XCTAssertEqual(decoded.inventory[0].name, "ok1")           // name 폴백 = id
        XCTAssertEqual(decoded.coins, 0)
        XCTAssertEqual(decoded.passes, [.learning: 3])             // 값 손상·미지 키 제거
        XCTAssertEqual(decoded.dungeons[.fitness]?.floorReached, 0)
        XCTAssertEqual(decoded.dungeons[.fitness]?.bestFloorReached, 0)
        XCTAssertEqual(decoded.codex.monsters, ["a"])
        XCTAssertEqual(decoded.codex.equipment, [])
        XCTAssertGreaterThanOrEqual(decoded.lastIdleAccrualAt, before)  // 손상 → now
        XCTAssertNil(decoded.shopDaily)                            // date 없음 → 통째 생략
        XCTAssertNil(decoded.weeklyVariant)                        // affixId 없음 → 통째 생략
        XCTAssertFalse(decoded.welcomeGiftClaimed)
        // legacy 채움 — heroStartLevel 없음 + 흔적(인벤) 있음 → 1.
        XCTAssertEqual(decoded.heroStartLevel, 1)
    }

    /// 흔적 없는 스냅샷은 heroStartLevel 을 채우지 않는다 (신규 seed 를 존중).
    func testNoLegacyFillWithoutFootprint() throws {
        let decoded = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"coins": 0}"#.utf8))
        XCTAssertFalse(decoded.hasFootprint)
        XCTAssertNil(decoded.heroStartLevel)
    }

    // MARK: - 인코딩 계약 (웹 encodeUpHeroForCloud)

    /// setDoc(merge) 병합 누수 방어 — 빈 장비 슬롯·미전직은 명시적 null,
    /// shopDaily.coinPouchClaimed 는 기본 false, currentSession 은 실리지 않는다.
    func testEncodeFillsMergeHoles() throws {
        var state = UpHeroStore.makeDefaultState()
        state.coins = 50
        state.shopDaily = ShopDaily(date: "2026-08-29", passesBought: 0, coinPouchClaimed: nil)
        let payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())

        let hero = try XCTUnwrap(payload["hero"] as? [String: Any])
        let equipped = try XCTUnwrap(hero["equipped"] as? [String: Any])
        XCTAssertEqual(equipped.count, 4)
        for slot in ["weapon", "armor", "accessory", "talisman"] {
            XCTAssertTrue(equipped[slot] is NSNull, "빈 슬롯 \(slot) 은 명시적 null 이어야 한다")
        }
        XCTAssertTrue(hero["classType"] is NSNull)
        let shopDaily = try XCTUnwrap(payload["shopDaily"] as? [String: Any])
        XCTAssertEqual(shopDaily["coinPouchClaimed"] as? Bool, false)
        XCTAssertNil(payload["currentSession"])
        XCTAssertNil(payload["pendingDungeon"])
        // 와이어 키 — welcomeGrantClaimed 로 나가야 웹이 읽는다.
        XCTAssertNotNil(payload["welcomeGrantClaimed"])
        XCTAssertNil(payload["welcomeGiftClaimed"])
    }

    // MARK: - 흔적 판정 (웹 hasUpHeroFootprint)

    /// initialize 가 즉시 persist 하는 "빈 저장본" 은 흔적이 아니다 — 키/파일 존재
    /// 판정이면 클라우드 영웅이 빈 값으로 덮인다 (웹 커밋 9c2bf93 실측 회귀).
    func testFootprintGates() {
        let empty = UpHeroStore.makeDefaultState()
        XCTAssertFalse(empty.hasUpHeroFootprint)
        XCTAssertFalse(CloudUpHeroState(empty).hasFootprint)

        var coined = empty
        coined.coins = 1
        XCTAssertTrue(coined.hasUpHeroFootprint)
        XCTAssertTrue(CloudUpHeroState(coined).hasFootprint)

        var decorated = empty
        decorated.cosmetics = Cosmetics(tentColor: "#CDF564", campfire: nil)
        XCTAssertTrue(decorated.hasUpHeroFootprint)

        var explored = empty
        explored.dungeons[.fitness] = DungeonProgress(
            dungeonId: .fitness, floorReached: 1, bestFloorReached: 1, bossesDefeated: [])
        XCTAssertTrue(CloudUpHeroState(explored).hasFootprint)

        // 탐험권 0 은 흔적이 아니다 (0 도 키는 유지되는 것과 별개).
        var zeroPasses = empty
        zeroPasses.passes = [.fitness: 0]
        XCTAssertFalse(zeroPasses.hasUpHeroFootprint)
    }
}
