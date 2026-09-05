//
//  UpHeroCloudSchema.swift
//  UpNext 모델 — Up Hero 클라우드(Firestore) 와이어 포맷.
//
//  웹 src/lib/sync.ts 의 CloudUpHeroState / normalizeUpHeroState /
//  encodeUpHeroForCloud / hasUpHeroFootprint 를 1:1 포팅.
//  같은 계정이 웹↔iOS 를 오가며 /users/{uid}.uphero 맵을 함께 읽으므로
//  **JSON 키는 웹과 바이트 단위로 동일해야 한다** (프로퍼티명이 달라도 CodingKeys 로 맞춘다.
//  대표: iOS welcomeGiftClaimed ↔ 와이어 "welcomeGrantClaimed").
//
//  계약 (웹과 동일):
//   - currentSession 은 싣지 않는다 — 진행 중 던전 로그(400줄 캡)가 문서 1MB 한도와
//     모바일 대역폭을 위협한다. 세션은 기기 로컬, 결산 후 코인/인벤/도감으로 남는다.
//   - 관용 디코드: 필드 하나가 깨져도 전체를 버리지 않고 그 필드만 기본값으로 메꾼다
//     (웹 normalizeUpHeroState). 배열은 원소 단위로 걸러낸다.
//   - 인코드는 setDoc(merge) 중첩 맵 병합 누수를 막는다: hero.equipped 의 빈 슬롯은
//     명시적 null, shopDaily.coinPouchClaimed 는 기본 false, classType 해제는 명시적
//     null (키를 빼면 클라우드에 남은 예전 값이 되살아난다 — 웹 encodeUpHeroForCloud).
//   - 격자 가방 좌표(bagX/bagY/bagRot)는 디코드 시점에 정규화 계약을 적용한다
//     (웹 upHeroBag.normalizeEquipmentPlacement 와 같은 규칙). 무효 좌표를 도메인으로
//     흘리면 보드가 겹쳐 그려지고, 키를 통째로 빼먹으면 왕복마다 배치가 지워진다.
//   - 흔적(footprint) 판정: 업로드/복원 게이트 둘 다 "키 존재" 가 아니라 흔적으로.
//     initialize 가 새 기기에서 즉시 persist 하는 빈 저장본 때문에 키 존재 판정이면
//     클라우드 영웅이 빈 값으로 덮인다 (웹 커밋 9c2bf93 에서 실측된 회귀).
//
//  iOS 한계 (문서화된 의도적 차이):
//   - 웹 normalizeEquipment/normalizeHero 는 알 수 없는 필드를 보존하지만 Swift 타입은
//     드랍한다. setDoc(merge) 가 맵을 키 단위로 병합하므로 클라우드에서 지워지진 않고
//     (stale 하게 남을 뿐), 웹 관용 디코드가 처리한다.
//   - 웹은 0.5 단위 스탯(강화 가산)을 그대로 두지만 iOS 도메인은 Int 라 내림한다.
//

import Foundation

// MARK: - 관용 디코드 프리미티브

/// 원소/값 단위 lossy 디코드 — 깨진 원소 하나가 컬렉션 전체를 버리게 하지 않는다.
/// (웹 asTextArray/asFiniteArray 의 "원소 단위로 걸러낸다" 계약.)
struct UNLossy<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) {
        value = try? T(from: decoder)
    }
}

private func lossyStrings<K: CodingKey>(
    _ c: KeyedDecodingContainer<K>, _ key: K
) -> [String]? {
    (try? c.decode([UNLossy<String>].self, forKey: key))?.compactMap(\.value)
}

/// 관용 숫자 디코드 — 정수/실수 모두 허용 (웹 asFinite). 도메인이 Int 라 내림.
/// 크기 가드가 필요한 이유: `Int(1e300)` 은 Swift 에서 트랩(크래시)이라, 손상된 클라우드
/// 문서 하나가 앱을 죽인다. 웹은 같은 값을 그대로 두지만 iOS 는 Int 도메인이라 버린다.
private func lenientInt<K: CodingKey>(
    _ c: KeyedDecodingContainer<K>, _ key: K
) -> Int? {
    guard let d = try? c.decode(Double.self, forKey: key), d.isFinite else { return nil }
    guard abs(d) < 9.0e15 else { return nil }
    return Int(d.rounded(.down))
}

/// 스탯 맵 디코드 — 숫자 아닌 값·모르는 키는 버린다 (웹 normalizeStats).
private func lenientStatMap<K: CodingKey>(
    _ c: KeyedDecodingContainer<K>, _ key: K
) -> [StatKey: Int] {
    var out: [StatKey: Int] = [:]
    if let raw = try? c.decode([String: UNLossy<Double>].self, forKey: key) {
        for (k, v) in raw {
            guard let statKey = StatKey(rawValue: k), let n = v.value, n.isFinite else { continue }
            out[statKey] = Int(n.rounded(.down))
        }
    }
    return out
}

// MARK: - 흔적 판정 (웹 hasUpHeroFootprint)

