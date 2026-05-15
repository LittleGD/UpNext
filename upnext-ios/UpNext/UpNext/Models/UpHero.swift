//
//  UpHero.swift
//  UpNext 모델 — Up Hero (방치형 RPG) 타입 시스템.
//
//  웹 src/types/uphero.ts (1,493줄) 1:1 포팅.
//  Phase 2.4 (RPG 엔진) 의 "타입" 단계 산출물 — 전투/스킬 엔진이 의존하는
//  모든 타입·상수·순수 함수를 한 파일에 누적.
//
//  설계 노트:
//   - TypeScript discriminated union → Swift enum with associated values
//     (SimpleChoiceEffect / ChoiceEffect / LogEntry / BuffEffect).
//   - Codable 준수는 Phase 3 (영속화/Firestore) 로 유보. 전투 엔진은 in-memory
//     값만 다루므로 Codable 불필요. union 들의 custom Codable 은 영속 스키마가
//     확정되는 Phase 3 에서 일괄 작성한다.
//   - Math.round → .rounded(): uphero.ts 의 모든 round 호출은 양수 도메인
//     (레벨/스탯/점수) 이라 JS Math.round 와 Swift .rounded() 결과가 동일.
//

import Foundation

// MARK: - 식별자 / 기본 enum

/// 던전 ID = 챌린지 카테고리 (8개 1:1 매핑). 웹 `type DungeonId = Category`.
typealias DungeonId = Category

/// 장비 슬롯. 웹 `EquipSlot`.
enum EquipSlot: String, CaseIterable, Hashable {
    case weapon
    case armor
    case accessory
    case talisman
}

/// 클래스 타입 — Lv30 이후 주요 카테고리로 분화. 웹 `ClassType`.
enum ClassType: String, CaseIterable, Hashable {
    case warrior        // 운동
    case mage           // 학습
    case monk           // 명상
    case druid          // 식단
    case bard           // 소통
    case chronomancer   // 생산성
    case priest         // 건강
    case illusionist    // 트렌딩
}

/// 스탯 키. 웹은 `StatKey`(6종, 차트축) 와 `keyof HeroBaseStats`(7종) 를 구분하나
/// Swift 는 slotBonus 포함 7종으로 통합 — 6종이 필요한 곳(차트)은 slotBonus 만 제외.
enum StatKey: String, CaseIterable, Hashable {
    case str, int, vit, dex, agi, crit, slotBonus
}

/// 몬스터 실루엣 타입. 웹 `MonsterKind`.
enum MonsterKind: String, CaseIterable, Hashable {
    case beast, goblin, spirit, construct, book, creature, large
}

/// 몬스터 고유 특성 (trait). 웹 `MonsterTrait`.
enum MonsterTrait: String, CaseIterable, Hashable {
    case tough      // HP +50%, ATK -20%
    case fragile    // HP -30%, ATK +40%
    case swift      // hero miss 확률 +8%
    case burst      // crit 확률 +12%
    case poison     // 피격 시 영웅에 독 DoT
    case regen      // 매 round 최대 HP 5% 회복
    case shield     // 처음 2회 피격 -50%
}

/// 인터랙티브 미니게임 id. 웹 `MinigameId`.
enum MinigameId: String, CaseIterable, Hashable {
    case pipeConnect = "pipe_connect"
    case pairMatch = "pair_match"
    case sequenceMemo = "sequence_memo"
    case tapBurst = "tap_burst"
    case dodgeDrops = "dodge_drops"
    case sortItems = "sort_items"
    case quickSum = "quick_sum"
    case spotDiff = "spot_diff"
    case breathHold = "breath_hold"
    case tracePath = "trace_path"
    case reactionTap = "reaction_tap"
}

/// Choice entry 구분자. 웹 `ChoiceVariant`.
enum ChoiceVariant: String, Hashable {
    case event       // 분기 이벤트 (수상한 상인, 샘 등)
    case encounter   // 일반 몬스터 조우 (싸운다/도망)
}

/// 전투 판정 결과. 웹 `CombatOutcome`.
enum CombatOutcome: String, Hashable {
    case hit, crit, dodge, miss
}

/// 전투 행위자. 웹 combat LogEntry 의 `attacker: "hero" | "enemy"`.
enum CombatActor: String, Hashable {
    case hero, enemy
}

/// 세션 종료 사유. 웹 `SessionEndReason` (legacy 값 포함).
enum SessionEndReason: String, Hashable {
    case bossDefeated   // 최종 보스 처치
    case heroDied       // HP 0
    case timeExpired    // 탐험 시간 소진
    case heroAbandoned  // 사용자 자발 복귀
    // legacy — 기존 저장 세션 호환
    case victory
    case defeat
    case abandoned
}

/// 전투 세션 상태. 웹 `CombatSessionStatus`.
enum CombatSessionStatus: String, Hashable {
    case active
    case paused
    case awaitingChoice
    case awaitingMinigame
    case completed
}

/// 클래스 자원 획득 트리거 이벤트. 웹 `ResourceEvent`.
enum ResourceEvent: String, CaseIterable, Hashable {
    case attack       // 영웅 공격 (hit/crit)
    case hit          // 영웅 피격
    case dodge        // 영웅 dodge 성공
    case crit         // 영웅 crit 성공
    case heal         // heal 효과 발동
    case victory      // 일반 몬스터 처치
    case floor        // 층 이동
    case choice       // 이벤트 선택 해결
    case roundStart   // 전투 round 시작
}

/// 버프 특수 효과 종류 — rare+ 에서만. 웹 `SpecialEffect`.
enum SpecialEffect: String, Hashable {
    case dropRate          // 장비 드롭 확률 ↑
    case monsterFrequency  // 몬스터 조우 빈도 ↓
    case coinBoost         // 코인 획득 ↑
    case xpBoost           // XP 획득 ↑
    case critBonus         // 크리 확률 ↑
    case healStart         // 세션 시작 HP 보너스
}

