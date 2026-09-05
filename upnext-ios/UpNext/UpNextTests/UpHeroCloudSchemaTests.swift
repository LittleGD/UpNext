//
//  UpHeroCloudSchemaTests.swift
//  UpNextTests — Up Hero 클라우드 와이어 포맷 (UpHeroCloudSchema.swift).
//
//  WEB_FIXTURE 는 웹 정본에서 실측 생성한 JSON 이다:
//  src/lib/sync.ts 의 normalizeUpHeroState → encodeUpHeroForCloud 를 vitest 로
//  실행한 출력 (2026-08-29, 웹 커밋 9c2bf93 계약). Swift 가 이 JSON 을 읽고
//  같은 JSON 으로 다시 쓰면 웹↔iOS 가 같은 Firestore 필드를 안전하게 공유한다.
//  재생성 #1 (Phase 2-A, Track A): `heroXp: 39031` (레거시 Lv47 시드값) 추가 —
//  src/lib/sync.test.ts "픽스처 왕복 — heroXp 39031" 과 같은 값.
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
      "destroyGuards": 2,
      "downGuards": 1,
      "combatBuff": { "pct": 10, "battlesLeft": 3 },
      "slotBlankStreak": 2,
      "lastIdleAccrualAt": 1756400000000,
      "ngPlusLevel": 1,
      "hasSeenCampTutorial": true,
      "welcomeGrantClaimed": true,
      "lastSeenAt": 1756400001000,
      "schemaVersion": 5,
      "shopDaily": { "coinPouchClaimed": false, "date": "2026-08-28", "passesBought": 1, "slotSpins": 2 },
      "weeklyVariant": {
        "week": "2026-W35",
        "affixId": "frenzy",
        "clearedDungeons": ["fitness"],
        "bestScore": 3140,
        "lastUploadedAt": 1756400002000
      },
      "heroStartLevel": 3,
      "heroXp": 39031
    }
    """

    private func decodeFixture() throws -> CloudUpHeroState {
        try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(Self.webFixture.utf8))
    }

    // MARK: - Phase 5-B — enhanceLevel 20 왕복

    /// enhanceLevel 0..20 은 와이어 키 변경 없이 그대로 왕복한다 (웹 sync.test.ts
    /// "enhanceLevel 20 왕복" 과 같은 픽스처). 사진 부적의 talismanSkills 도 남는다.
    func testEnhanceLevel20RoundTrips() throws {
        let json = """
        {
          "inventory": [
            {
              "id": "it-20", "baseId": "sword_iron", "name": "쇠검 +20", "type": "weapon",
              "rarity": "rare", "category": "fitness", "iconName": "Sword",
              "stats": { "str": 25, "dex": 8 }, "enhanceLevel": 20, "enhanceFailStreak": 0
            },
            {
              "id": "ph-10", "name": "추억의 부적 +10", "type": "talisman", "rarity": "rare",
              "category": "fitness", "iconName": "Photo", "photoId": "photo-1",
              "stats": { "vit": 5 }, "enhanceLevel": 10, "talismanSkills": ["fit5", "fit10"]
            }
          ]
        }
        """
        let decoded = try JSONDecoder().decode(CloudUpHeroState.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.inventory.count, 2)
        XCTAssertEqual(decoded.inventory[0].enhanceLevel, 20)
        XCTAssertEqual(decoded.inventory[0].stats, [.str: 25, .dex: 8])
        XCTAssertEqual(decoded.inventory[1].enhanceLevel, 10)
        XCTAssertEqual(decoded.inventory[1].talismanSkills, ["fit5", "fit10"])

        let payload = try XCTUnwrap(decoded.firestoreValue())
        let inv = try XCTUnwrap(payload["inventory"] as? [[String: Any]])
        XCTAssertEqual(inv[0]["enhanceLevel"] as? Int, 20)
        XCTAssertEqual(inv[1]["enhanceLevel"] as? Int, 10)

        let reencoded = try JSONEncoder().encode(decoded)
        let again = try JSONDecoder().decode(CloudUpHeroState.self, from: reencoded)
        XCTAssertEqual(again.inventory[0].enhanceLevel, 20)
        XCTAssertEqual(again.toState().inventory[0].enhanceLevel, 20)
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
        XCTAssertEqual(decoded.shopDaily?.slotSpins, 2)          // 와이어 키 "slotSpins"
        XCTAssertEqual(decoded.weeklyVariant?.clearedDungeons, [.fitness])
        XCTAssertEqual(decoded.heroStartLevel, 3)
        XCTAssertEqual(decoded.heroXp, 39031)                   // Phase 2-A 와이어 키 "heroXp"
        XCTAssertEqual(decoded.destroyGuards, 2)
        XCTAssertEqual(decoded.downGuards, 1)
        XCTAssertEqual(decoded.combatBuff.buff, CombatBuff(pct: 10, battlesLeft: 3))
        XCTAssertEqual(decoded.slotBlankStreak, 2)
        XCTAssertTrue(decoded.hasFootprint)
    }

    // MARK: - 굴림틀 pity 스트릭 (와이어 키 "slotBlankStreak")
    //
    // 웹 `normalizeSlotBlankStreak`: 부재·비숫자·NaN → 0, 소수 내림, 정수 [0, 1000].
    // 0 이어도 키를 항상 싣는다 — 보상 뒤 0 리셋이 merge 에서 빠지면 클라우드의 옛
    // 스트릭이 되살아나 받을 자격이 없는 pity 가 발동한다.

    private func decodeStreak(_ json: String) throws -> Int {
        try JSONDecoder()
            .decode(CloudUpHeroState.self, from: Data(json.utf8))
            .slotBlankStreak
    }

    func testSlotBlankStreakLenientDecodeMatchesWeb() throws {
        XCTAssertEqual(try decodeStreak("{}"), 0)                                   // 레거시(키 없음)
        XCTAssertEqual(try decodeStreak(#"{"slotBlankStreak":4}"#), 4)
        XCTAssertEqual(try decodeStreak(#"{"slotBlankStreak":3.9}"#), 3)            // 내림
        XCTAssertEqual(try decodeStreak(#"{"slotBlankStreak":-2}"#), 0)             // 음수 → 0
        XCTAssertEqual(try decodeStreak(#"{"slotBlankStreak":5000}"#), 1000)        // 상한
        XCTAssertEqual(try decodeStreak(#"{"slotBlankStreak":"four"}"#), 0)         // 비숫자
        XCTAssertEqual(try decodeStreak(#"{"slotBlankStreak":null}"#), 0)
    }

    func testSlotBlankStreakAlwaysEncodedEvenWhenZero() throws {
        let empty = try JSONDecoder().decode(CloudUpHeroState.self, from: Data("{}".utf8))
        let payload = try XCTUnwrap(empty.firestoreValue())
        XCTAssertEqual(payload["slotBlankStreak"] as? Int, 0, "0 이어도 키를 실어야 한다")
    }

    /// 상태 → 클라우드 → 상태 왕복에서 값이 살아남고, 스트릭만으로는 흔적이 아니다.
    func testSlotBlankStreakRoundTripsThroughCloudWire() throws {
        var state = UpHeroStore.makeDefaultState()
        state.coins = 10
        state.slotBlankStreak = 4
        let payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        XCTAssertEqual(payload["slotBlankStreak"] as? Int, 4, "와이어 키가 빠졌다")

        let data = try JSONSerialization.data(withJSONObject: payload)
        let back = try JSONDecoder().decode(CloudUpHeroState.self, from: data)
        XCTAssertEqual(back.slotBlankStreak, 4)
        XCTAssertEqual(back.toState().slotBlankStreak, 4)

        let onlyStreak = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"slotBlankStreak":4}"#.utf8))
        XCTAssertFalse(onlyStreak.hasFootprint, "스트릭만으로는 플레이 흔적이 아니다")
    }

    // MARK: - 굴림틀 전투 버프 (와이어 키 "combatBuff")
    //
    // 아래 기대값은 웹 `normalizeUpHeroState` 를 실제로 돌려 뽑은 것이다
    // (2026-08-31). 웹은 만료·부재·손상을 전부 `{pct:0, battlesLeft:0}` 껍데기로
    // 표현하고 undefined 를 쓰지 않는다 — iOS 도 같아야 왕복이 성립한다.

    private func decodeBuff(_ json: String) throws -> CloudCombatBuff {
        try JSONDecoder()
            .decode(CloudUpHeroState.self, from: Data(json.utf8))
            .combatBuff
    }

    /// pct 상한 100 (= 배율 2배, 퍼센트 포인트), battlesLeft 상한 20 —
    /// 웹 normalizeCombatBuff 와 동일.
    func testCombatBuffClampsMatchWeb() throws {
        // 굴림틀이 실제로 주는 값(10)은 상한에 걸리지 않고 그대로 통과해야 한다.
        // 예전 상한 1 은 이걸 1 로 접어 다음 탐험에서 +10% 를 +1% 로 만들었다.
        let normal = try decodeBuff(#"{"combatBuff":{"pct":10,"battlesLeft":3}}"#)
        XCTAssertEqual(normal.buff, CombatBuff(pct: 10, battlesLeft: 3))

        // 웹: { pct: 9999, battlesLeft: 99 } → { pct: 100, battlesLeft: 20 }
        let capped = try decodeBuff(#"{"combatBuff":{"pct":9999,"battlesLeft":99}}"#)
        XCTAssertEqual(capped.buff, CombatBuff(pct: 100, battlesLeft: 20))

        // 웹: battlesLeft 는 Math.floor — 2.9 → 2
        let floored = try decodeBuff(#"{"combatBuff":{"pct":0.25,"battlesLeft":2.9}}"#)
        XCTAssertEqual(floored.buff, CombatBuff(pct: 0.25, battlesLeft: 2))
    }

    /// 만료·부재·손상은 전부 "버프 없음". 껍데기를 도메인으로 새어 보내지 않는다.
    func testCombatBuffFoldsExpiredAndCorruptToNil() throws {
        XCTAssertNil(try decodeBuff(#"{"combatBuff":{"pct":10,"battlesLeft":0}}"#).buff)
        XCTAssertNil(try decodeBuff(#"{"combatBuff":{"pct":0,"battlesLeft":3}}"#).buff)
        XCTAssertNil(try decodeBuff(#"{"combatBuff":"nope"}"#).buff)
        XCTAssertNil(try decodeBuff("{}").buff)
    }

    /// **0 이어도 키를 싣는다.** 빼면 setDoc(merge) 가 클라우드에 남은 지난 버프를
    /// 되살려, 다 쓴 +10% 가 기기를 옮길 때마다 부활한다 (passes 와 같은 이유).
    func testCombatBuffAlwaysEncodedEvenWhenEmpty() throws {
        let decoded = try decodeBuff("{}")
        XCTAssertNil(decoded.buff)

        let empty = try JSONDecoder().decode(CloudUpHeroState.self, from: Data("{}".utf8))
        let payload = try XCTUnwrap(empty.firestoreValue())
        let buff = try XCTUnwrap(payload["combatBuff"] as? [String: Any],
                                 "combatBuff 키가 페이로드에서 빠졌다")
        XCTAssertEqual(buff["pct"] as? Double, 0)
        XCTAssertEqual(buff["battlesLeft"] as? Int, 0)
    }

    /// 버프만으로는 "플레이 흔적" 이 되지 않는다 — 웹 hasUpHeroFootprint 축에
    /// combatBuff 가 없다. 빈 상태를 올려 클라우드를 덮는 사고를 막는 게이트다.
    func testCombatBuffAloneIsNotFootprint() throws {
        let decoded = try JSONDecoder().decode(
            CloudUpHeroState.self,
            from: Data(#"{"combatBuff":{"pct":0.5,"battlesLeft":9}}"#.utf8))
        XCTAssertEqual(decoded.combatBuff.buff, CombatBuff(pct: 0.5, battlesLeft: 9))
        XCTAssertFalse(decoded.hasFootprint)
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
    /// shopDaily.coinPouchClaimed 는 기본 false, shopDaily.slotSpins 는 기본 0,
    /// currentSession 은 실리지 않는다.
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
        XCTAssertEqual(shopDaily["slotSpins"] as? Int, 0, "빠지면 merge 에 어제 횟수가 남는다")
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

    // MARK: - 영웅 XP 풀 (와이어 키 "heroXp", Phase 2-A)
    //
    // 웹 normalizeUpHeroState: 키가 있을 때만 싣고 [0, HERO_XP_CAP] 정수로 접는다. 구
    // 클라이언트 문서(키 없음)는 nil 유지 — 0 이나 레거시 공식으로 지어내면 두 기기의 풀이
    // 서로를 덮어 mergeCloudHeroXp 의 단조 병합 전제가 깨진다.

    private func decodeHeroXp(_ json: String) throws -> Int? {
        try JSONDecoder().decode(CloudUpHeroState.self, from: Data(json.utf8)).heroXp
    }

    /// 구 클라이언트 문서(heroXp 없음) → nil 로 디코드하고, 재인코딩에도 키가 없다.
    func testLegacyDocWithoutHeroXpStaysAbsent() throws {
        let decoded = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"coins": 12, "heroStartLevel": 1}"#.utf8))
        XCTAssertNil(decoded.heroXp)
        let payload = try XCTUnwrap(decoded.firestoreValue())
        XCTAssertNil(payload["heroXp"], "미시드 풀을 지어내 올리면 안 된다")
        // 상태로 옮겨도 미시드 유지 (GameStore.adoptCloudUpHero 가 ensureHeroXp 로 시드).
        XCTAssertNil(decoded.toState().heroXp)
    }

    /// 시드된 값은 0 이어도 항상 싣는다 (setDoc(merge) 가 옛 값을 되살리지 않게).
    func testHeroXpAlwaysEncodedOnceSeeded() throws {
        var state = UpHeroStore.makeDefaultState()
        state.heroXp = 0
        let payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        XCTAssertEqual(payload["heroXp"] as? Int, 0)
        state.heroXp = 39031
        let again = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        XCTAssertEqual(again["heroXp"] as? Int, 39031)
    }

    /// 클램프 — 음수 → 0, 소수 내림, 상한 heroXpCap. 웹 clampHeroXp 와 동일.
    func testHeroXpClampsLikeWeb() throws {
        XCTAssertEqual(try decodeHeroXp(#"{"heroXp": -5}"#), 0)
        XCTAssertEqual(try decodeHeroXp(#"{"heroXp": 12.9}"#), 12)
        XCTAssertEqual(try decodeHeroXp(#"{"heroXp": 1000000000000}"#), UpHeroRules.heroXpCap)
        XCTAssertNil(try decodeHeroXp(#"{"heroXp": "abc"}"#), "비숫자는 부재로 취급 (지어내지 않는다)")
        var state = UpHeroStore.makeDefaultState()
        state.heroXp = -1
        XCTAssertEqual(CloudUpHeroState(state).heroXp, 0)
    }

    /// 왕복 — 상태 → 클라우드 → 상태 를 지나도 heroXp 가 같다.
    func testHeroXpRoundTripsThroughCloudWire() throws {
        var state = UpHeroStore.makeDefaultState()
        state.heroXp = 39031
        let data = try JSONEncoder().encode(CloudUpHeroState(state))
        let decoded = try JSONDecoder().decode(CloudUpHeroState.self, from: data)
        XCTAssertEqual(decoded.heroXp, 39031)
        XCTAssertEqual(decoded.toState().heroXp, 39031)
    }

    /// heroXp 만으로는 플레이 흔적이 아니다 (footprint 게이트 불변, 웹 hasUpHeroFootprint).
    func testHeroXpAloneIsNotFootprint() throws {
        let decoded = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"heroXp": 39031}"#.utf8))
        XCTAssertFalse(decoded.hasFootprint)
        XCTAssertEqual(decoded.heroXp, 39031)
    }
}