/// "이 스냅샷에 Up Hero 를 만진 흔적이 있는가" — 웹 hasUpHeroFootprint 와 같은 축:
/// 인벤 / 도감 / (로컬 판정 한정) 세션 / 던전 / 탐험권>0 / 코인>0 / 꾸미기.
private func upHeroFootprint(
    inventory: [Equipment],
    codex: Codex,
    hasSession: Bool,
    dungeons: [DungeonId: DungeonProgress],
    passes: [DungeonId: Int],
    coins: Int,
    cosmetics: Cosmetics,
    destroyGuards: Int,
    downGuards: Int,
    bagRowsBought: Int
) -> Bool {
    if !inventory.isEmpty { return true }
    if !codex.monsters.isEmpty || !codex.bosses.isEmpty || !codex.equipment.isEmpty { return true }
    if hasSession { return true }
    if !dungeons.isEmpty { return true }
    if passes.values.contains(where: { $0 > 0 }) { return true }
    if coins > 0 { return true }
    if cosmetics.tentColor != nil || cosmetics.campfire != nil { return true }
    // 방지권은 코인을 쓰거나 던전을 돌아야만 생긴다 — 보유 자체가 플레이 흔적이다
    // (웹 hasUpHeroFootprint 의 같은 두 축).
    if destroyGuards > 0 { return true }
    if downGuards > 0 { return true }
    // 가방 행은 코인 200 부터 시작하는 상점 구매로만 는다 — 한 행이라도 샀으면 플레이 흔적.
    if bagRowsBought > 0 { return true }
    return false
}

extension UpHeroState {
    /// 로컬 저장본 흔적 판정 — currentSession 포함 (웹: 로컬 판정에만 세션이 잡힌다).
    var hasUpHeroFootprint: Bool {
        upHeroFootprint(
            inventory: inventory, codex: codex, hasSession: currentSession != nil,
            dungeons: dungeons, passes: passes, coins: coins, cosmetics: cosmetics,
            destroyGuards: destroyGuards ?? 0, downGuards: downGuards ?? 0,
            bagRowsBought: UpHeroBag.normalizeBagRowsBought(bagRowsBought))
    }
}

// MARK: - 클라우드 페이로드

/// 클라우드에 싣는 Up Hero 페이로드 — 로컬 영속 스키마에서 currentSession /
/// pendingDungeon(웹 미보유 transient)을 뺀 형태. 웹 CloudUpHeroState 대응.
struct CloudUpHeroState: Equatable {
    var hero: Hero
    var inventory: [Equipment]
    var coins: Int
    var passes: [DungeonId: Int]
    var dungeons: [DungeonId: DungeonProgress]
    var codex: Codex
    var cosmetics: Cosmetics
    /// 방지권 2종 보유 개수. 와이어 키 "destroyGuards" / "downGuards" — 웹과 바이트 동일.
    var destroyGuards: Int
    var downGuards: Int
    /// 굴림틀 전투 버프. 와이어 키 "combatBuff" (중첩 맵 `{pct, battlesLeft}`).
    /// 웹은 만료/부재를 `{pct: 0, battlesLeft: 0}` 껍데기로 싣는다 (undefined 가 아니다) —
    /// 여기서도 non-optional 로 들고 같은 껍데기를 인코딩해야 왕복 바이트가 맞는다.
    var combatBuff: CloudCombatBuff
    /// 굴림틀 pity 스트릭. 와이어 키 "slotBlankStreak" (정수 0..1000, 0 도 항상 싣는다).
    /// 웹 `normalizeSlotBlankStreak` — 부재·손상은 0. 빠뜨리면 화이트리스트 디코드에서
    /// 조용히 탈락해 웹에서 쌓은 스트릭이 iOS 왕복 뒤 0 으로 덮인다.
    var slotBlankStreak: Int
    /// 상점에서 산 가방 행 수. 와이어 키 "bagRowsBought" (정수 0..4, 0 도 항상 싣는다).
    /// 웹 `normalizeBagRowsBought` — 부재·손상은 0. 빠뜨리면 화이트리스트 디코드에서
    /// 조용히 탈락해 코인으로 산 행이 iOS 왕복 뒤 사라진다.
    var bagRowsBought: Int
    var lastIdleAccrualAt: Int
    var ngPlusLevel: Int
    var hasSeenCampTutorial: Bool
    /// 와이어 키는 웹과 동일한 "welcomeGrantClaimed" (iOS 도메인 명은 gift).
    var welcomeGiftClaimed: Bool
    var lastSeenAt: Int?
    var schemaVersion: Int?
    var shopDaily: ShopDaily?
    var weeklyVariant: WeeklyVariant?
    var heroStartLevel: Int?

    /// 클라우드 스냅샷 흔적 판정 — 세션 없는 페이로드 축만 (웹 업로드/복원 게이트).
    var hasFootprint: Bool {
        upHeroFootprint(
            inventory: inventory, codex: codex, hasSession: false,
            dungeons: dungeons, passes: passes, coins: coins, cosmetics: cosmetics,
            destroyGuards: destroyGuards, downGuards: downGuards,
            bagRowsBought: bagRowsBought)
    }