/// 몬스터 trait 지속 효과 tick 종류. 웹 monsterEffect LogEntry 의 `effect`.
enum MonsterEffectKind: String, Hashable {
    case regen, poisonTick, shieldBlock
}

/// skill LogEntry 의 발동 주체. 웹 `ClassType | "novice"`.
enum SkillLogClass: String, Hashable {
    case warrior, mage, monk, druid, bard, chronomancer, priest, illusionist
    case novice   // 전직 전 튜토리얼성 스킬
}

// MARK: - 영웅 스탯

/// 영웅 기본 스탯 (완전 레코드 — 7키 모두 존재). 웹 `HeroBaseStats`.
struct HeroBaseStats: Equatable {
    var str: Int
    var int: Int
    var vit: Int
    var dex: Int
    var agi: Int
    var crit: Int       // 크리 보너스 (%) — 장비로만, hero base = 0
    var slotBonus: Int  // 버프 슬롯 보너스 — unique/legend accessory·talisman

    /// StatKey 동적 접근 — 웹 `stats[k as keyof HeroBaseStats] += v` 패턴 대응.
    subscript(_ key: StatKey) -> Int {
        get {
            switch key {
            case .str: return str
            case .int: return int
            case .vit: return vit
            case .dex: return dex
            case .agi: return agi
            case .crit: return crit
            case .slotBonus: return slotBonus
            }
        }
        set {
            switch key {
            case .str: str = newValue
            case .int: int = newValue
            case .vit: vit = newValue
            case .dex: dex = newValue
            case .agi: agi = newValue
            case .crit: crit = newValue
            case .slotBonus: slotBonus = newValue
            }
        }
    }
}

// MARK: - 영웅 / 장비

/// 영웅. 웹 `Hero` (level/xp 는 useGameStore.progress 와 동기 — 여기 별도 추적 X).
struct Hero: Equatable {
    var name: String
    var hp: Int
    var maxHp: Int
    var baseStats: HeroBaseStats
    /// 장착 장비 — 슬롯별 0~1개. 웹 `Partial<Record<EquipSlot, Equipment>>`.
    var equipped: [EquipSlot: Equipment]
    var classType: ClassType?
    var appearanceVariant: Int       // 0-2 (Lv별 외형)
    var autoSkillEnabled: Bool?      // Phase 6b — 액티브 스킬 자동 발동 on/off
    var learnedSkills: [String]?     // Phase 12d — 해금된 스킬 id 목록
    var skillPoints: Int?            // Phase 12d — 남은 스킬 포인트
}

/// 장비 카드. 웹 `Equipment`.
struct Equipment: Equatable, Identifiable {
    var id: String
    var name: String                // i18n key 또는 직접 문자열
    var baseId: String?              // EQUIPMENT_TEMPLATES baseId 매핑 (다국어용)
    var type: EquipSlot
    var rarity: Rarity
    var category: DungeonId          // 출처 카테고리
    var iconName: String             // PixelIcon 이름
    /// 부여 스탯 — 부분 레코드. 웹 `Partial<HeroBaseStats>`.
    var stats: [StatKey: Int]
    var effects: [String]?           // 특수 효과 설명
    var flavor: String?
    var photoId: String?             // Phase 7 — 사진 부적 원본 photo id
    var enhanceLevel: Int?           // Phase 11a — 강화 레벨 0~10
    var enhanceFailStreak: Int?      // Phase 11c — 연속 강화 실패 streak
    var affix: StatKey?              // Phase 11a — 2차 affix stat key
    var affixes: [StatKey]?          // Phase 11a — legend 전용 3차 affix
    var talismanSkills: [String]?    // Phase 11b — 사진 부적 passive skill id
}

// MARK: - 몬스터 / 던전

/// 몬스터. 웹 `Monster`.
struct Monster: Equatable, Identifiable {
    var id: String
    var name: String
    var templateId: String?    // 원본 MonsterTemplate id (다국어용)
    var kind: MonsterKind
    var level: Int
    var hp: Int
    var maxHp: Int?            // Phase 14 — scaleMonster 확정 최대 HP (regen cap)
    var atk: Int
    var def: Int
    var xpReward: Int
    var coinReward: Int
    var isBoss: Bool?
    var dungeonId: DungeonId
    var trait: MonsterTrait?
}

/// 던전 정의. 웹 `Dungeon`.
struct Dungeon: Equatable, Identifiable {
    var id: DungeonId
    var name: String
    var themeColor: String     // CSS color
    var affinity: EquipSlot    // 친화 장비 슬롯
    var bossIds: [String]      // [미니보스, 중간보스, 최종보스] — 3개 고정
}

/// 던전 진행 상황 (영속 저장). 웹 `DungeonProgress`.
struct DungeonProgress: Equatable {
    var dungeonId: DungeonId
    var floorReached: Int       // 재진입 기준 — 사망 시 30단위 체크포인트로 floor down
    var bestFloorReached: Int   // 역대 최고 도달 — 절대 후퇴 X
    var bossesDefeated: [Int]   // [10, 20, 30] 중 처치한 floor
}

// MARK: - 이벤트 효과 (discriminated union)

/// 미니게임 결과에 적용 가능한 단순 효과 (재귀 방지용 — startMinigame/fight/flee 제외).
/// 웹 `SimpleChoiceEffect`.
enum SimpleChoiceEffect: Equatable {
    case reward(coins: Int?, xp: Int?, dropEquipmentId: String?)
    case damage(amount: Int)
    case heal(amount: Int)
    case time(delta: Int)              // 음수 = 소모, 양수 = 회복
    case skipFloors(count: Int)
    case revealBoss
    case nothing
}