    /// 살아있는 로컬 상태 → 클라우드 페이로드 (웹 normalizeUpHeroState 의 클램프 재현).
    /// currentSession 은 읽지 않으므로 통과만으로 빠진다.
    init(_ s: UpHeroState) {
        hero = s.hero
        inventory = s.inventory
        coins = max(0, s.coins)
        passes = s.passes.mapValues { max(0, $0) }
        dungeons = s.dungeons
        codex = s.codex
        cosmetics = s.cosmetics
        destroyGuards = min(UpHeroRules.enhanceGuardMax, max(0, s.destroyGuards ?? 0))
        downGuards = min(UpHeroRules.enhanceGuardMax, max(0, s.downGuards ?? 0))
        combatBuff = CloudCombatBuff(s.combatBuff)
        slotBlankStreak = UpHeroSlot.normalizeBlankStreak(s.slotBlankStreak)
        bagRowsBought = UpHeroBag.normalizeBagRowsBought(s.bagRowsBought)
        lastIdleAccrualAt = s.lastIdleAccrualAt
        ngPlusLevel = max(0, s.ngPlusLevel ?? 0)
        hasSeenCampTutorial = s.hasSeenCampTutorial ?? false
        welcomeGiftClaimed = s.welcomeGiftClaimed ?? false
        lastSeenAt = s.lastSeenAt
        schemaVersion = s.schemaVersion
        shopDaily = s.shopDaily
        weeklyVariant = s.weeklyVariant
        heroStartLevel = s.heroStartLevel.map { max(1, $0) }
        // legacy 저장본 — heroStartLevel 이 없는데 플레이 흔적이 있으면 1 로 채운다.
        // 생략하면 복원한 기기의 신규 seed(현재 챌린지 Lv)가 남아 영웅 Lv 가 주저앉는다
        // (웹 normalizeUpHeroState 의 동일 판정).
        if heroStartLevel == nil, hasFootprint { heroStartLevel = 1 }
    }

    /// 클라우드 페이로드 → 살아있는 상태. currentSession/transient 는 호출측
    /// (UpHeroStore.adoptCloudState)이 로컬 값을 유지한다.
    func toState() -> UpHeroState {
        PersistedUpHeroState(
            hero: hero,
            inventory: inventory,
            coins: coins,
            passes: passes,
            dungeons: dungeons,
            pendingDungeon: nil,
            codex: codex,
            cosmetics: cosmetics,
            destroyGuards: destroyGuards,
            downGuards: downGuards,
            combatBuff: combatBuff.buff,
            slotBlankStreak: slotBlankStreak,
            bagRowsBought: bagRowsBought,
            lastIdleAccrualAt: lastIdleAccrualAt,
            lastSeenAt: lastSeenAt,
            heroStartLevel: heroStartLevel,
            shopDaily: shopDaily,
            ngPlusLevel: ngPlusLevel,
            weeklyVariant: weeklyVariant,
            schemaVersion: schemaVersion,
            hasSeenCampTutorial: hasSeenCampTutorial,
            welcomeGiftClaimed: welcomeGiftClaimed
        ).toState()
    }
}

// MARK: - Codable (와이어 포맷 — 웹 JSON 키와 바이트 동일)

extension CloudUpHeroState: Codable {

    private enum K: String, CodingKey {
        case hero, inventory, coins, passes, dungeons, codex, cosmetics
        // 방지권 2종 — 여기에 빠뜨리면 웹↔iOS 왕복에서 보유 개수가 조용히 사라진다.
        // legacy 는 단일 소모품 시절의 "protectCharms" 로 들어온다 (읽기 전용 폴백).
        case destroyGuards, downGuards, protectCharms
        // 굴림틀 전투 버프 — 중첩 맵. 빠뜨리면 왕복에서 조용히 사라진다.
        case combatBuff
        // 굴림틀 pity 스트릭 — 정수. 웹과 철자가 같아야 왕복에서 탈락하지 않는다.
        case slotBlankStreak
        // 상점으로 산 가방 행 — 철자가 웹과 같아야 왕복에서 탈락하지 않는다.
        case bagRowsBought
        case lastIdleAccrualAt, ngPlusLevel, hasSeenCampTutorial
        case welcomeGiftClaimed = "welcomeGrantClaimed"
        case lastSeenAt, schemaVersion, shopDaily, weeklyVariant, heroStartLevel
    }

    /// 관용 디코드 — 웹 normalizeUpHeroState. 오브젝트이기만 하면 절대 throw 하지
    /// 않고, 깨진 필드는 기본값으로 메꾼다.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)

        hero = (try? c.decode(CloudHero.self, forKey: .hero))?.hero
            ?? UpHeroRules.createDefaultHero()
        inventory = ((try? c.decode([UNLossy<CloudEquipment>].self, forKey: .inventory)) ?? [])
            .compactMap { $0.value?.equipment }
        coins = max(0, lenientInt(c, .coins) ?? 0)

        // 탐험권 — 0 도 키를 남긴다: setDoc(merge) 는 중첩 맵을 키 단위로 병합하므로
        // 키를 빼면 클라우드에 남아 있던 예전 잔고가 되살아난다 (웹 normalizePasses).
        var decodedPasses: [DungeonId: Int] = [:]
        if let raw = try? c.decode([String: UNLossy<Double>].self, forKey: .passes) {
            for (k, v) in raw {
                guard let id = DungeonId(rawValue: k), let n = v.value, n.isFinite else { continue }
                decodedPasses[id] = max(0, Int(n.rounded(.down)))
            }
        }
        passes = decodedPasses

        var decodedDungeons: [DungeonId: DungeonProgress] = [:]
        if let raw = try? c.decode([String: UNLossy<CloudDungeonProgress>].self, forKey: .dungeons) {
            for (k, v) in raw {
                guard let id = DungeonId(rawValue: k), let p = v.value else { continue }
                decodedDungeons[id] = p.resolved(fallbackId: id)
            }
        }
        dungeons = decodedDungeons

        codex = (try? c.decode(CloudCodex.self, forKey: .codex))?.codex
            ?? Codex(monsters: [], equipment: [], bosses: [])
        cosmetics = (try? c.decode(CloudCosmetics.self, forKey: .cosmetics))?.cosmetics
            ?? Cosmetics(tentColor: nil, campfire: nil)

        // 방지권 2종 — 없거나 깨졌으면 0. 상한(99)까지 클램프해 손상된 값이 그대로 살지
        // 않게 한다 (웹 normalizeUpHeroState 의 같은 클램프). legacy `protectCharms`
        // (단일 보호 소모품 시절 키)는 소실방지권으로 읽어준다 — 그 시절 저장본이 남아
        // 있어도 보유가 0 으로 증발하지 않게.
        let guardCap = UpHeroRules.enhanceGuardMax
        destroyGuards = min(guardCap, max(0,
            lenientInt(c, .destroyGuards) ?? lenientInt(c, .protectCharms) ?? 0))
        downGuards = min(guardCap, max(0, lenientInt(c, .downGuards) ?? 0))

        // 굴림틀 전투 버프 — 없거나 깨졌으면 빈 껍데기(0/0). pct [0,100] (퍼센트
        // 포인트) · battlesLeft [0,20] 클램프는 CombatBuff.normalized 가 웹
        // normalizeCombatBuff 그대로 건다.
        combatBuff = (try? c.decode(CloudCombatBuff.self, forKey: .combatBuff)) ?? .empty

        // 굴림틀 pity 스트릭 — 부재·비숫자·NaN 은 0, 소수는 내림, 정수 [0, 1000] 클램프
        // (웹 normalizeSlotBlankStreak 와 동일).
        slotBlankStreak = UpHeroSlot.normalizeBlankStreak(lenientInt(c, .slotBlankStreak))

        // 산 가방 행 — 부재·비숫자·NaN 은 0, 소수는 내림, 정수 [0, 4] 클램프
        // (웹 normalizeBagRowsBought 와 동일).
        bagRowsBought = UpHeroBag.normalizeBagRowsBought(lenientInt(c, .bagRowsBought))

        // 값이 깨졌으면 now — 과거 timestamp 를 지어내 거대한 idle reward 를 만들지 않는다.
        lastIdleAccrualAt = lenientInt(c, .lastIdleAccrualAt)
            ?? Int(Date().timeIntervalSince1970 * 1000)
        ngPlusLevel = max(0, lenientInt(c, .ngPlusLevel) ?? 0)
        hasSeenCampTutorial = (try? c.decode(Bool.self, forKey: .hasSeenCampTutorial)) ?? false
        welcomeGiftClaimed = (try? c.decode(Bool.self, forKey: .welcomeGiftClaimed)) ?? false

        // 옵셔널 — 없으면 키 생략 유지 ("필드 부재 = 로컬 유지" 계약).
        lastSeenAt = lenientInt(c, .lastSeenAt)
        schemaVersion = lenientInt(c, .schemaVersion)
        shopDaily = (try? c.decode(CloudShopDaily.self, forKey: .shopDaily))?.shopDaily
        weeklyVariant = (try? c.decode(CloudWeeklyVariant.self, forKey: .weeklyVariant))?.variant