/// 이벤트 선택지 효과. 웹 `ChoiceEffect` (discriminated union).
enum ChoiceEffect: Equatable {
    case reward(coins: Int?, xp: Int?, dropEquipmentId: String?)
    case damage(amount: Int)
    case heal(amount: Int)
    case skipFloors(count: Int)
    case revealBoss
    case nothing
    case time(delta: Int)              // 음수 = 소모, 양수 = 회복
    case fight                         // 즉시 전투 round 시작
    case flee(successChance: Double)   // agi/level 기반 도주
    /// Phase 12e — 인터랙티브 미니게임 시작. difficulty 는 1|2|3.
    case startMinigame(
        minigame: MinigameId,
        difficulty: Int,
        successEffects: [SimpleChoiceEffect],
        failEffects: [SimpleChoiceEffect]
    )
}

/// Choice 옵션. 웹 `ChoiceOption`.
struct ChoiceOption: Equatable {
    var label: String
    var labelKey: String?               // i18n key
    var labelParams: NarrativeParams?   // runtime 주입 토큰
    var effect: ChoiceEffect?           // 단일 효과 (legacy fallback)
    var outcomes: [ChoiceOutcome]?      // 가중 확률 분기 (있으면 effect 대신 사용)
    var resultText: String?
    var resultTextKey: String?
}

/// Choice 옵션의 확률적 결과. 웹 `ChoiceOutcome`.
struct ChoiceOutcome: Equatable {
    var weight: Int                  // 상대 가중치 (합산되어 normalize)
    var resultText: String
    var resultTextKey: String?
    var effects: [ChoiceEffect]      // 순차 적용할 효과
}

// MARK: - 전투 로그

/// narrative i18n 파라미터 값 — 문자열 또는 숫자. 웹 `string | number`.
enum NarrativeValue: Equatable {
    case text(String)
    case number(Double)
}

/// narrative i18n 파라미터 맵. 웹 `NarrativeParams = Record<string, string|number>`.
typealias NarrativeParams = [String: NarrativeValue]

/// choiceResult 로그의 효과 요약 (다국어). 웹 LogEntry 의 `effectSummaryData`.
struct EffectSummaryData: Equatable {
    var xp: Int?
    var coins: Int?
    var heal: Int?
    var damage: Int?
    var timeDelta: Int?
}

/// 전투 로그 엔트리. 웹 `LogEntry` (13-case discriminated union).
enum LogEntry: Equatable {
    case narrative(
        text: String, narrativeKey: String?, narrativeParams: NarrativeParams?,
        timestamp: Int)
    case encounter(monster: Monster, timestamp: Int)
    case combat(
        attacker: CombatActor, damage: Int, outcome: CombatOutcome,
        narrative: String?, narrativeKey: String?, narrativeParams: NarrativeParams?,
        timestamp: Int)
    case victory(
        monster: Monster, xp: Int, coins: Int,
        narrativeKey: String?, narrativeParams: NarrativeParams?, timestamp: Int)
    case drop(equipment: Equipment, timestamp: Int)
    case treasure(
        coins: Int, description: String,
        narrativeKey: String?, narrativeParams: NarrativeParams?, timestamp: Int)
    case floor(from: Int, to: Int, timestamp: Int)
    case boss(monster: Monster, floor: Int, timestamp: Int)
    case choice(
        prompt: String, promptKey: String?, promptParams: NarrativeParams?,
        options: [ChoiceOption], resolvedIndex: Int?, variant: ChoiceVariant?,
        timeoutMs: Int?, defaultOptionIndex: Int?, isMystery: Bool?, timestamp: Int)
    case sessionEnd(
        reason: SessionEndReason, detail: String?, detailKey: String?,
        detailMonsterTemplateId: String?, detailMonsterFallback: String?,
        detailFloor: Int?, timestamp: Int)
    case skill(
        classType: SkillLogClass, skillId: String?, skillName: String,
        narrative: String, narrativeKey: String?, narrativeParams: NarrativeParams?,
        timestamp: Int)
    case monsterEffect(
        effect: MonsterEffectKind, amount: Int,
        narrative: String?, narrativeKey: String?, narrativeParams: NarrativeParams?,
        timestamp: Int)
    case choiceResult(
        text: String, effectSummary: String?, effectSummaryData: EffectSummaryData?,
        actionLabelKey: String?, actionLabelFallback: String?,
        resultTextKey: String?, resultTextFallback: String?, timestamp: Int)
}

// MARK: - 전투 세션

/// 세션 누적 보상. 웹 CombatSession.rewards.
struct SessionRewards: Equatable {
    var xp: Int
    var coins: Int
    var drops: [Equipment]
}

/// 영웅 공격 배율 지속 효과. 웹 CombatSession.heroAtkBonusRounds.
struct AtkBonusEffect: Equatable {
    var rounds: Int
    var mult: Double
}

/// 영웅 피해 감소 지속 효과. 웹 CombatSession.heroDmgReductionRounds.
struct DmgReductionEffect: Equatable {
    var rounds: Int
    var reduction: Double
}

/// 영웅 독 DoT. 웹 CombatSession.heroPoisonRounds.
struct PoisonEffect: Equatable {
    var rounds: Int
    var dmgPerRound: Int
}

/// 진행 중인 미니게임 상태. 웹 CombatSession.pendingMinigame.
struct PendingMinigame: Equatable {
    var minigame: MinigameId
    var difficulty: Int                    // 1|2|3
    var successEffects: [SimpleChoiceEffect]
    var failEffects: [SimpleChoiceEffect]
}

// `TalismanModifiers` 는 TalismanSkills.swift 에 정의 — CombatSession.talismanMods 가 참조.