        if let raw = lenientInt(c, .heroStartLevel) {
            heroStartLevel = max(1, raw)
        } else {
            heroStartLevel = nil
            if hasFootprint { heroStartLevel = 1 }  // legacy 채움 (init(_:) 주석 참고)
        }
    }

    /// 클라우드 쓰기 인코딩 — 웹 encodeUpHeroForCloud. 맵 필드의 "빈 자리" 를
    /// 명시적 null/false 로 채워 setDoc(merge) 병합 누수를 막는다.
    ///
    /// ⚠️ enum 키 딕셔너리([DungeonId: Int] 등)는 CodingKeyRepresentable 미채택이라
    /// 합성 인코딩이 [키, 값, ...] 플랫 배열이 된다 (로컬 uphero.json 이 실제 그 포맷).
    /// 채택을 추가하면 기존 로컬 저장 파일이 깨지므로, 클라우드 쪽만 여기서 String 키
    /// 맵으로 손수 변환한다 — 웹 JSON 오브젝트와 동일해야 하는 건 와이어 포맷뿐이다.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        try c.encode(CloudHero(hero: hero), forKey: .hero)
        try c.encode(inventory.map { CloudEquipment(equipment: $0) }, forKey: .inventory)
        try c.encode(coins, forKey: .coins)
        try c.encode(
            Dictionary(uniqueKeysWithValues: passes.map { ($0.key.rawValue, $0.value) }),
            forKey: .passes)
        try c.encode(
            Dictionary(uniqueKeysWithValues: dungeons.map { ($0.key.rawValue, $0.value) }),
            forKey: .dungeons)
        try c.encode(codex, forKey: .codex)
        try c.encode(CloudCosmetics(cosmetics: cosmetics), forKey: .cosmetics)
        // 0 도 항상 싣는다 — 키를 빼면 setDoc(merge) 가 클라우드에 남은 예전 개수를
        // 되살려, 다 쓴 방지권이 기기를 옮길 때마다 부활한다 (passes 와 같은 이유).
        // legacy `protectCharms` 는 읽기 전용이라 다시 쓰지 않는다.
        try c.encode(destroyGuards, forKey: .destroyGuards)
        try c.encode(downGuards, forKey: .downGuards)
        // 만료돼도 껍데기(0/0)를 싣는다 — 웹이 그렇고, 키를 빼면 merge 가 지난 버프를
        // 되살려 다 쓴 +10% 가 기기를 옮길 때마다 부활한다.
        try c.encode(combatBuff, forKey: .combatBuff)
        // 0 도 항상 싣는다 — 보상 뒤 0 리셋이 merge 에서 빠지면 클라우드의 옛 스트릭이
        // 되살아나 받을 자격이 없는 pity 가 발동한다.
        try c.encode(slotBlankStreak, forKey: .slotBlankStreak)
        // 0 도 항상 싣는다 — 키를 빼면 merge 가 클라우드에 남은 옛 값을 되살려,
        // 코인으로 산 행이 기기를 옮길 때마다 흔들린다 (passes 와 같은 이유).
        try c.encode(bagRowsBought, forKey: .bagRowsBought)
        try c.encode(lastIdleAccrualAt, forKey: .lastIdleAccrualAt)
        try c.encode(ngPlusLevel, forKey: .ngPlusLevel)
        try c.encode(hasSeenCampTutorial, forKey: .hasSeenCampTutorial)
        try c.encode(welcomeGiftClaimed, forKey: .welcomeGiftClaimed)
        try c.encodeIfPresent(lastSeenAt, forKey: .lastSeenAt)
        try c.encodeIfPresent(schemaVersion, forKey: .schemaVersion)
        if let sd = shopDaily {
            try c.encode(CloudShopDaily(shopDaily: sd), forKey: .shopDaily)
        }
        try c.encodeIfPresent(weeklyVariant, forKey: .weeklyVariant)
        try c.encodeIfPresent(heroStartLevel, forKey: .heroStartLevel)
    }
}

// MARK: - Hero 래퍼 (웹 normalizeHero + equipped null 인코딩)

/// Hero 의 클라우드 와이어 래퍼. 도메인 Hero 의 로컬 Codable(합성)과 분리해
/// 로컬 저장 포맷을 건드리지 않고 클라우드 전용 규칙을 적용한다.
private struct CloudHero: Codable {
    var hero: Hero

    private enum K: String, CodingKey {
        case name, hp, maxHp, baseStats, equipped, classType, appearanceVariant
        case autoSkillEnabled, learnedSkills, skillPoints
    }

    init(hero: Hero) { self.hero = hero }

    init(from decoder: Decoder) throws {
        // hero 필드가 오브젝트가 아니면 throw → 호출측이 기본 영웅으로 폴백.
        let c = try decoder.container(keyedBy: K.self)
        var h = UpHeroRules.createDefaultHero()
        h.name = (try? c.decode(String.self, forKey: .name)) ?? h.name
        h.hp = lenientInt(c, .hp) ?? h.hp
        h.maxHp = lenientInt(c, .maxHp) ?? h.maxHp
        h.appearanceVariant = lenientInt(c, .appearanceVariant) ?? h.appearanceVariant
        // 웹: r.classType in DUNGEON_BY_CLASS 일 때만 채택, 아니면 null.
        if let raw = try? c.decode(String.self, forKey: .classType),
           let ct = ClassType(rawValue: raw) {
            h.classType = ct
        } else {
            h.classType = nil
        }
        // baseStats — 기본값 위에 유효한 숫자만 덮는다 (웹 defaults deep merge).
        var stats = h.baseStats
        if let raw = try? c.decode([String: UNLossy<Double>].self, forKey: .baseStats) {
            for (k, v) in raw {
                guard let key = StatKey(rawValue: k), let n = v.value, n.isFinite else { continue }
                stats[key] = Int(n.rounded(.down))
            }
        }
        h.baseStats = stats
        // 빈 슬롯은 키 자체를 생략 — 클라우드 인코딩이 실어 보내는 명시적 null 도
        // UNLossy 디코드 실패로 여기서 걸러진다 (웹 normalizeHero 와 동일).
        var equipped: [EquipSlot: Equipment] = [:]
        if let raw = try? c.decode([String: UNLossy<CloudEquipment>].self, forKey: .equipped) {
            for slot in EquipSlot.allCases {
                if let item = raw[slot.rawValue]?.value?.equipment { equipped[slot] = item }
            }
        }
        h.equipped = equipped
        // 옵셔널 — 키가 있는데 깨진 경우만 교정 (없으면 생략 유지). autoSkillEnabled 는
        // 웹 기본 영웅이 true 를 갖고 있어 부재 시에도 true (createDefaultHero 값 유지).
        h.autoSkillEnabled = (try? c.decode(Bool.self, forKey: .autoSkillEnabled)) ?? true
        h.learnedSkills = c.contains(.learnedSkills) ? (lossyStrings(c, .learnedSkills) ?? []) : nil
        h.skillPoints = c.contains(.skillPoints) ? (lenientInt(c, .skillPoints) ?? 0) : nil
        hero = h
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        try c.encode(hero.name, forKey: .name)
        try c.encode(hero.hp, forKey: .hp)
        try c.encode(hero.maxHp, forKey: .maxHp)
        try c.encode(hero.baseStats, forKey: .baseStats)
        // 장비 해제 후 남는 유령 장비 방지 — 4 슬롯 전부 싣고 빈 슬롯은 명시적 null.
        var eq = c.nestedContainer(keyedBy: SlotKey.self, forKey: .equipped)
        for slot in EquipSlot.allCases {
            let key = SlotKey(slot)
            if let item = hero.equipped[slot] {
                try eq.encode(CloudEquipment(equipment: item), forKey: key)
            } else {
                try eq.encodeNil(forKey: key)
            }
        }
        // 전직 해제/미전직도 명시적 null (키 생략 시 예전 클래스가 클라우드에 남는다).
        if let ct = hero.classType {
            try c.encode(ct, forKey: .classType)
        } else {
            try c.encodeNil(forKey: .classType)
        }
        try c.encode(hero.appearanceVariant, forKey: .appearanceVariant)
        try c.encodeIfPresent(hero.autoSkillEnabled, forKey: .autoSkillEnabled)
        try c.encodeIfPresent(hero.learnedSkills, forKey: .learnedSkills)
        try c.encodeIfPresent(hero.skillPoints, forKey: .skillPoints)
    }

    private struct SlotKey: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init(_ slot: EquipSlot) { stringValue = slot.rawValue }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }
}

// MARK: - Equipment 래퍼 (웹 normalizeEquipment)

/// Equipment 관용 디코드 — 식별에 필요한 최소 필드(id/type)만 검증. 깨졌으면 throw
/// → UNLossy 가 그 원소만 버린다. 인코딩도 여기서 손수 — stats 를 웹처럼 String 키
/// 오브젝트로 싣기 위해서다 (합성 [StatKey: Int] 인코딩은 플랫 배열, encode 주석 참고).
private struct CloudEquipment: Codable {
    var equipment: Equipment

    private enum K: String, CodingKey {
        case id, name, baseId, type, rarity, category, iconName, stats
        case effects, flavor, photoId, enhanceLevel, enhanceFailStreak
        case affix, affixes, talismanSkills
        // 격자 가방 좌표 — 웹 정본과 같은 철자. 여기 빠지면 왕복마다 배치가 지워진다.
        case bagX, bagY, bagRot
    }