/// 전투 세션 — 현재 진행 중인 던전 탐험. 웹 `CombatSession`.
struct CombatSession: Equatable {
    var dungeonId: DungeonId
    var startFloor: Int
    var currentFloor: Int
    var log: [LogEntry]
    var hero: Hero                       // 세션 시작 시점 영웅 스냅샷
    var rewards: SessionRewards
    var status: CombatSessionStatus
    var pendingChoiceIndex: Int?
    var speed: Int                       // tick 배율 — 1|2|4
    var activeBuffs: [CardBuff]?         // Phase 4b — 던전 진입 전 카드 버프
    var time: Int                        // Phase 4c.1 — 탐험 시간 리소스
    var maxTime: Int
    var skillCooldown: Int?              // Phase 6b — 액티브 스킬 쿨다운 (T1용 legacy)
    var classResource: Int?              // Phase 12d — 클래스 자원 0-100
    var skillCooldowns: [String: Int]?   // Phase 12d — 스킬별 개별 쿨다운
    var heroAtkBonusRounds: AtkBonusEffect?
    var enemyStunnedRounds: Int?
    var heroDmgReductionRounds: DmgReductionEffect?
    var guaranteedCritAttacks: Int?
    var heroInvulnerableRounds: Int?
    var revivePending: Bool?
    var pendingMinigame: PendingMinigame?
    var recentEventPrompts: [String]?    // Phase 12 R1 — 최근 prompt LRU (max 3)
    var nextHeroDamageMult: Double?      // Phase 6b — 다음 공격 damage 배율
    var forcedDodgeRounds: Int?          // Phase 6b — 강제 dodge 유지 round
    var forcedEnemyMisses: Int?          // Phase 6b — 적 강제 miss 유지 횟수
    var nextCoinMult: Double?            // Phase 6b — 다음 victory coin 배율
    var talismanMods: TalismanModifiers? // Phase 11b — 부적 passive modifier
    var extraDropAvailable: Bool?        // Phase 11b — 보너스 drop 1회
    var talismanAgiStack: Int?           // Phase 11b — 누적 agi 보너스
    var roundCounter: Int?               // Phase 11b-fix — round 순번 (1부터)
    var ngPlusLevel: Int?                // Phase 11c — NG+ 레벨 스냅샷
    var heroLevel: Int?                  // 세션 시작 시점 영웅 레벨
    var isWeeklyVariant: Bool?           // Phase 11c — 주간 악몽 던전 모드
    var weeklyAffixId: String?           // Phase 11c — 적용된 weekly affix id
    var monsterAtkMult: Double?          // Phase 11c — 몬스터 ATK 배율
    var monsterHpMult: Double?           // Phase 11c — 몬스터 HP 배율
    var xpMult: Double?                  // Phase 11c — XP 보상 배율
    var monsterCritBonus: Double?        // Phase 11c R1 — 몬스터 crit 확률 가산
    var heroPoisonRounds: PoisonEffect?  // Phase 14 — 영웅 독 DoT
    var monsterRegenAmount: Int?         // Phase 14 — 몬스터 round 당 회복량
    var monsterShieldHits: Int?          // Phase 14 — 몬스터 shield 남은 횟수
    var flattenDropRarity: Bool?         // Phase 11c R1 — 드롭 등급 균등화
    var restChanceBonus: Double?         // Phase 11c R1 — 휴식처 확률 가산
    var mysteryFloors: [Int]?            // Phase 12 — "?" mystery event floor 목록
    var startedAt: Int
}

/// 던전 진입 전 버프 drawing 상태. 웹 `PendingDungeonPrep`.
struct PendingDungeonPrep: Equatable {
    var dungeonId: DungeonId
    var drawnCardIds: [String]
}

// MARK: - 버프

/// 버프 효과 — 3종 discriminated union. 웹 `BuffEffect`.
enum BuffEffect: Equatable {
    /// 모든 rarity — 스탯 가산.
    case stat(stats: [StatKey: Int])
    /// rare+ — 특수 효과.
    case special(type: SpecialEffect, value: Double)
    /// unique+ — 카테고리 친화 배율.
    case affinity(category: DungeonId, multiplier: Double)
}

/// 카드 뒷면 버프. 웹 `CardBuff`.
struct CardBuff: Equatable {
    var effects: [BuffEffect]    // 1-3개 효과 조합
    var description: String      // 카드 뒷면 표시용 요약
}

// MARK: - 자원 / 코덱스 / 꾸미기

/// 클래스별 자원 명세. 웹 `ClassResourceSpec`.
struct ClassResourceSpec: Equatable {
    var name: String              // 표시 이름 (예: "분노")
    var short: String             // 약어 (예: "RAGE")
    var color: String             // 자원 bar 색상
    var gain: [ResourceEvent: Int] // 이벤트별 gain 량
}

/// 도감 — 발견한 몬스터/장비/보스 ID 모음. 웹 `Codex`.
struct Codex: Equatable {
    var monsters: [String]
    var equipment: [String]
    var bosses: [String]
}

/// 꾸미기 옵션. 웹 `Cosmetics`.
struct Cosmetics: Equatable {
    var tentColor: String?
    var campfire: String?
}

/// idle accrual 결과 snapshot. 웹 `IdleRewardSnapshot`
/// (idleAccrual.ts 의 `IdleReward` 와 구조 동일 — 웹 모듈 분리상 별도 타입).
struct IdleRewardSnapshot: Equatable {
    var xp: Int
    var coins: Int
    var elapsedMin: Int
    var rawElapsedMin: Int
}

/// 갓생 상점 일일 구매 카운터. 웹 UpHeroState.shopDaily.
struct ShopDaily: Equatable {
    var date: String
    var passesBought: Int
    var coinPouchClaimed: Bool?
}

/// 주간 악몽 던전 진행 상태. 웹 UpHeroState.weeklyVariant.
struct WeeklyVariant: Equatable {
    var week: String                  // ISO week id (예: "2026-W16")
    var affixId: String
    var clearedDungeons: [DungeonId]
    var bestScore: Int
    var lastUploadedAt: Int?
}

/// 전직 선택 UI 표시용. 웹 UpHeroState.pendingClassChoice.
struct PendingClassChoice: Equatable {
    var recommended: ClassType
}

// MARK: - Up Hero 전체 상태

/// Up Hero 전체 상태. 웹 `UpHeroState`.
struct UpHeroState: Equatable {
    var hero: Hero
    var inventory: [Equipment]
    var coins: Int
    /// 탐험권 보유량 — 카테고리별. 웹 `ExpeditionPasses`.
    var passes: [DungeonId: Int]
    var dungeons: [DungeonId: DungeonProgress]
    var currentSession: CombatSession?
    var pendingDungeon: PendingDungeonPrep?
    var codex: Codex
    var cosmetics: Cosmetics
    var lastIdleAccrualAt: Int
    var lastSeenAt: Int?              // Phase 14 — 시계 되감기 탐지용
    var heroStartLevel: Int?          // Phase 9d — 영웅 시작 시점 챌린지 레벨
    var shopDaily: ShopDaily?
    var ngPlusLevel: Int?             // Phase 11c — NG+ 레벨
    var weeklyVariant: WeeklyVariant?
    var schemaVersion: Int?           // Phase 5a.3 — 저장 스키마 버전
    var hasSeenCampTutorial: Bool?
    var idleReward: IdleRewardSnapshot?    // transient — persist X
    var pendingClassAwaken: ClassType?     // transient — persist X
    var pendingClassChoice: PendingClassChoice?  // transient — persist X
    var isLoaded: Bool
}

// MARK: - 상점 가격

/// 갓생 코인 상점 가격. 웹 `SHOP_PRICES`.
enum ShopPrices {
    static let ticket = 50
    static let cardPackSmall = 200   // 1장
    static let cardPackFull = 800    // 5장 (level-up pack)
    static let enhance = 30
    static let fastForward = 20
    static let reroll = 50
    static let expeditionPass = 80   // Phase 11a — 탐험권 1장
}

// MARK: - 클래스 메타

/// 클래스 한국어 이름 + 패시브 설명 + 아이콘. 웹 `CLASS_META` 의 value.
struct ClassMeta: Equatable {
    let name: String
    let passive: String
    let icon: String
}

// MARK: - 규칙 상수 + 순수 함수

/// uphero.ts 의 top-level const / function 묶음. 웹은 모듈 전역, Swift 는 네임스페이스.
enum UpHeroRules {

    // ── 클래스 ↔ 던전 매핑 ────────────────────────────────────────

    /// 8 dungeon → 8 class. 웹 `CLASS_BY_DUNGEON`.
    static let classByDungeon: [DungeonId: ClassType] = [
        .fitness: .warrior,
        .learning: .mage,
        .mindfulness: .monk,
        .nutrition: .druid,
        .social: .bard,
        .productivity: .chronomancer,
        .wellness: .priest,
        .trending: .illusionist,
    ]

    /// 역방향 — class → 원래 카테고리. 웹 `DUNGEON_BY_CLASS`.
    static let dungeonByClass: [ClassType: DungeonId] = [
        .warrior: .fitness,
        .mage: .learning,
        .monk: .mindfulness,
        .druid: .nutrition,
        .bard: .social,
        .chronomancer: .productivity,
        .priest: .wellness,
        .illusionist: .trending,
    ]

    /// 클래스 메타 (이름/패시브/아이콘). 웹 `CLASS_META`.
    static let classMeta: [ClassType: ClassMeta] = [
        .warrior: ClassMeta(name: "전사", passive: "전투 round 당 HP +2 회복", icon: "Sword"),
        .mage: ClassMeta(name: "마법사", passive: "모든 XP 획득 +20%", icon: "BookOpen"),
        .monk: ClassMeta(name: "수도승", passive: "회피 확률 +10%", icon: "Moon"),
        .druid: ClassMeta(name: "드루이드", passive: "회복 효과 +30%", icon: "Coffee"),
        .bard: ClassMeta(name: "음유시인", passive: "코인 획득 +25%", icon: "Message"),
        .chronomancer: ClassMeta(name: "시간술사", passive: "탐험 시간 소모 -25%", icon: "Clock"),
        .priest: ClassMeta(name: "사제", passive: "세션 시작 HP +50", icon: "Heart"),
        .illusionist: ClassMeta(name: "환영술사", passive: "치명타 확률 +8%", icon: "Sparkle"),
    ]

    /// 클래스별 sprite/UI 테마 색. 웹 `CLASS_THEME_COLOR`.
    static let classThemeColor: [ClassType: String] = [
        .warrior: "#87b87a",
        .mage: "#a5c8db",
        .monk: "#c9b8e8",
        .druid: "#e8d88b",
        .bard: "#e8a8a8",
        .chronomancer: "#bca88b",
        .priest: "#8bc9c9",
        .illusionist: "#cdf564",
    ]

    // ── 클래스 자원 ───────────────────────────────────────────────