    init(equipment: Equipment) { self.equipment = equipment }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        guard let id = try? c.decode(String.self, forKey: .id),
              let typeRaw = try? c.decode(String.self, forKey: .type),
              let type = EquipSlot(rawValue: typeRaw) else {
            throw DecodingError.dataCorrupted(DecodingError.Context(
                codingPath: decoder.codingPath,
                debugDescription: "equipment 필수 필드(id/type) 손상"))
        }
        // 격자 가방 좌표 — 웹 `normalizeEquipmentPlacement` 와 같은 정규화 계약을 와이어에서
        // 바로 적용한다. 여기서 걸러야 도메인·UI 가 좌표를 무조건 신뢰할 수 있다.
        //   유한수면 내림 → bagX 는 0..<cols, bagY 는 0..<rowsMax 여야 유효,
        //   bagRot 은 0...3 이 아니면 0, bagX·bagY 중 하나라도 무효면 셋 다 버린다.
        var bagX = lenientInt(c, .bagX)
        var bagY = lenientInt(c, .bagY)
        var bagRot: Int?
        if let x = bagX, let y = bagY,
           x >= 0, x < UpHeroBag.cols, y >= 0, y < UpHeroBag.rowsMax {
            bagRot = UpHeroBag.normalizeRot(lenientInt(c, .bagRot))
        } else {
            bagX = nil
            bagY = nil
        }
        var affixes: [StatKey]? = nil
        if c.contains(.affixes) {
            affixes = ((try? c.decode([UNLossy<StatKey>].self, forKey: .affixes)) ?? [])
                .compactMap(\.value)
        }
        equipment = Equipment(
            id: id,
            name: (try? c.decode(String.self, forKey: .name)) ?? id,
            baseId: try? c.decode(String.self, forKey: .baseId),
            type: type,
            rarity: (try? c.decode(Rarity.self, forKey: .rarity)) ?? .normal,
            category: (try? c.decode(DungeonId.self, forKey: .category)) ?? .fitness,
            iconName: (try? c.decode(String.self, forKey: .iconName)) ?? "",
            stats: lenientStatMap(c, .stats),
            effects: c.contains(.effects) ? (lossyStrings(c, .effects) ?? []) : nil,
            flavor: try? c.decode(String.self, forKey: .flavor),
            photoId: try? c.decode(String.self, forKey: .photoId),
            enhanceLevel: lenientInt(c, .enhanceLevel),
            enhanceFailStreak: lenientInt(c, .enhanceFailStreak),
            affix: try? c.decode(StatKey.self, forKey: .affix),
            affixes: affixes,
            talismanSkills: c.contains(.talismanSkills)
                ? (lossyStrings(c, .talismanSkills) ?? []) : nil,
            bagX: bagX,
            bagY: bagY,
            bagRot: bagRot
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        let e = equipment
        try c.encode(e.id, forKey: .id)
        try c.encode(e.name, forKey: .name)
        try c.encodeIfPresent(e.baseId, forKey: .baseId)
        try c.encode(e.type, forKey: .type)
        try c.encode(e.rarity, forKey: .rarity)
        try c.encode(e.category, forKey: .category)
        try c.encode(e.iconName, forKey: .iconName)
        try c.encode(
            Dictionary(uniqueKeysWithValues: e.stats.map { ($0.key.rawValue, $0.value) }),
            forKey: .stats)
        try c.encodeIfPresent(e.effects, forKey: .effects)
        try c.encodeIfPresent(e.flavor, forKey: .flavor)
        try c.encodeIfPresent(e.photoId, forKey: .photoId)
        try c.encodeIfPresent(e.enhanceLevel, forKey: .enhanceLevel)
        try c.encodeIfPresent(e.enhanceFailStreak, forKey: .enhanceFailStreak)
        try c.encodeIfPresent(e.affix, forKey: .affix)
        try c.encodeIfPresent(e.affixes, forKey: .affixes)
        try c.encodeIfPresent(e.talismanSkills, forKey: .talismanSkills)
        // 미배치는 세 키를 함께 생략한다 — 웹의 "키 삭제" 와 바이트 동일한 와이어.
        try c.encodeIfPresent(e.bagX, forKey: .bagX)
        try c.encodeIfPresent(e.bagY, forKey: .bagY)
        try c.encodeIfPresent(e.bagRot, forKey: .bagRot)
    }
}

// MARK: - 소형 래퍼들

/// DungeonProgress 관용 디코드 — dungeonId 는 맵 키 폴백 (웹 normalizeDungeons).
private struct CloudDungeonProgress: Decodable {
    private var dungeonId: DungeonId?
    private var floorReached: Int
    private var bestFloorReached: Int?
    private var bossesDefeated: [Int]

    private enum K: String, CodingKey {
        case dungeonId, floorReached, bestFloorReached, bossesDefeated
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        dungeonId = try? c.decode(DungeonId.self, forKey: .dungeonId)
        floorReached = lenientInt(c, .floorReached) ?? 0
        bestFloorReached = lenientInt(c, .bestFloorReached)
        bossesDefeated = ((try? c.decode([UNLossy<Double>].self, forKey: .bossesDefeated)) ?? [])
            .compactMap { $0.value.map { Int($0.rounded(.down)) } }
    }

    func resolved(fallbackId: DungeonId) -> DungeonProgress {
        DungeonProgress(
            dungeonId: dungeonId ?? fallbackId,
            floorReached: floorReached,
            // initialize 의 backfill 과 동일 — 없으면 floorReached 로 채운다.
            bestFloorReached: bestFloorReached ?? floorReached,
            bossesDefeated: bossesDefeated)
    }
}

/// Codex 관용 디코드 (웹 normalizeCodex). 인코딩은 도메인 합성 Codable 사용.
private struct CloudCodex: Decodable {
    var codex: Codex

    private enum K: String, CodingKey { case monsters, equipment, bosses }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        codex = Codex(
            monsters: lossyStrings(c, .monsters) ?? [],
            equipment: lossyStrings(c, .equipment) ?? [],
            bosses: lossyStrings(c, .bosses) ?? [])
    }
}

/// Cosmetics 래퍼 — 디코드는 관용(웹 normalizeCosmetics), 인코드는 nil 키 생략.
/// 굴림틀 전투 버프의 클라우드 와이어 래퍼 — 웹 `normalizeCombatBuff` 재현.
///
/// 웹은 만료·부재·손상을 전부 `{pct: 0, battlesLeft: 0}` 껍데기로 표현한다
/// (undefined 가 아니다). 도메인 쪽 `CombatBuff?` 와 와이어 쪽 "항상 있는 맵" 사이를
/// 여기서 옮겨 준다. 관용 디코드 — 숫자가 아니어도 throw 하지 않고 0 으로 접는다.
struct CloudCombatBuff: Codable, Equatable {
    /// nil = 버프 없음 (와이어에서는 0/0 껍데기).
    var buff: CombatBuff?

    static let empty = CloudCombatBuff(nil)

    init(_ buff: CombatBuff?) { self.buff = buff?.normalized }