    /// 클래스별 고유 자원 시스템. 웹 `CLASS_RESOURCE`.
    static let classResource: [ClassType: ClassResourceSpec] = [
        .warrior: ClassResourceSpec(
            name: "분노", short: "RAGE", color: "#e88b7a",
            gain: [.attack: 15, .hit: 10, .crit: 20]),
        .mage: ClassResourceSpec(
            name: "마나", short: "MANA", color: "#8bb9e8",
            gain: [.roundStart: 14, .attack: 3, .victory: 15]),
        .monk: ClassResourceSpec(
            name: "기", short: "CHI", color: "#cdb887",
            gain: [.hit: 20, .attack: 5, .dodge: 15]),
        .druid: ClassResourceSpec(
            name: "자연력", short: "NAT", color: "#87c87a",
            gain: [.roundStart: 5, .heal: 15, .floor: 10]),
        .bard: ClassResourceSpec(
            name: "영감", short: "INSP", color: "#e8c76b",
            gain: [.victory: 15, .attack: 8, .choice: 5]),
        .chronomancer: ClassResourceSpec(
            name: "시간 파편", short: "TIME", color: "#a5c8db",
            gain: [.floor: 15, .choice: 10, .roundStart: 8, .attack: 3]),
        .priest: ClassResourceSpec(
            name: "신앙", short: "FAITH", color: "#e8e0cd",
            gain: [.heal: 15, .dodge: 10, .hit: 8, .victory: 10]),
        .illusionist: ClassResourceSpec(
            name: "환기", short: "ESNC", color: "#c88be8",
            gain: [.dodge: 25, .crit: 15, .attack: 5, .choice: 5]),
    ]

    /// 클래스 자원 최대치 (모든 클래스 동일). 웹 `CLASS_RESOURCE_MAX`.
    static let classResourceMax = 100

    /// 클래스별 레벨당 성장 편향 (기본 1.0 에 더해지는 offset). 웹 `CLASS_STAT_GROWTH`.
    static let classStatGrowth: [ClassType: [StatKey: Double]] = [
        .warrior: [.str: 0.4, .vit: 0.3, .int: -0.2, .agi: -0.1],
        .mage: [.int: 0.5, .crit: 0.2, .str: -0.3, .vit: -0.1],
        .monk: [.dex: 0.2, .agi: 0.2, .vit: 0.2, .crit: 0.2, .str: 0.1],
        .druid: [.vit: 0.3, .int: 0.2, .agi: 0.1],
        .bard: [.dex: 0.3, .agi: 0.3, .int: 0.2, .crit: 0.1],
        .chronomancer: [.dex: 0.4, .int: 0.3, .agi: 0.1],
        .priest: [.int: 0.4, .vit: 0.3, .crit: 0.1],
        .illusionist: [.crit: 0.3, .int: 0.2, .dex: 0.2, .agi: 0.1, .str: 0.1],
    ]

    // ── 탐험권 ────────────────────────────────────────────────────

    /// 챌린지 rarity → 지급 탐험권 수. 웹 `PASS_GRANT_BY_RARITY`.
    static let passGrantByRarity: [Rarity: Int] = [
        .normal: 1, .rare: 2, .unique: 3, .legend: 3,
    ]

    /// 탐험권 카테고리별 최대 보유량. 웹 `PASS_CAP_PER_CATEGORY`.
    static let passCapPerCategory = 20

    /// 상점 일일 탐험권 구매 cap. 웹 `DAILY_PASS_PURCHASE_CAP`.
    static let dailyPassPurchaseCap = 8

    /// 데일리 코인 주머니 — [min, max] 균등 분포. 웹 `COIN_POUCH_MIN/MAX`.
    static let coinPouchMin = 20
    static let coinPouchMax = 160

    // ── 강화 시스템 ───────────────────────────────────────────────

    /// 강화 가능 최대 레벨. 웹 `MAX_ENHANCE_LEVEL`.
    static let maxEnhanceLevel = 10

    /// 등급별 base 성공률 (백분율 0-100). 웹 `ENHANCE_BASE_SUCCESS`.
    static let enhanceBaseSuccess: [Rarity: Int] = [
        .normal: 95, .rare: 90, .unique: 75, .legend: 75,
    ]

    /// 등급별 level 당 감쇠율 (백분율 포인트). 웹 `ENHANCE_DECAY_PER_LEVEL`.
    static let enhanceDecayPerLevel: [Rarity: Int] = [
        .normal: 3, .rare: 4, .unique: 5, .legend: 7,
    ]

    /// 등급별 fail streak 당 soft-pity 보너스 (0.02 = +2%p). 웹 `ENHANCE_PITY_BONUS_PER_FAIL`.
    static let enhancePityBonusPerFail: [Rarity: Double] = [
        .normal: 0, .rare: 0, .unique: 0.02, .legend: 0.04,
    ]

    /// 등급별 실패 시 보존 확률. 웹 `ENHANCE_PRESERVE_BY_RARITY`.
    static let enhancePreserveByRarity: [Rarity: Double] = [
        .normal: 0.3, .rare: 0.3, .unique: 0.4, .legend: 0.5,
    ]

    /// 등급별 비용 배율. 웹 `ENHANCE_COST_RARITY_MULT`.
    static let enhanceCostRarityMult: [Rarity: Double] = [
        .normal: 1, .rare: 1.5, .unique: 2.5, .legend: 4,
    ]

    /// 장비 판매 환급. 웹 `SELL_PRICE`.
    static let sellPrice: [Rarity: Int] = [
        .normal: 5, .rare: 15, .unique: 50, .legend: 200,
    ]

    // ── 영웅 이름 풀 ──────────────────────────────────────────────

    /// 언어별 영웅 이름 풀. 웹 `HERO_NAME_POOLS`.
    static let heroNamePools: [Language: [String]] = [
        .ko: [
            "레오", "미라", "타로", "카이", "루나", "노아", "제드", "리나",
            "이든", "하루", "알토", "메이", "에코", "쿠로", "리온", "아사",
            "세라", "노엘", "오루", "피오", "시온", "유리", "데이", "벨",
        ],
        .en: [
            "Leo", "Nora", "Finn", "Luna", "Kai", "Mira", "Aden", "Ivy",
            "Rune", "Rowan", "Lyra", "Zed", "Echo", "Sage", "Wren", "Talon",
            "Remy", "Juno", "Ash", "Niko", "Rae", "Vale", "Theo", "Nia",
        ],
        .ja: [
            "ハル", "レン", "ユウ", "アキ", "リン", "ミオ", "ソラ", "カイ",
            "ノア", "アオイ", "ユイ", "サナ", "リク", "コウ", "マイ", "シン",
            "アサ", "リオ", "ナギ", "ルカ", "ハク", "ヒナ", "ツキ", "セイ",
        ],
        .zh: [
            "云舒", "墨白", "星河", "青山", "子轩", "若风", "雨晴", "知夏",
            "清辞", "明远", "子墨", "云深", "梦蝶", "思齐", "清歌", "青衣",
            "如意", "长安", "天一", "云清", "疏影", "暮云", "慕白", "若涵",
        ],
    ]

    /// Legacy — 하위 호환용 (ko 풀). 웹 `HERO_NAME_POOL`.
    static let heroNamePool: [String] = heroNamePools[.ko]!

    // ── NG+ ──────────────────────────────────────────────────────

    /// NG+ 난이도 스케일. 웹 `ngPlusScaleMult` — `1 + 0.4 × max(0, n)`.
    static func ngPlusScaleMult(_ ngPlusLevel: Int?) -> Double {
        1.0 + 0.4 * Double(max(0, ngPlusLevel ?? 0))
    }

    /// NG+ legend drop 보너스 (0.01 = +1%p). 웹 `ngPlusLegendBonus` — NG+ 1당 +2%p.
    static func ngPlusLegendBonus(_ ngPlusLevel: Int?) -> Double {
        Double(max(0, ngPlusLevel ?? 0)) * 0.02
    }

    // ── 주간 악몽 던전 ────────────────────────────────────────────

    /// ISO week id ("2026-W16" 형식). 웹 `getISOWeekId`.
    ///
    /// 웹은 `date` 의 (로컬) Y/M/D 를 추출 → UTC 자정으로 재구성 후 ISO 8601 주차
    /// 계산. Swift 도 동일하게 `Calendar.current` (로컬 TZ) 로 Y/M/D 를 뽑고
    /// UTC 달력으로 목요일 shift / 주차 ceil 을 수행한다.
    static func getISOWeekId(_ date: Date = Date()) -> String {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!

        // 로컬 Y/M/D 추출 (웹 getFullYear/getMonth/getDate 대응).
        let local = Calendar.current.dateComponents([.year, .month, .day], from: date)
        var dc = DateComponents()
        dc.year = local.year
        dc.month = local.month
        dc.day = local.day
        guard var d = utc.date(from: dc) else { return "" }

        // 목요일 기준 shift: 웹 getUTCDay()(0=Sun) || 7 → Mon=1..Sun=7.
        let weekday = utc.component(.weekday, from: d)   // Swift: 1=Sun..7=Sat
        let dayNum = weekday == 1 ? 7 : weekday - 1
        d = utc.date(byAdding: .day, value: 4 - dayNum, to: d)!

        let year = utc.component(.year, from: d)
        var ys = DateComponents()
        ys.year = year
        ys.month = 1
        ys.day = 1
        let yearStart = utc.date(from: ys)!

        let days = (d.timeIntervalSince1970 - yearStart.timeIntervalSince1970) / 86_400.0
        let weekNum = Int(((days + 1) / 7).rounded(.up))   // 웹 Math.ceil
        return "\(year)-W\(String(format: "%02d", weekNum))"
    }

    /// 주간 악몽 점수. 웹 `computeWeeklyScore`.
    ///   base = floors×100, 완주(F30+) +2000, time×2, level² ×2.
    static func computeWeeklyScore(
        floorsCleared: Int, remainingTime: Int, heroLevel: Int
    ) -> Int {
        let base = max(0, floorsCleared) * 100
        let completionBonus = floorsCleared >= 30 ? 2000 : 0
        let timeBonus = max(0, remainingTime) * 2
        let lv = max(1, heroLevel)
        let levelBonus = lv * lv * 2
        return base + completionBonus + timeBonus + levelBonus
    }

    // ── 강화 계산 ─────────────────────────────────────────────────

    /// 현재 level → 다음 level 강화 성공률 (0-1). 웹 `enhanceSuccessRate`.
    /// rarity/level 4종 dict 는 모두 정의됨 — 강제 언랩 안전.
    static func enhanceSuccessRate(
        rarity: Rarity, currentLevel: Int, failStreak: Int = 0
    ) -> Double {
        let base = Double(enhanceBaseSuccess[rarity]!)
        let decay = Double(enhanceDecayPerLevel[rarity]!)
        let raw = base - Double(max(0, currentLevel)) * decay
        let rawRate = max(0.05, min(1.0, raw / 100.0))
        let pityBonus = Double(max(0, failStreak)) * enhancePityBonusPerFail[rarity]!
        return min(1.0, rawRate + pityBonus)
    }

    /// 강화 시도 코인 비용. 웹 `enhanceCost` — base 30 × (1 + level×0.5) × rarityMult.
    static func enhanceCost(rarity: Rarity, currentLevel: Int) -> Int {
        let base = Double(ShopPrices.enhance)
        let levelMult = 1.0 + Double(max(0, currentLevel)) * 0.5
        let rarityMult = enhanceCostRarityMult[rarity]!
        return Int((base * levelMult * rarityMult).rounded())
    }

    // ── 영웅 레벨 / 외형 ──────────────────────────────────────────

    /// 영웅 외형 variant (레벨 기반). 웹 `getHeroAppearanceVariant`.
    static func getHeroAppearanceVariant(level: Int) -> Int {
        if level >= 30 { return 2 }
        if level >= 10 { return 1 }
        return 0
    }