    private enum K: String, CodingKey { case pct, battlesLeft }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        // battlesLeft 는 웹이 Math.floor 로 자른다 — 소수가 들어와도 같은 정수가 되게.
        let pct = (try? c.decode(Double.self, forKey: .pct)) ?? 0
        let rawLeft = (try? c.decode(Double.self, forKey: .battlesLeft)) ?? 0
        let left = rawLeft.isFinite ? Int(rawLeft.rounded(.down)) : 0
        buff = CombatBuff.normalized(pct: pct, battlesLeft: left)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        try c.encode(buff?.pct ?? 0, forKey: .pct)
        try c.encode(buff?.battlesLeft ?? 0, forKey: .battlesLeft)
    }
}

private struct CloudCosmetics: Codable {
    var cosmetics: Cosmetics

    private enum K: String, CodingKey { case tentColor, campfire }

    init(cosmetics: Cosmetics) { self.cosmetics = cosmetics }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        cosmetics = Cosmetics(
            tentColor: try? c.decode(String.self, forKey: .tentColor),
            campfire: try? c.decode(String.self, forKey: .campfire))
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        try c.encodeIfPresent(cosmetics.tentColor, forKey: .tentColor)
        try c.encodeIfPresent(cosmetics.campfire, forKey: .campfire)
    }
}

/// ShopDaily 래퍼 — date 없으면 의미 없는 카운터라 통째로 버린다 (웹 normalizeShopDaily).
/// 인코드는 coinPouchClaimed(기본 false)와 slotSpins(기본 0)를 **항상** 싣는다: 날짜가
/// 바뀌며 키가 빠지면 setDoc(merge) 에 어제의 true / 어제의 횟수가 남아 오늘 코인
/// 주머니를 못 받거나 굴림틀 상한이 하루 일찍 닫힌다.
///
/// slotSpins — 와이어 키 "slotSpins" (웹과 바이트 동일), 관용 디코드: 부재·비숫자·NaN 은
/// 0, 소수는 내림, 정수 [0, `UpHeroSlot.spinsWireMax`(100)] 클램프 (웹 normalizeSlotSpins).
private struct CloudShopDaily: Codable {
    var shopDaily: ShopDaily

    private enum K: String, CodingKey { case date, passesBought, coinPouchClaimed, slotSpins }

    init(shopDaily: ShopDaily) { self.shopDaily = shopDaily }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let date = try c.decode(String.self, forKey: .date)
        shopDaily = ShopDaily(
            date: date,
            passesBought: max(0, lenientInt(c, .passesBought) ?? 0),
            coinPouchClaimed: try? c.decode(Bool.self, forKey: .coinPouchClaimed),
            slotSpins: UpHeroSlot.normalizeSpins(lenientInt(c, .slotSpins)))
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        try c.encode(shopDaily.date, forKey: .date)
        try c.encode(shopDaily.passesBought, forKey: .passesBought)
        try c.encode(shopDaily.coinPouchClaimed ?? false, forKey: .coinPouchClaimed)
        try c.encode(UpHeroSlot.normalizeSpins(shopDaily.slotSpins), forKey: .slotSpins)
    }
}

/// WeeklyVariant 관용 디코드 — week/affixId 가 깨졌으면 통째 생략 (웹 normalizeWeeklyVariant).
/// 인코딩은 도메인 합성 Codable (키 동일, lastUploadedAt 은 nil 시 생략).
private struct CloudWeeklyVariant: Decodable {
    var variant: WeeklyVariant

    private enum K: String, CodingKey {
        case week, affixId, clearedDungeons, bestScore, lastUploadedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let week = try c.decode(String.self, forKey: .week)
        let affixId = try c.decode(String.self, forKey: .affixId)
        let cleared = ((try? c.decode([UNLossy<DungeonId>].self, forKey: .clearedDungeons)) ?? [])
            .compactMap(\.value)
        variant = WeeklyVariant(
            week: week,
            affixId: affixId,
            clearedDungeons: cleared,
            bestScore: max(0, lenientInt(c, .bestScore) ?? 0),
            lastUploadedAt: lenientInt(c, .lastUploadedAt))
    }
}

// MARK: - Firestore 브리징

extension CloudUpHeroState {

    /// Firestore 문서의 uphero 맵 → 페이로드. 부재/비맵/직렬화 불가면 nil —
    /// 손상된 uphero 가 progress 동기화를 막지 않는다 (웹: uphero 는 별도 관용 디코드).
    static func decodeFirestore(_ raw: Any?) -> CloudUpHeroState? {
        guard let map = raw as? [String: Any],
              JSONSerialization.isValidJSONObject(map),
              let data = try? JSONSerialization.data(withJSONObject: map) else { return nil }
        return try? JSONDecoder().decode(CloudUpHeroState.self, from: data)
    }

    /// 페이로드 → setData 용 딕셔너리. JSONEncoder 를 거치므로 XCTest 가 검증하는
    /// JSON 와이어 포맷과 정확히 같은 바이트 구조다 (빈 슬롯 = NSNull).
    func firestoreValue() -> [String: Any]? {
        guard let data = try? JSONEncoder().encode(self),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return obj
    }
}