    /// 영웅 전용 레벨 = max(1, gameLevel − heroStartLevel + 1). 웹 `getEffectiveHeroLevel`.
    static func getEffectiveHeroLevel(gameLevel: Int, heroStartLevel: Int?) -> Int {
        let startLvl = heroStartLevel ?? 1
        return max(1, gameLevel - startLvl + 1)
    }

    // ── 영웅 생성 (비결정론) ──────────────────────────────────────

    /// 이름 풀에서 랜덤 영웅 이름 1개. 웹 `rollHeroName` (Math.random — 비결정론).
    static func rollHeroName(language: Language? = nil) -> String {
        let pool: [String]
        if let language, let p = heroNamePools[language] {
            pool = p
        } else {
            pool = heroNamePools[.ko]!
        }
        guard !pool.isEmpty else { return "" }
        return pool[Int.random(in: 0..<pool.count)]
    }

    /// 기본 Hero 생성. 웹 `createDefaultHero` (rollHeroName 경유 — 비결정론).
    static func createDefaultHero(language: Language? = nil) -> Hero {
        Hero(
            name: rollHeroName(language: language),
            hp: 100,
            maxHp: 100,
            baseStats: HeroBaseStats(
                str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0),
            equipped: [:],
            classType: nil,
            appearanceVariant: 0,
            autoSkillEnabled: true,
            learnedSkills: nil,
            skillPoints: nil
        )
    }

    // ── 스탯 계산 ─────────────────────────────────────────────────

    /// 영웅 실제 스탯 = base + 장착 장비 합산. 웹 `computeEffectiveStats`.
    /// (덧셈은 교환법칙 성립 — 슬롯 순회 순서 무관, 웹 Object.values 와 결과 동일.)
    static func computeEffectiveStats(_ hero: Hero) -> HeroBaseStats {
        var stats = hero.baseStats
        for slot in EquipSlot.allCases {
            guard let eq = hero.equipped[slot] else { continue }
            for (key, value) in eq.stats {
                stats[key] += value
            }
        }
        return stats
    }

    /// 영웅 레벨별 base stat 자동 성장. 웹 `computeHeroForLevel`.
    ///
    /// 매 레벨 5 주요 스탯 각 +성장률 (클래스 편향 반영), maxHp = 100 + delta×12.
    /// pure — 원본 hero 를 mutate 하지 않음. idempotent (hero.maxHp 를 base 로 안 씀).
    static func computeHeroForLevel(_ hero: Hero, level: Int) -> Hero {
        let lvl = max(1, level)
        let delta = lvl - 1
        let base = hero.baseStats
        // 클래스 편향 — 전직 후(classType 있을 때)만 적용. 기본 성장 1.0 + bias.
        let bias: [StatKey: Double] = hero.classType.flatMap { classStatGrowth[$0] } ?? [:]
        func growth(_ key: StatKey) -> Double { 1.0 + (bias[key] ?? 0) }

        let baseStats = HeroBaseStats(
            str: Int((Double(base.str) + Double(delta) * growth(.str)).rounded()),
            int: Int((Double(base.int) + Double(delta) * growth(.int)).rounded()),
            vit: Int((Double(base.vit) + Double(delta) * growth(.vit)).rounded()),
            dex: Int((Double(base.dex) + Double(delta) * growth(.dex)).rounded()),
            agi: Int((Double(base.agi) + Double(delta) * growth(.agi)).rounded()),
            // crit 은 base 유지 + 클래스 편향이 있으면 flat 가산.
            crit: Int((Double(base.crit) + Double(delta) * (bias[.crit] ?? 0)).rounded()),
            slotBonus: base.slotBonus
        )
        let newMaxHp = 100 + delta * 12
        let hpRatio = hero.maxHp > 0 ? Double(hero.hp) / Double(hero.maxHp) : 1.0
        let newHp = Int((Double(newMaxHp) * hpRatio).rounded())

        var result = hero
        result.baseStats = baseStats
        result.maxHp = newMaxHp
        result.hp = newHp
        return result
    }

    /// HexStatChart 의 각 축 max 기준값 (레벨 + 클래스 편향). 웹 `computeStatMax`.
    /// 반환은 6키 (str/int/vit/dex/agi/crit) — slotBonus 제외.
    static func computeStatMax(level: Int, classType: ClassType?) -> [StatKey: Int] {
        let lvl = max(1, level)
        let delta = lvl - 1
        let bias: [StatKey: Double] = classType.flatMap { classStatGrowth[$0] } ?? [:]
        func growth(_ key: StatKey) -> Double { 1.0 + (bias[key] ?? 0) }
        return [
            .str: Int((10.0 + Double(delta) * growth(.str)).rounded()),
            .int: Int((10.0 + Double(delta) * growth(.int)).rounded()),
            .vit: Int((10.0 + Double(delta) * growth(.vit)).rounded()),
            .dex: Int((10.0 + Double(delta) * growth(.dex)).rounded()),
            .agi: Int((10.0 + Double(delta) * growth(.agi)).rounded()),
            // crit 은 base 50 (장비 전용 상한) + delta × bias.crit.
            .crit: Int((50.0 + Double(delta) * (bias[.crit] ?? 0)).rounded()),
        ]
    }

    // ── 버프 슬롯 ─────────────────────────────────────────────────

    /// 버프 선택 가능 슬롯 수. 웹 `getBuffSlotCount`.
    ///   base (Lv1-4: 1, Lv5+: 2) + accessory/talisman slotBonus, cap 4.
    static func getBuffSlotCount(hero: Hero, level: Int) -> Int {
        let base = level >= 5 ? 2 : 1
        let accessoryBonus = hero.equipped[.accessory]?.stats[.slotBonus] ?? 0
        let talismanBonus = hero.equipped[.talisman]?.stats[.slotBonus] ?? 0
        return min(4, base + accessoryBonus + talismanBonus)
    }
}
