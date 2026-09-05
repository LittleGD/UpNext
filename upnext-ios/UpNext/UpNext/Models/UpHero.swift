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
enum MinigameId: String, CaseIterable, Hashable, Decodable {
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
    var enhanceLevel: Int?           // Phase 11a — 강화 레벨 0~20 (Phase 5-B, 사진 부적은 0~10)
    var enhanceFailStreak: Int?      // Phase 11c — 연속 강화 실패 streak
    var affix: StatKey?              // Phase 11a — 2차 affix stat key
    var affixes: [StatKey]?          // Phase 11a — legend 전용 3차 affix
    var talismanSkills: [String]?    // Phase 11b — 사진 부적 passive skill id
    /// Phase 6-E (Track E) — 드롭된 층. `EquipmentPool.createEquipmentFromTemplate(dungeonFloor:)`
    /// 와 합성(재료의 max) 이 기록한다. 판매가(`UpHeroRules.sellPrice`) 와 합성 층 규칙이 읽는다.
    /// 레거시 저장본은 `EquipmentRepair` 가 주스탯에서 역추정해 채운다 (없으면 nil).
    /// 사진 부적은 층이 없다 (판매가는 0 층). 와이어 키 `dropFloor` (int optional).
    /// ⚠️ 반드시 **마지막** 저장 프로퍼티로 둔다 — 기본값 nil 이라 기존 memberwise init
    /// 호출부(talismanSkills 가 마지막 인자)가 그대로 컴파일된다.
    var dropFloor: Int? = nil
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

/// Phase 4-D (Track D, 피드백 15) — 런 한정 능력치 보정의 대상 스탯. 웹 `RunModStat`.
/// `all` 은 str/int/vit/dex/agi 다섯 개 전부. crit/slotBonus 는 대상이 아니다
/// (crit 은 퍼센트 포인트, slotBonus 는 슬롯 수 카운터라 곱하면 의미가 깨진다).
enum RunModStat: String, Codable, Equatable {
    case str, int, vit, dex, agi, all
}

/// Phase 4-D — 세션에 쌓이는 런 한정 능력치 보정 한 건. 웹 `RunStatMod`.
/// `pct` 는 부호 있는 퍼센트 포인트 (음수 = 저주). `floorsLeft` 가 nil 이면 런 끝까지.
/// 적용은 `UpHeroSession.sessionStats` 한 곳 (스탯별 합산 → clamp → 1회 곱).
/// `EffectSummaryData.runMods` 에서는 같은 구조체의 `floorsLeft` 가 웹 `floors` 를 나른다.
struct RunStatMod: Equatable, Codable {
    var stat: RunModStat
    var pct: Int
    var floorsLeft: Int?
}

/// 미니게임 결과에 적용 가능한 단순 효과 (재귀 방지용 — startMinigame/fight/flee 제외).
/// 웹 `SimpleChoiceEffect`.
enum SimpleChoiceEffect: Equatable {
    case reward(coins: Int?, xp: Int?, dropEquipmentId: String?)
    case damage(amount: Int)
    case heal(amount: Int)
    case time(delta: Int)              // 음수 = 소모, 양수 = 회복
    case skipFloors(count: Int)
    case revealBoss
    /// Phase 4-D — 런 한정 빌드 효과 (ChoiceEffect 와 같은 shape).
    case runBuff(stat: RunModStat, pct: Int, floors: Int?)
    case runCurse(stat: RunModStat, pct: Int, floors: Int?)
    case stealth(encounters: Int)
    case guaranteedDrop(count: Int?)
    case nothing
}

/// 이벤트 선택지 효과. 웹 `ChoiceEffect` (discriminated union).
enum ChoiceEffect: Equatable {
    case reward(coins: Int?, xp: Int?, dropEquipmentId: String?)
    case damage(amount: Int)
    case heal(amount: Int)
    case skipFloors(count: Int)
    case revealBoss
    /// Phase 4-D (Track D) — 런 한정 빌드 효과 4종. 전부 `CombatSession` 의 세션 전용
    /// 필드에 쌓이고 탐험이 끝나면 사라진다 (클라우드 제외).
    ///  - runBuff / runCurse: stat 에 ±pct% 를 `floors` 층 동안 (nil 이면 런 끝까지).
    ///  - stealth: 다음 `encounters` 회 일반 조우를 전투 없이 지나친다 (보스 제외).
    ///  - guaranteedDrop: 다음 `count` (기본 1) 회 처치에서 장비 드롭 확정 (floor+5 등급).
    case runBuff(stat: RunModStat, pct: Int, floors: Int?)
    case runCurse(stat: RunModStat, pct: Int, floors: Int?)
    case stealth(encounters: Int)
    case guaranteedDrop(count: Int?)
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
    /// Phase 15 — 굴림틀 1회. 결과 확정과 지급을 효과 적용 시점에 끝낸다
    /// (드럼 애니메이션은 표시 계층이라 건너뛰어도 보상이 어긋나지 않는다).
    case spinSlot(cost: Int)
}

/// Choice 옵션. 웹 `ChoiceOption`.
struct ChoiceOption: Equatable, Decodable {
    var label: String
    var labelKey: String?               // i18n key
    var labelParams: NarrativeParams?   // runtime 주입 토큰
    var effect: ChoiceEffect?           // 단일 효과 (legacy fallback)
    var outcomes: [ChoiceOutcome]?      // 가중 확률 분기 (있으면 effect 대신 사용)
    var resultText: String?
    var resultTextKey: String?
}

/// Choice 옵션의 확률적 결과. 웹 `ChoiceOutcome`.
struct ChoiceOutcome: Equatable, Decodable {
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

/// choiceResult 로그의 효과 요약 (다국어). 웹 LogEntry 의 `effectSummaryData`
/// (= 웹 `EffectSummaryData`). 엔진(`UpHeroCombat.summarizeEffectsData`)이 만들고
/// UI(`ChoiceResultTypes.chips`)가 현재 언어 칩으로 푼다. 필드는 추가만 한다.
struct EffectSummaryData: Equatable {
    var xp: Int?
    var coins: Int?
    var heal: Int?
    var damage: Int?
    /// 음수 = 시간 소모, 양수 = 시간 회복
    var timeDelta: Int?
    /// Phase 4-D — 건너뛴 층 수 (skipFloors count 합)
    var skipFloors: Int?
    /// Phase 4-D — 런 한정 보정 (runBuff 는 +pct, runCurse 는 -pct). `floorsLeft` = 웹 `floors`.
    var runMods: [RunStatMod]?
    /// Phase 4-D — 은신 조우 수
    var stealth: Int?
    /// Phase 4-D — 장비 확정 처치 수
    var guaranteedDrop: Int?
    /// Phase 4-D — revealBoss 가 더한 보스 피해 %
    var bossDmgPct: Int?

    /// 하나라도 채워졌는가 — 로그 엔트리에 nil 대신 실을지 결정 (웹은 빈 객체를 싣는다).
    var isEmpty: Bool {
        xp == nil && coins == nil && heal == nil && damage == nil && timeDelta == nil
            && skipFloors == nil && runMods == nil && stealth == nil
            && guaranteedDrop == nil && bossDmgPct == nil
    }
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
        resultTextKey: String?, resultTextFallback: String?,
        /// Phase 15 — 굴림틀 결과일 때만 채워진다. 있으면 UI 가 일반 결과 모달 대신
        /// 드럼 연출 모달을 띄운다 (웹 LogEntry 의 `slot?` 과 같은 자리).
        slot: SlotResultPayload?,
        timestamp: Int)
}

// MARK: - 전투 세션

/// 세션 누적 보상. 웹 CombatSession.rewards.
struct SessionRewards: Equatable {
    var xp: Int
    var coins: Int
    var drops: [Equipment]
    /// Phase 15 — 이번 탐험에서 번 방지권. 정산 때 `UpHeroState.destroyGuards` /
    /// `downGuards` 로 합산된다. 세션 안에서는 여기에만 쌓이므로 탐험을 포기하면
    /// (웹과 같이) 함께 사라진다.
    var destroyGuards: Int = 0
    var downGuards: Int = 0
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

/// 부적 passive 합산 modifier 버킷. 웹 `talismanSkills.ts` 의 `TalismanModifiers`.
/// CombatSession.talismanMods 가 참조하는 상태 타입이라 여기(타입 시스템)에 정의.
/// 부적 스킬 카탈로그·수집 로직은 TalismanSkills.swift.
/// 기본 생성자 `TalismanModifiers()` = 웹 `emptyTalismanMods()` (배율 1, 나머지 0).
struct TalismanModifiers: Equatable {
    var dodgeBonus: Double = 0          // 회피 추가 확률 (0-1)
    var enemyMissBonus: Double = 0      // 적 miss 추가 확률 (0-1)
    var critDmgBonus: Double = 0        // crit damage 배율 가산
    var coinMult: Double = 1            // coin 보상 곱
    var timeCostMult: Double = 1        // time 소모 곱
    var healEffectMult: Double = 1      // heal 효과 곱
    var hpRegenEvery2Rounds: Int = 0    // 2 round 마다 +N HP
    var extraDropChance: Double = 0     // 세션 중 1회 보너스 드롭 확률
    var legendDropBonus: Double = 0     // legend 드롭 확률 가산 (%p)
    var bossTimeRecover: Int = 0        // 보스 처치 시 time 회복
    var counterChance: Double = 0       // 피격 시 반격 확률
    var lowHpDmgBonus: Double = 0       // HP ≤ 20% 공격 배율 가산
    var agiRoundAccum: Int = 0          // round 당 agi 누적치
    var agiRoundCap: Int = 0            // agi 누적 상한
    var classSkillCdReduce: Int = 0     // class skill 쿨다운 감소
    var startXp: Int = 0                // 세션 시작 즉시 XP
    var startHpMult: Double = 1         // 세션 시작 HP 배율
    var startHpFlat: Int = 0            // 세션 시작 HP 고정 가산

    /// 부적 스킬 0개인 영웅용 기본값. 웹 `emptyTalismanMods()`.
    static let empty = TalismanModifiers()
}

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
    /// Phase 15 — 굴림틀 전투 버프. **세션 안에서는 이것이 유일한 진실** 이고
    /// 전투가 끝날 때마다 여기서 닳는다. 탐험이 끝나면 스토어가 잔여분을
    /// `UpHeroState.combatBuff` 로 적어 다음 탐험이 이어받는다.
    /// `pct` 는 퍼센트 포인트다 (10 = +10%). 상태·클라우드 층위도 같은 단위다.
    var combatBuff: CombatBuff?
    /// Phase 4-D (Track D, 피드백 15) — 런 한정 빌드 상태 4종. 전부 세션 전용이다:
    /// `UpHeroState` 로 승격하지 않고 클라우드 페이로드(UpHeroCloudSchema 는 세션을
    /// 싣지 않는다)에도 실리지 않는다. 옵셔널이라 없으면 "런 보정 없음" 과 같다.
    ///  - runStatMods: `sessionStats()` 가 combatBuff 뒤에 스탯별 합산 pct 로 1회 곱.
    ///    `advanceRunModFloors` 가 층 이동마다 floorsLeft 를 줄이고 만료를 지운다.
    ///    최대 `UpHeroCombat.RunMods.statModsCap` 건 (오래된 것부터 버림).
    ///  - runBossDmgPct: revealBoss 1회당 +5 (상한 15). executeCombatRound 가 isBoss
    ///    몬스터에게 주는 영웅 피해에만 곱한다.
    ///  - runStealthLeft: tickSession 의 일반 조우 분기에서 1씩 소모 (보스층 제외).
    ///  - runGuaranteedDrops: victory 드롭 판정을 강제 (floor+5 등급) 하고 1씩 소모.
    var runStatMods: [RunStatMod]? = nil
    var runBossDmgPct: Int? = nil
    var runStealthLeft: Int? = nil
    var runGuaranteedDrops: Int? = nil
    /// 굴림 횟수는 세션이 세지 않는다 — 하루 상한(`UpHeroSlot.dailySpinCap`)의 진실은
    /// `UpHeroState.shopDaily.slotSpins` 이고, 스토어가 오늘 값을 스냅샷으로 세션
    /// 배선(`tickSession` / `resolveChoice` 의 `slotSpinsToday`)에 넘긴다. 예전에 여기
    /// 있던 `slotSpins` 는 탐험 1회당 3회로 새는 카운터라 제거했다 (웹과 동일).
    /// 연속 꽝 스트릭의 **운반용 사본**. 진실은 `UpHeroState.slotBlankStreak` 이다 —
    /// 세션 스코프였을 때는 세션당 상한 3 때문에 임계 5 에 닿지 못해 pity 가 죽어
    /// 있었다. 스토어(`UpHeroStore.resolveChoice`)가 선택 해소 직전에 상태 값을 여기
    /// 적어 넘기고, 세션 배선(`applySpinSlot`)은 이 값을 롤 입력으로 읽는다. 결과
    /// 반영은 스토어가 `UpHeroSlot.nextBlankStreak` 로 상태에 다시 쓴다.
    var slotBlankStreak: Int?
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

/// 갓생 상점 일일 카운터. 웹 UpHeroState.shopDaily.
///
/// `date` 가 오늘(`AppClock.todayString`, 새벽 1시 경계)이 아니면 통째로 새 객체로
/// 갈린다 (`UpHeroStore.currentShopDaily`) — 탐험권 구매·코인 주머니·굴림틀 횟수가
/// 같은 날짜 키를 공유해 롤오버 규칙이 한 곳에 있다.
struct ShopDaily: Equatable {
    var date: String
    var passesBought: Int
    var coinPouchClaimed: Bool?
    /// 오늘 굴림틀을 돌린 횟수. `UpHeroSlot.dailySpinCap` 상한의 유일한 카운터 —
    /// 세션이 아니라 여기 살아서 하루에 탐험을 몇 번 하든 합산된다. nil = 0
    /// (구 저장본·옛 클라우드 문서). 와이어 키 "slotSpins", 정수 [0, 100].
    var slotSpins: Int?
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
    /// Phase 6-E (Track E, 피드백 22) — 정산 때 가방 상한(`UpHeroRules.inventoryCap`)을 넘긴
    /// 전리품. `SessionReward.splitDropsByCap` 이 나눠 담고, 캠프의 BagOverflowSheet 가 한 개씩
    /// 판매/버리기 또는 모두 판매로 비운다. 인벤토리와 별개라 `inventory.count <= inventoryCap`
    /// 불변식이 정산 뒤 항상 성립한다. 영속 + 클라우드 동기화 (와이어 키 `overflowDrops`,
    /// [] 허용, footprint 포함). 레거시 저장본은 []. 웹 `UpHeroState.overflowDrops`.
    var overflowDrops: [Equipment] = []
    var coins: Int
    /// 탐험권 보유량 — 카테고리별. 웹 `ExpeditionPasses`.
    var passes: [DungeonId: Int]
    var dungeons: [DungeonId: DungeonProgress]
    var currentSession: CombatSession?
    var pendingDungeon: PendingDungeonPrep?
    var codex: Codex
    var cosmetics: Cosmetics
    /// 소실방지권 보유 개수. **상점에서 팔지 않는다** — 보스 처치 드롭 · 던전 상자 ·
    /// 슬롯머신 보상으로만 들어온다 (iOS 지급 경로는 전투 슬라이스에서 배선).
    /// 소모 계약: 강화 실패가 **소실로 판정된 순간에만** 1 감소한다.
    /// nil = 0 (구 저장본 호환). 와이어 키는 웹과 동일한 "destroyGuards".
    var destroyGuards: Int?
    /// 하락방지권 보유 개수. 상점 판매 품목 (ShopPrices.downGuard).
    /// 소모 계약: 실패가 **하락으로 판정된 순간에만** 1 감소한다. 와이어 키 "downGuards".
    var downGuards: Int?
    /// 굴림틀에서 받은 전투 버프의 **탐험 밖 보관소**. 탐험이 끝났는데 잔여 전투가
    /// 남아 있으면 여기 적혀 다음 탐험으로 이어진다. 만료됐으면 nil — battlesLeft 0
    /// 짜리 껍데기를 남기지 않는다 (UI 가 "버프 있음" 으로 오인한다).
    /// 와이어 키 `combatBuff` (중첩 맵). 웹 `UpHeroState.combatBuff`.
    var combatBuff: CombatBuff?
    /// 굴림틀 연속 꽝 스트릭 — pity 의 **유일한 진실**. 탐험을 넘어 영속한다.
    /// 필드가 없는 레거시 저장본은 0 (nil). 정수 [0, `UpHeroSlot.blankStreakMax`] 로
    /// 접는다 (`UpHeroSlot.normalizeBlankStreak`). 와이어 키 `slotBlankStreak` — 0 이어도
    /// 키를 항상 싣는다: 보상 뒤 0 리셋이 merge 에서 빠지면 옛 스트릭이 되살아나
    /// 받을 자격이 없는 pity 가 발동한다. 웹 `UpHeroState.slotBlankStreak`.
    var slotBlankStreak: Int? = nil
    var lastIdleAccrualAt: Int
    var lastSeenAt: Int?              // Phase 14 — 시계 되감기 탐지용
    var heroStartLevel: Int?          // Phase 9d — 영웅 시작 시점 챌린지 레벨
    /// Phase 2-A (Track A, 피드백 7/20/32) — 영웅 전용 누적 XP 풀. 계정 XP(progress.xp)
    /// 와 완전히 분리된다: 던전 정산과 방치 보상만 여기에 더하고, 챌린지 완료는 절대
    /// 건드리지 않는다. 영웅 Lv = `UpHeroRules.heroLevelFromXP(heroXp)`.
    ///
    /// nil = 아직 시드되지 않음 (레거시 저장본 / 구 클라이언트 클라우드 문서). 그동안은
    /// `UpHeroRules.resolveHeroLevel` 이 레거시 공식(getEffectiveHeroLevel)로 표시하고,
    /// `UpHeroStore.ensureHeroXp(gameLevel:)` 이 `heroTotalXPForLevel(레거시 Lv)` 로 정확히
    /// 같은 레벨에서 시드한다. 0 으로 시드하는 경로는 없다 (Lv47 영웅이 Lv1 로 주저앉는
    /// 사고 방지). 정수 [0, `UpHeroRules.heroXpCap`]. 와이어 키 `heroXp` — 없으면 로컬
    /// 유지, 시드 뒤엔 항상 인코딩 (웹 `UpHeroState.heroXp` 와 철자 동일).
    var heroXp: Int? = nil
    var shopDaily: ShopDaily?
    var ngPlusLevel: Int?             // Phase 11c — NG+ 레벨
    var weeklyVariant: WeeklyVariant?
    var schemaVersion: Int?           // Phase 5a.3 — 저장 스키마 버전
    var hasSeenCampTutorial: Bool?
    /// 시작 선물(100코인) 을 이미 받았는지. 최초 1회 지급 후 true 로 고정.
    var welcomeGiftClaimed: Bool?
    /// 시작 선물 예약분 — 미수령이면 코인 수, 수령했으면 nil.
    /// 오버레이의 "받기" 를 눌러야 실제 지급된다(연출을 못 본 채 소모되는 걸 막는다).
    var pendingWelcomeGift: Int?           // transient — persist X
    var idleReward: IdleRewardSnapshot?    // transient — persist X
    var pendingClassAwaken: ClassType?     // transient — persist X
    var pendingClassChoice: PendingClassChoice?  // transient — persist X
    /// Phase 2-A — 방금 일어난 영웅 레벨업 (HeroLevelUpOverlay 표시용). 정산/방치에서
    /// new > prev 일 때 세팅, `acknowledgeHeroLevelUp` 이 nil 로 내린다. Lv30 전직 제안은
    /// 이 오버레이가 닫힌 뒤에만 뜬다. transient — persist X. 웹 `pendingHeroLevelUp`.
    var pendingHeroLevelUp: HeroLevelUpEvent? = nil
    var isLoaded: Bool
}

/// 영웅 레벨업 이벤트 (from → to). 웹 `UpHeroState.pendingHeroLevelUp` 의 `{from,to}`.
struct HeroLevelUpEvent: Equatable {
    let from: Int
    let to: Int
}

// MARK: - 강화 결과

/// 강화 실패 시의 3분기 조건부 확률. 셋을 더하면 항상 1 이다. 웹 `EnhanceOutcomeRates`.
struct EnhanceOutcomeRates: Equatable {
    /// 아이템이 사라질 확률
    let destroy: Double
    /// 강화 단계가 1 내려갈 확률
    let down: Double
    /// 아무 일도 없을 확률
    let keep: Double
}

/// 이번 강화 시도에 걸 방지권. UI 토글이 그대로 매핑된다. 웹 `EnhanceGuardArm`.
/// Phase 5-B — 걸면(보유 > 0, 그 결과가 가능한 레벨) 결과와 무관하게 이번 시도에서
/// 1장 소모된다.
struct EnhanceGuardArm {
    /// 소실방지권을 걸지 (보유 0 이거나 소실 0 인 레벨이면 무시)
    var destroy: Bool = false
    /// 하락방지권을 걸지 (보유 0 이거나 하락 0 인 레벨이면 무시)
    var down: Bool = false
}

/// 한 번의 강화 시도에서 소모된 방지권 (0 또는 1). 웹 `EnhanceGuardSpend`.
/// 시도 시작 시 걸려 있고(보유 > 0, 그 결과가 이 레벨에서 가능) 결과와 무관하게 1장
/// 나간다. 결과 문구가 "무엇을 썼는지" 말한다.
struct EnhanceGuardSpend: Equatable {
    var destroy: Int = 0
    var down: Int = 0

    /// 아무것도 나가지 않은 시도 (시도 불성립 갈래 포함).
    static let zero = EnhanceGuardSpend(destroy: 0, down: 0)
}

/// `UpHeroStore.enhanceItem` 반환값. 웹 `EnhanceResult` 유니온 1:1
/// (success / keep / down / guarded / destroyed / coin / maxed / not-found).
///
/// `guarded` 는 방지권이 결과를 막아낸 분기다. `guard` 가 무엇을 막았는지 말해준다 —
/// "사라질 뻔했다" 와 "내려갈 뻔했다" 는 문구가 달라야 한다.
/// Phase 5-B — 시도가 성립한 다섯 갈래는 모두 `spent`(이번 시도에 나간 방지권)를 싣는다.
enum EnhanceResult {
    case success(newItem: Equipment, prevLevel: Int, spent: EnhanceGuardSpend)
    case keep(item: Equipment, spent: EnhanceGuardSpend)
    /// 실패로 단계가 1 내려갔다. `prevLevel` 은 내려가기 **전** 레벨 (UI 가 "+7 → +6").
    case down(item: Equipment, prevLevel: Int, spent: EnhanceGuardSpend)
    case guarded(item: Equipment, guard: EnhanceGuardKind, spent: EnhanceGuardSpend)
    case destroyed(lostItemName: String, spent: EnhanceGuardSpend)
    case coinShort(need: Int)
    case maxed
    case notFound

    /// 이번 시도에 나간 방지권. 시도가 성립하지 않은 갈래(coin/maxed/notFound)는 0.
    var spent: EnhanceGuardSpend {
        switch self {
        case .success(_, _, let s), .keep(_, let s), .down(_, _, let s),
             .guarded(_, _, let s), .destroyed(_, let s):
            return s
        case .coinShort, .maxed, .notFound:
            return .zero
        }
    }
}

/// 강화 칭호 — 저장하지 않고 enhanceLevel 에서 파생. 웹 `EnhanceTitle`.
enum EnhanceTitle: String {
    case awakened, transcended
}

/// 방지권 종류. 웹 `guard: "destroy" | "down"`.
enum EnhanceGuardKind { case destroy, down }

// MARK: - 상점 가격

/// 갓생 코인 상점 가격. 웹 `SHOP_PRICES`.
enum ShopPrices {
    static let ticket = 50
    static let cardPackSmall = 200   // 1장
    static let cardPackFull = 800    // 5장 (level-up pack)
    static let enhance = 30
    static let fastForward = 20
    /// 리롤 — 하루 1회 상한은 그대로 두고 무료에서 유료로 전환(광고 시청 경로 병존).
    static let reroll = 100
    /// 오늘의 기운 — 광고를 못 받는 사용자를 위한 대체 경로. 순수 코스메틱이라 enhance(30)와
    ///   같은 티어에 둔다. 리롤(100)보다 크게 낮은 이유: 이건 일회성 구매가 아니라 **매일**
    ///   부과되는 비용이다(EEA 동의 거부·미승인 지역·오프라인은 구조적으로 광고를 못 받는다).
    ///   데일리 코인 주머니가 20~160(평균 ~90)이라 30이면 탈출구로 실제 기능한다.
    static let fortune = 30
    /// 기운 3종(재물·관계·건강)의 **두 번째·세 번째** 리딩. 첫 리딩은 언제나 무료다.
    ///   fortune(30) 위에 하루 두 번 더 얹히므로 한 단계 낮은 fastForward(20) 티어에 둔다.
    ///   셋을 모두 여는 날의 총액이 70 이라 데일리 코인 주머니(20~160, 평균 ~90) 아래에
    ///   머문다 — 총액이 평균 수령액을 넘으면 "탈출구"가 아니라 새로운 벽이 된다.
    ///   웹 `SHOP_PRICES.auraReading` 과 같은 값.
    static let auraReading = 20
    static let expeditionPass = 80   // Phase 11a — 탐험권 1장
    /// 하락방지권 1장. 강화 실패로 단계가 내려갈 뻔한 순간에만 소모된다.
    ///   가격 근거 — 탐험권(80)과 작은 카드팩(200) 사이, 위험 구간의 강화 1회 시도보다
    ///   싼 자리다. 보험료가 시도비보다 싸야 "위험할 때 켠다" 는 판단이 성립한다.
    ///   **소실방지권은 여기 없다** — 상점에서 팔지 않고 보스·상자·슬롯에서만 나온다.
    ///   웹 `SHOP_PRICES.downGuard` 와 같은 값이어야 한다.
    static let downGuard = 150
    /// Phase 3-F — 스킬 초기화(리스펙) 1회. learnedSkills 를 [T1] 로 되돌리면 SP 는
    ///   레벨 파생값이라 자동으로 복구된다 (환급 산술 없음). T2/T3 가 택일이라 후회의
    ///   출구가 필요하고, 코인 싱크로 downGuard(150) 두 배 자리에 둔다.
    ///   웹 `SHOP_PRICES.skillRespec` 과 같은 값이어야 한다.
    static let skillRespec = 300
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
        .mage: ClassMeta(name: "마법사", passive: "던전 XP 획득 +20%", icon: "BookOpen"),
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

    /// 강화 가능 최대 레벨. 웹 `MAX_ENHANCE_LEVEL`. Phase 5-B 에서 10 → 20.
    /// 사진 부적은 별도 상한 `PhotoTalisman.maxEnhanceLevel`(10) 을 쓴다.
    static let maxEnhanceLevel = 20

    // ── Phase 5-B — 상위 밴드 (+11..+20) ─────────────────────────────
    //
    // 0..9 의 선형 감쇠는 legend 가 +10 에서 이미 5% 바닥에 닿아 10..19 를 만들 수
    // 없다. 그래서 currentLevel >= 10 은 등급별 명시 표로 간다. 0..9 의 값은 바이트
    // 단위로 그대로다.

    /// 상위 밴드가 시작하는 currentLevel (+10 → +11 시도부터). 웹 `ENHANCE_HIGH_BAND_START`.
    static let enhanceHighBandStart = 10

    /// 상위 밴드 성공률 (백분율). index = currentLevel - enhanceHighBandStart.
    /// 웹 `ENHANCE_HIGH_SUCCESS_BY_LEVEL`.
    static let enhanceHighSuccessByLevel: [Rarity: [Int]] = [
        .normal: [50, 40, 31, 24, 18, 13, 9, 5, 3, 1],
        .rare:   [40, 32, 25, 19, 14, 10, 7, 4, 2, 1],
        .unique: [24, 20, 16, 12, 9, 7, 5, 3, 2, 1],
        .legend: [12, 10, 8, 6, 5, 4, 3, 2, 2, 1],
    ]

    /// 상위 밴드 성공률 바닥 (1%). 웹 `ENHANCE_HIGH_MIN_SUCCESS`.
    static let enhanceHighMinSuccess = 0.01

    /// 상위 밴드 pity (연속 실패당 가산). 밴드 안에서는 `enhancePityBonusPerFail` 을
    /// **대체** 한다 (더하지 않는다). 웹 `ENHANCE_HIGH_PITY_PER_FAIL`.
    static let enhanceHighPityPerFail: [Rarity: Double] = [
        .normal: 0.02, .rare: 0.02, .unique: 0.02, .legend: 0.03,
    ]

    /// 밴드별 비용 배율 0..9 ×1, 10..14 ×1.5, 15..19 ×2. 곱셈의 **마지막** 인자다 —
    /// 모든 중간 곱이 0.25 의 배수라 JS Math.round 와 Swift .rounded() 가 같은 정수를
    /// 낸다. 웹 `ENHANCE_COST_BAND_MULT`.
    static let enhanceCostBandMult: [Double] = [1, 1.5, 2]

    /// 칭호가 붙는 레벨 경계. 웹 `ENHANCE_TITLE_LEVELS`.
    static let enhanceTitleAwakenedLevel = 15
    static let enhanceTitleTranscendedLevel = 20

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

    // ── 실패 3분기: 소실 / 하락 / 유지 (구 `enhancePreserveByRarity` 퇴역) ──
    //
    // 구 규칙은 **레벨과 무관하게 고정**이었다 (normal/rare 0.3, unique 0.4, legend 0.5).
    // 즉 +1→+2 에서 실패해도 70% 확률로 아이템이 사라졌고, 그래서 +2 에 닿기도 전에
    // 벽이 섰다. 장르 관행(메이플 스타포스 0~14성 파괴 0%, 리니지2 +3 까지 안전,
    // 던파 +12 부터 파괴)은 정확히 반대다 — 저강은 안전하고 위험은 고강에서만 붙는다.
    // 그리고 그 사이를 채우는 것이 **등급 하락**이다: 사라지지는 않지만 한 단계
    // 내려가므로 손실감은 주되 판을 엎지 않는다.
    //
    // 새 규칙 — 실패하면 셋 중 하나로 갈린다:
    //   destroy : enhanceDestroyOnFail[L] × enhanceDestroyRarityMult[rarity]
    //   down    : enhanceDownOnFail[L]
    //   keep    : 나머지
    // currentLevel 0..2 (+0→+1 … +2→+3) 는 소실·하락 둘 다 정확히 0 이라 실패해도
    // 100% 유지다. "거의 없다" 가 아니라 0 으로 못박아야 UI 가 "안전" 이라고 정직하게
    // 말할 수 있다. 성공률·감쇠·pity·비용 상수는 이 개편에서 건드리지 않았다.
    //
    // 두 표는 **실패했을 때** 의 조건부 확률이다. 시도당 확률은 (1 - 성공률) × 이 값.

    /// 실패 시 **소실** 확률의 레벨별 기준값. index = currentLevel (시도 전 레벨).
    /// 웹 `ENHANCE_DESTROY_ON_FAIL_BY_LEVEL` 과 값이 같아야 한다.
    /// Phase 5-B 밴드: 10..14 (+10→+15) 소실 0 / 하락 100%, 15..19 (+15→+20) 소실
    /// 30→70% 기본, 나머지는 하락 (유지 0; 등급 배율로 소실이 깎인 unique/legend 만
    /// 그 차이만큼 유지가 남는다).
    static let enhanceDestroyOnFail: [Double] = [
        0, 0, 0,   // +0→+3 : 완전 안전 구간
        0.01,      // +3→+4
        0.02,      // +4→+5
        0.05,      // +5→+6
        0.09,      // +6→+7
        0.14,      // +7→+8
        0.20,      // +8→+9
        0.26,      // +9→+10
        0, 0, 0, 0, 0,  // +10→+15 : 소실 없음 (하락 100%)
        0.3,       // +15→+16
        0.4,       // +16→+17
        0.5,       // +17→+18
        0.6,       // +18→+19
        0.7,       // +19→+20
    ]

    /// 실패 시 **하락**(+L → +L-1) 확률. 소실과 배타적이며 소실 판정이 먼저다.
    /// 하락에는 등급 보정을 두지 않는다 — 되돌릴 수 있는 손실까지 등급별로 깎으면
    /// 상위 등급이 사실상 무손실이 된다. 웹 `ENHANCE_DOWN_ON_FAIL_BY_LEVEL`.
    static let enhanceDownOnFail: [Double] = [
        0, 0, 0,   // +0→+3 : 완전 안전 구간
        0.10,      // +3→+4
        0.15,      // +4→+5
        0.25,      // +5→+6
        0.30,      // +6→+7
        0.35,      // +7→+8
        0.40,      // +8→+9
        0.45,      // +9→+10
        1, 1, 1, 1, 1,  // +10→+15 : 실패는 전부 하락
        0.7,       // +15→+16
        0.6,       // +16→+17
        0.5,       // +17→+18
        0.4,       // +18→+19
        0.3,       // +19→+20
    ]

    /// 등급별 **소실** 확률 배율 (0.7 = 원래 소실 확률의 70%). 가산이 아니라 곱인 이유는
    /// 뺄셈이면 상위 등급이 특정 레벨에서 0 으로 주저앉아 곡선의 형태가 무너지기 때문.
    /// 웹 `ENHANCE_DESTROY_RARITY_MULT`.
    static let enhanceDestroyRarityMult: [Rarity: Double] = [
        .normal: 1.0, .rare: 1.0, .unique: 0.85, .legend: 0.7,
    ]

    /// 안전 구간의 마지막 currentLevel (inclusive). 웹 `ENHANCE_SAFE_MAX_LEVEL`.
    /// 이 값 이하에서는 소실·하락이 모두 0 이고, UI 는 위험 문구·방지권 토글을
    /// 아예 그리지 않는다 — 필요 없는 구간에서 방지권을 권하면 기만이다.
    static let enhanceSafeMaxLevel = 2

    /// 방지권 1종당 보유 상한 — persist 되는 숫자가 무한히 커지는 걸 막는다
    /// (enhanceFailStreak 의 100 cap 과 같은 이유). 웹 `ENHANCE_GUARD_MAX`.
    static let enhanceGuardMax = 99

    /// 등급별 비용 배율. 웹 `ENHANCE_COST_RARITY_MULT`.
    static let enhanceCostRarityMult: [Rarity: Double] = [
        .normal: 1, .rare: 1.5, .unique: 2.5, .legend: 4,
    ]

    // ── Phase 6-E (Track E) — 인벤토리 경제: 판매가 / 가방 상한 / 합성 ────────

    /// 장비 판매 환급의 기본값 (Phase 4a 의 `SELL_PRICE` 표). +0 / 0층 가격은 그대로다.
    /// 실제 환급은 `sellPrice(rarity:dropFloor:enhanceLevel:)`. 웹 `SELL_PRICE_BASE`.
    static let sellPriceBase: [Rarity: Int] = [
        .normal: 5, .rare: 15, .unique: 50, .legend: 200,
    ]
    /// 드롭 층당 가산 (층은 0..99 로 clamp). 웹 `SELL_PRICE_FLOOR_MULT`.
    static let sellPriceFloorMult: [Rarity: Int] = [
        .normal: 1, .rare: 2, .unique: 4, .legend: 8,
    ]
    /// 강화 단계당 가산 (단계는 0..maxEnhanceLevel 로 clamp). 웹 `SELL_PRICE_ENHANCE_MULT`.
    static let sellPriceEnhanceMult: [Rarity: Int] = [
        .normal: 3, .rare: 6, .unique: 15, .legend: 40,
    ]
    /// 판매가 층 clamp 상한. 웹 `SELL_PRICE_FLOOR_CAP`.
    static let sellPriceFloorCap = 99

    /// 판매 환급 = BASE[r] + FLOOR_MULT[r] × clamp(dropFloor ?? 0, 0, 99)
    ///                     + ENHANCE_MULT[r] × clamp(enhanceLevel ?? 0, 0, 20).
    /// 전부 정수 산술 — 웹 `sellPrice` 와 동일 픽스처
    ///   (normal,0,0)=5 · (normal,30,0)=35 · (rare,12,3)=57 · (unique,20,10)=280 ·
    ///   (legend,30,10)=840 · (legend,120,25)=1792 (층 99 · 단계 20 clamp).
    static func sellPrice(rarity: Rarity, dropFloor: Int?, enhanceLevel: Int?) -> Int {
        let f = min(sellPriceFloorCap, max(0, dropFloor ?? 0))
        let l = min(maxEnhanceLevel, max(0, enhanceLevel ?? 0))
        return (sellPriceBase[rarity] ?? 0)
            + (sellPriceFloorMult[rarity] ?? 0) * f
            + (sellPriceEnhanceMult[rarity] ?? 0) * l
    }

    /// 가방 상한. 정산(`acknowledgeSessionEnd` → `splitDropsByCap`) 과 사진 부적 생성에서만
    /// 강제한다 — 장착 해제/합성은 막지 않는다. 웹 `INVENTORY_CAP`.
    static let inventoryCap = 30
    /// 합성 재료 개수 — 같은 등급 3개 → 다음 등급 1개. 웹 `SYNTHESIS_INPUT_COUNT`.
    static let synthesisInputCount = 3
    /// 합성 결과 등급. legend 는 합성 불가 (nil). 웹 `NEXT_RARITY`.
    static let nextRarity: [Rarity: Rarity] = [
        .normal: .rare, .rare: .unique, .unique: .legend,
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
    ///
    /// Phase 5-B — currentLevel >= enhanceHighBandStart 는 명시 표 + 밴드 pity.
    ///   rate = min(1, max(0.01, table/100) + streak × enhanceHighPityPerFail).
    ///   0..9 는 예전 4줄 그대로다.
    static func enhanceSuccessRate(
        rarity: Rarity, currentLevel: Int, failStreak: Int = 0
    ) -> Double {
        let level = max(0, currentLevel)
        if level >= enhanceHighBandStart {
            let idx = min(level, maxEnhanceLevel - 1) - enhanceHighBandStart
            let rawRate = max(
                enhanceHighMinSuccess,
                Double(enhanceHighSuccessByLevel[rarity]![idx]) / 100.0)
            let bandPity = Double(max(0, failStreak)) * enhanceHighPityPerFail[rarity]!
            return min(1.0, rawRate + bandPity)
        }
        let base = Double(enhanceBaseSuccess[rarity]!)
        let decay = Double(enhanceDecayPerLevel[rarity]!)
        let raw = base - Double(max(0, currentLevel)) * decay
        let rawRate = max(0.05, min(1.0, raw / 100.0))
        let pityBonus = Double(max(0, failStreak)) * enhancePityBonusPerFail[rarity]!
        return min(1.0, rawRate + pityBonus)
    }

    /// 밴드별 비용 배율 (마지막 인자). 웹 `enhanceCostBandMult`.
    static func enhanceCostBandMult(currentLevel: Int) -> Double {
        let level = max(0, currentLevel)
        if level < enhanceHighBandStart { return enhanceCostBandMult[0] }
        if level < 15 { return enhanceCostBandMult[1] }
        return enhanceCostBandMult[2]
    }

    /// 강화 시도 코인 비용. 웹 `enhanceCost` — base 30 × (1 + level×0.5) × rarityMult
    /// × 밴드 배율(마지막 인자). rare +11 → 30 × 6.5 × 1.5 × 1.5 = 438.75 → 439.
    static func enhanceCost(rarity: Rarity, currentLevel: Int) -> Int {
        let base = Double(ShopPrices.enhance)
        let level = max(0, currentLevel)
        let levelMult = 1.0 + Double(level) * 0.5
        let rarityMult = enhanceCostRarityMult[rarity]!
        return Int((base * levelMult * rarityMult
                    * enhanceCostBandMult(currentLevel: level)).rounded())
    }

    // ── Phase 5-B — 칭호 / 연출 밴드 ─────────────────────────────────

    /// +15..+19 각성, +20 초월, 그 외 nil. 웹 `getEnhanceTitle`.
    static func enhanceTitle(level: Int) -> EnhanceTitle? {
        if level >= enhanceTitleTranscendedLevel { return .transcended }
        if level >= enhanceTitleAwakenedLevel { return .awakened }
        return nil
    }

    /// 강화 연출 밴드. targetLevel(= currentLevel + 1) 기준.
    ///   0: 목표 +1..+10 (기존 2초) / 1: +11..+15 / 2: +16..+20. 웹 `enhanceRitualBand`.
    static func enhanceRitualBand(targetLevel: Int) -> Int {
        if targetLevel <= enhanceHighBandStart { return 0 }
        if targetLevel <= enhanceTitleAwakenedLevel { return 1 }
        return 2
    }

    /// **실패 시** 3분기 확률의 단일 출처. UI 표기와 스토어 판정이 같은 값을 쓰도록
    /// 두 곳 모두 이 함수만 호출한다. 방지권은 여기 반영하지 않는다 — 방지권은 확률을
    /// 바꾸는 게 아니라 "나온 결과를 바꾸는" 장치이고, 소모 판정은 스토어가 한다.
    /// 웹 `enhanceOutcomeRates`.
    ///
    /// - Parameter currentLevel: 강화를 시도하는 시점의 레벨. +3 → +4 시도면 3.
    static func enhanceOutcomeRates(
        rarity: Rarity, currentLevel: Int
    ) -> EnhanceOutcomeRates {
        let level = max(0, currentLevel)
        if level <= enhanceSafeMaxLevel {
            return EnhanceOutcomeRates(destroy: 0, down: 0, keep: 1)
        }
        // 표 범위를 넘어선 레벨(방어적)은 마지막 값으로 고정.
        let idx = min(level, enhanceDestroyOnFail.count - 1)
        let mult = enhanceDestroyRarityMult[rarity] ?? 1
        let destroy = min(1.0, max(0.0, enhanceDestroyOnFail[idx] * mult))
        // 소실 판정이 먼저이므로 하락은 남은 확률 공간을 넘지 못한다.
        let down = min(min(1.0, max(0.0, enhanceDownOnFail[idx])), 1 - destroy)
        // Phase 5-B — 0.7 + 0.3 같은 조합은 IEEE double 에서 1 - d - w 가 5e-17 로 남는다.
        //   "유지 0" 을 표와 UI 가 정직하게 말할 수 있도록 1e-12 미만은 0 으로 스냅한다
        //   (웹 enhanceOutcomeRates 와 동일; equiv 스크립트는 10자리로 비교).
        let keepRaw = max(0, 1 - destroy - down)
        let keep = keepRaw < 1e-12 ? 0 : keepRaw
        return EnhanceOutcomeRates(destroy: destroy, down: down, keep: keep)
    }

    /// 강화 **실패 시** 아이템이 그대로 남을 확률 (0-1) = 3분기의 keep.
    /// 하락은 "남았다" 로 치지 않는다 — 하락도 손실이라 유지와 같은 칸에 묶어 보여주면
    /// 기만이 된다. 웹 `enhancePreserveRate`.
    static func enhancePreserveRate(rarity: Rarity, currentLevel: Int) -> Double {
        enhanceOutcomeRates(rarity: rarity, currentLevel: currentLevel).keep
    }

    /// 강화 실패 시 소실 확률 (0-1). 방지권을 무시한 "원래 위험". 웹 `enhanceDestroyRate`.
    static func enhanceDestroyRate(rarity: Rarity, currentLevel: Int) -> Double {
        enhanceOutcomeRates(rarity: rarity, currentLevel: currentLevel).destroy
    }

    /// 강화 실패 시 하락 확률 (0-1). 웹 `enhanceDowngradeRate`.
    static func enhanceDowngradeRate(rarity: Rarity, currentLevel: Int) -> Double {
        enhanceOutcomeRates(rarity: rarity, currentLevel: currentLevel).down
    }

    /// 이 레벨에서 소실이 가능한가. UI 가 소실방지권 토글 노출을 판단하는 단일 기준.
    static func canEnhanceDestroy(rarity: Rarity, currentLevel: Int) -> Bool {
        enhanceDestroyRate(rarity: rarity, currentLevel: currentLevel) > 0
    }

    /// 이 레벨에서 하락이 가능한가. UI 가 하락방지권 토글 노출을 판단하는 단일 기준.
    static func canEnhanceDowngrade(rarity: Rarity, currentLevel: Int) -> Bool {
        enhanceDowngradeRate(rarity: rarity, currentLevel: currentLevel) > 0
    }

    /// 완전 안전 구간인가 (실패해도 소실·하락이 둘 다 0). true 면 UI 는 위험 문구·
    /// 방지권 토글을 아예 그리지 않는다. 웹 `isEnhanceSafeLevel`.
    static func isEnhanceSafeLevel(rarity: Rarity, currentLevel: Int) -> Bool {
        let r = enhanceOutcomeRates(rarity: rarity, currentLevel: currentLevel)
        return r.destroy == 0 && r.down == 0
    }

    // ── Phase 5-B — 강화 스탯 성장 순수 헬퍼 (웹/iOS 공유 규칙) ──────────
    //
    // 성공 (applyEnhanceStatGrowth, newLevel 기준):
    //   primary   : 짝수 레벨 ≤ 10 에서 +1 (기존), 11..20 은 매 레벨 +1.
    //   secondary : +15 에서 +2, +20 에서 +3.
    // 하락 (revertEnhanceStatGrowth, 잃는 레벨 기준) 은 정확한 역이며 0 아래로 내리지
    // 않는다. 성공 규칙을 바꾸면 반드시 둘을 같이 바꾼다.

    /// primary 선택 순서. 웹 `ENHANCE_STAT_ORDER`.
    private static let enhanceStatOrder: [StatKey] = [.str, .int, .vit, .dex, .agi, .crit, .slotBonus]
    /// secondary 후보 풀 — crit / slotBonus 제외. 웹 `ENHANCE_SECONDARY_POOL`.
    private static let enhanceSecondaryPool: [StatKey] = [.str, .int, .vit, .dex, .agi]

    /// 장비의 primary stat key — stats 최대값 키. 동률은 선언 순서로 tie-break.
    /// 웹 `pickPrimaryStatKey` (types/uphero.ts) 와 같은 순서/규칙.
    static func pickPrimaryStatKey(_ stats: [StatKey: Int]) -> StatKey? {
        var best: StatKey?
        var bestVal = Int.min
        for key in enhanceStatOrder {
            guard let v = stats[key] else { continue }
            if v > bestVal { best = key; bestVal = v }
        }
        return best
    }

    /// 마일스톤(+15/+20) 보너스를 받을 secondary key — [str,int,vit,dex,agi] 에서
    /// primary 를 뺀 최대값 (동률은 그 순서). 후보가 없으면 primary. 웹 `pickSecondaryStatKey`.
    static func pickSecondaryStatKey(_ stats: [StatKey: Int], primary: StatKey) -> StatKey {
        var best: StatKey?
        var bestVal = Int.min
        for key in enhanceSecondaryPool where key != primary {
            guard let v = stats[key] else { continue }
            if v > bestVal { best = key; bestVal = v }
        }
        return best ?? primary
    }

    private static func enhancePrimaryGrowthAt(level: Int) -> Int {
        if level <= 0 { return 0 }
        if level > enhanceHighBandStart { return 1 }
        return level % 2 == 0 ? 1 : 0
    }

    private static func enhanceSecondaryGrowthAt(level: Int) -> Int {
        if level == enhanceTitleTranscendedLevel { return 3 }
        if level == enhanceTitleAwakenedLevel { return 2 }
        return 0
    }

    /// newLevel 에 도달했을 때의 스탯. 웹 `applyEnhanceStatGrowth`.
    static func applyEnhanceStatGrowth(_ stats: [StatKey: Int], newLevel: Int) -> [StatKey: Int] {
        var next = stats
        guard let primary = pickPrimaryStatKey(stats) else { return next }
        let p = enhancePrimaryGrowthAt(level: newLevel)
        if p > 0 { next[primary] = (next[primary] ?? 0) + p }
        let sBonus = enhanceSecondaryGrowthAt(level: newLevel)
        if sBonus > 0 {
            let secondary = pickSecondaryStatKey(stats, primary: primary)
            next[secondary] = (next[secondary] ?? 0) + sBonus
        }
        return next
    }

    /// lostLevel 을 잃을 때(+L → +L-1) 의 스탯. applyEnhanceStatGrowth(·, L) 의 정확한 역.
    /// 웹 `revertEnhanceStatGrowth`. 0 아래로는 내리지 않는다.
    static func revertEnhanceStatGrowth(_ stats: [StatKey: Int], lostLevel: Int) -> [StatKey: Int] {
        var next = stats
        guard let primary = pickPrimaryStatKey(stats) else { return next }
        let p = enhancePrimaryGrowthAt(level: lostLevel)
        if p > 0 { next[primary] = max(0, (next[primary] ?? 0) - p) }
        let sBonus = enhanceSecondaryGrowthAt(level: lostLevel)
        if sBonus > 0 {
            let secondary = pickSecondaryStatKey(stats, primary: primary)
            next[secondary] = max(0, (next[secondary] ?? 0) - sBonus)
        }
        return next
    }

    /// +0 → +level 까지 primary 에 누적된 증가량 = floor(min(L,10)/2) + max(0, L-10).
    /// 웹 `enhancePrimaryGrowthTotal` (Track E 의 dropFloor 역추정이 쓴다).
    static func enhancePrimaryGrowthTotal(level: Int) -> Int {
        let l = max(0, level)
        return min(l, enhanceHighBandStart) / 2 + max(0, l - enhanceHighBandStart)
    }

    /// 이름에서 " +N" / legacy " +" 접미사 제거. 웹 `stripEnhanceSuffix` (정규식 동일:
    /// `/\s+\+\d*$/`). 강화 성공 시 매번 strip 후 재부여해 "검 +3 +4" 를 막는다.
    static func stripEnhanceSuffix(_ name: String) -> String {
        guard let r = name.range(of: "\\s+\\+\\d*$", options: .regularExpression) else {
            return name
        }
        return String(name[name.startIndex..<r.lowerBound])
    }

    // ── 영웅 레벨 / 외형 ──────────────────────────────────────────

    /// 영웅 외형 variant (레벨 기반). 웹 `getHeroAppearanceVariant`.
    static func getHeroAppearanceVariant(level: Int) -> Int {
        if level >= 30 { return 2 }
        if level >= 10 { return 1 }
        return 0
    }

    /// 영웅 전용 레벨 = max(1, gameLevel − heroStartLevel + 1). 웹 `getEffectiveHeroLevel`.
    ///
    /// Phase 2-A 이후 영웅 레벨은 `heroXp` 풀(`heroLevelFromXP`)이 진실이다. 이 공식은
    /// (1) `UpHeroStore.ensureHeroXp` 가 레거시 저장본을 딱 한 번 시드할 때, (2) 시드 전
    /// `resolveHeroLevel` 의 표시 폴백으로만 남는다. 새 코드는 `resolveHeroLevel` /
    /// `UpHeroStore.heroLevel` 을 쓸 것.
    static func getEffectiveHeroLevel(gameLevel: Int, heroStartLevel: Int?) -> Int {
        let startLvl = heroStartLevel ?? 1
        return max(1, gameLevel - startLvl + 1)
    }

    // ── Phase 2-A (Track A) — 영웅 XP 풀 / 레벨 곡선 / 스킬 포인트 파생 ────────
    //
    // 웹 src/types/uphero.ts 의 같은 블록을 1:1 미러. 전부 정수 산술이라 결과가 비트
    // 단위로 같아야 한다 (scripts/verify-equivalence.sh uphero 섹션 13-17).
    //
    // 곡선: gap(L) = A·L² + B·L + C = L² + 120 (heroXpGapA/B/C = 1/0/120).
    //   heroTotalXPForLevel(L) = Σ_{k=1}^{L-1} gap(k) = n(n+1)(2n+1)/6 + 120n (n = L-1).
    //   표: 1:0 2:121 5:510 10:1,365 20:4,750 22:5,831 30:12,035 40:25,220
    //       45:34,650 47:39,031 50:46,305 60:77,290 999:331,955,259.
    // 순수 함수는 입력을 접는다: 음수 XP → 0, 레벨 → [1, heroLevelCap].
    // (웹의 비유한(NaN/Infinity) 분기는 Int 에 존재하지 않는다.)

    /// 영웅 레벨 상한. 곡선/스킬 포인트/역함수 모두 이 값에서 멈춘다. 웹 `HERO_LEVEL_CAP`.
    static let heroLevelCap = 999
    /// 스킬 포인트는 Lv31 부터 레벨당 1. 웹 `HERO_SP_LEVEL_FLOOR`.
    static let heroSpLevelFloor = 30
    /// gap(L) = A·L² + B·L + C. 웹 `HERO_XP_GAP_A/B/C`.
    static let heroXpGapA = 1
    static let heroXpGapB = 0
    static let heroXpGapC = 120
    /// 보스 처치 보너스 XP 계수. 웹 `BOSS_CLEAR_XP_PER_FLOOR`.
    static let bossClearXpPerFloor = 20
    /// 층 진입 XP 기본값. 웹 `FLOOR_XP_BASE`.
    static let floorXpBase = 5

    /// 레벨 입력 정규화 — [1, heroLevelCap]. 웹 `clampHeroLevel`.
    private static func clampHeroLevel(_ level: Int) -> Int {
        min(heroLevelCap, max(1, level))
    }

    /// Lv L → L+1 에 필요한 XP (gap). 입력은 [1, cap] 으로 접는다. 웹 `heroXpToNextLevel`.
    static func heroXpToNextLevel(_ level: Int) -> Int {
        let L = clampHeroLevel(level)
        return heroXpGapA * L * L + heroXpGapB * L + heroXpGapC
    }

    /// Lv L 에 도달하는 데 필요한 누적 XP (닫힌 형식, 정수). Lv1 = 0. 웹 `heroTotalXPForLevel`.
    static func heroTotalXPForLevel(_ level: Int) -> Int {
        let n = clampHeroLevel(level) - 1
        let sumSq = n * (n + 1) * (2 * n + 1) / 6
        let sumLin = n * (n + 1) / 2
        return heroXpGapA * sumSq + heroXpGapB * sumLin + heroXpGapC * n
    }

    /// 영웅 XP 풀 상한 = heroTotalXPForLevel(heroLevelCap) = 331,955,259. 웹 `HERO_XP_CAP`.
    static let heroXpCap: Int = heroTotalXPForLevel(heroLevelCap)

    /// XP 값 정규화 — 음수 → 0, 상한 heroXpCap. 웹 `clampHeroXp`.
    static func clampHeroXp(_ xp: Int) -> Int {
        min(heroXpCap, max(0, xp))
    }

    /// 누적 XP → 영웅 레벨 (역함수, 선형 스캔). heroLevelFromXP(total(L)) == L,
    /// heroLevelFromXP(total(L) - 1) == L - 1. 상한에서 멈춘다. 웹 `heroLevelFromXP`.
    static func heroLevelFromXP(_ totalXp: Int) -> Int {
        let xp = clampHeroXp(totalXp)
        var level = 1
        while level < heroLevelCap, heroTotalXPForLevel(level + 1) <= xp {
            level += 1
        }
        return level
    }

    /// 현재 레벨 안의 진행도 (XP 바 표시용). 웹 `getHeroXPProgress`.
    static func heroXPProgress(totalXp: Int, level: Int) -> (current: Int, needed: Int) {
        let xp = clampHeroXp(totalXp)
        let L = clampHeroLevel(level)
        return (max(0, xp - heroTotalXPForLevel(L)), heroXpToNextLevel(L))
    }

    /// 레벨이 누적으로 부여한 스킬 포인트 총량 = max(0, min(cap, L) - 30). 남은 SP 는
    /// 여기서 learnedSkills 의 pointCost 합을 뺀 파생값이다 (UpHeroStore.deriveSkillPoints).
    /// 별도 지급/차감 카운터는 없다. 웹 `skillPointsTotalForLevel`.
    static func skillPointsTotalForLevel(_ level: Int) -> Int {
        max(0, clampHeroLevel(level) - heroSpLevelFloor)
    }

    /// 보스 처치 보너스 XP = round(floor × 20 × ngMult) — victory 엔트리의 xp 에 합산
    /// (xpMult 적용 전 값). 양수 Double 의 `.rounded()` 는 웹 Math.round 와 같다.
    /// 웹 `bossClearXp`.
    static func bossClearXp(floor: Int, ngPlusLevel: Int?) -> Int {
        Int((Double(floor * bossClearXpPerFloor) * ngPlusScaleMult(ngPlusLevel)).rounded())
    }

    /// 층 진입 XP = round((5 + floor) × ngMult) — 층 전환 때 rewards.xp 에 더한다
    /// (xpMult 적용 전 값). 웹 `floorXp`.
    static func floorXp(floor: Int, ngPlusLevel: Int?) -> Int {
        Int((Double(floorXpBase + floor) * ngPlusScaleMult(ngPlusLevel)).rounded())
    }

    /// 표시/판정용 영웅 레벨 단일 진입점 — heroXp 가 시드됐으면 곡선의 역함수, 아직이면
    /// 레거시 공식으로 폴백한다 (시드 전 잠깐 동안에도 Lv47 영웅이 Lv1 로 깜빡이지 않게).
    /// 웹 `resolveHeroLevel`.
    static func resolveHeroLevel(heroXp: Int?, gameLevel: Int, heroStartLevel: Int?) -> Int {
        guard let heroXp else {
            return getEffectiveHeroLevel(gameLevel: gameLevel, heroStartLevel: heroStartLevel)
        }
        return heroLevelFromXP(heroXp)
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

// MARK: - 던전 이벤트 + flavor JSON Decodable
//
// flavor 이벤트 데이터(Flavor.json)를 디코드하기 위한 타입/준수.
// discriminated union (ChoiceEffect/SimpleChoiceEffect/NarrativeValue) 은
// kind 판별자 기반 custom init(from:). ChoiceOption/ChoiceOutcome/DungeonEvent
// 는 필드명이 JSON 키와 동일 → synthesized Decodable.

/// 던전 이벤트 — prompt + 선택지. 웹 `DungeonEvent` (flavor/_types.ts).
struct DungeonEvent: Equatable, Decodable {
    var prompt: String
    var promptKey: String?
    var options: [ChoiceOption]
}

extension NarrativeValue: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) {
            self = .text(s)
        } else if let d = try? c.decode(Double.self) {
            self = .number(d)
        } else {
            throw DecodingError.dataCorruptedError(
                in: c, debugDescription: "NarrativeValue: string|number 아님")
        }
    }
}

/// Phase 4-D (Track D) — 효과 디코더의 "모르는 kind" 정책.
///
/// Flavor.json 은 웹 데이터에서 추출되므로 웹이 먼저 새 kind 를 실으면 오래된 iOS
/// 빌드가 그 JSON 을 만날 수 있다. 예전엔 throw → `FlavorPool.loadData` 의 fatalError
/// 로 앱이 죽었다. 이제는 `.nothing` 으로 관용 디코드하고, DEBUG 에서만 assertion 으로
/// 개발자에게 알린다. 테스트는 `tolerateUnknownKinds` 를 켜 assertion 없이 관용
/// 경로를 검증한다.
enum ChoiceEffectDecoding {
    static var tolerateUnknownKinds = false

    static func unknownKind(_ kind: String, in type: String) {
        #if DEBUG
        if !tolerateUnknownKinds {
            assertionFailure("\(type): unknown effect kind '\(kind)' — decoded as .nothing")
        }
        #endif
    }
}

extension SimpleChoiceEffect: Decodable {
    private enum K: String, CodingKey {
        case kind, coins, xp, dropEquipmentId, amount, delta, count,
             stat, pct, floors, encounters
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "reward":
            self = .reward(
                coins: try c.decodeIfPresent(Int.self, forKey: .coins),
                xp: try c.decodeIfPresent(Int.self, forKey: .xp),
                dropEquipmentId: try c.decodeIfPresent(String.self, forKey: .dropEquipmentId))
        case "damage": self = .damage(amount: try c.decode(Int.self, forKey: .amount))
        case "heal": self = .heal(amount: try c.decode(Int.self, forKey: .amount))
        case "time": self = .time(delta: try c.decode(Int.self, forKey: .delta))
        case "skipFloors": self = .skipFloors(count: try c.decode(Int.self, forKey: .count))
        case "revealBoss": self = .revealBoss
        case "runBuff":
            self = .runBuff(
                stat: try c.decode(RunModStat.self, forKey: .stat),
                pct: try c.decode(Int.self, forKey: .pct),
                floors: try c.decodeIfPresent(Int.self, forKey: .floors))
        case "runCurse":
            self = .runCurse(
                stat: try c.decode(RunModStat.self, forKey: .stat),
                pct: try c.decode(Int.self, forKey: .pct),
                floors: try c.decodeIfPresent(Int.self, forKey: .floors))
        case "stealth": self = .stealth(encounters: try c.decode(Int.self, forKey: .encounters))
        case "guaranteedDrop":
            self = .guaranteedDrop(count: try c.decodeIfPresent(Int.self, forKey: .count))
        case "nothing": self = .nothing
        case let k:
            ChoiceEffectDecoding.unknownKind(k, in: "SimpleChoiceEffect")
            self = .nothing
        }
    }
}

extension ChoiceEffect: Decodable {
    private enum K: String, CodingKey {
        case kind, coins, xp, dropEquipmentId, amount, count, delta, successChance,
             minigame, difficulty, successEffects, failEffects,
             stat, pct, floors, encounters
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "reward":
            self = .reward(
                coins: try c.decodeIfPresent(Int.self, forKey: .coins),
                xp: try c.decodeIfPresent(Int.self, forKey: .xp),
                dropEquipmentId: try c.decodeIfPresent(String.self, forKey: .dropEquipmentId))
        case "damage": self = .damage(amount: try c.decode(Int.self, forKey: .amount))
        case "heal": self = .heal(amount: try c.decode(Int.self, forKey: .amount))
        case "skipFloors": self = .skipFloors(count: try c.decode(Int.self, forKey: .count))
        case "revealBoss": self = .revealBoss
        case "runBuff":
            self = .runBuff(
                stat: try c.decode(RunModStat.self, forKey: .stat),
                pct: try c.decode(Int.self, forKey: .pct),
                floors: try c.decodeIfPresent(Int.self, forKey: .floors))
        case "runCurse":
            self = .runCurse(
                stat: try c.decode(RunModStat.self, forKey: .stat),
                pct: try c.decode(Int.self, forKey: .pct),
                floors: try c.decodeIfPresent(Int.self, forKey: .floors))
        case "stealth": self = .stealth(encounters: try c.decode(Int.self, forKey: .encounters))
        case "guaranteedDrop":
            self = .guaranteedDrop(count: try c.decodeIfPresent(Int.self, forKey: .count))
        case "nothing": self = .nothing
        case "time": self = .time(delta: try c.decode(Int.self, forKey: .delta))
        case "fight": self = .fight
        case "flee": self = .flee(successChance: try c.decode(Double.self, forKey: .successChance))
        case "startMinigame":
            self = .startMinigame(
                minigame: try c.decode(MinigameId.self, forKey: .minigame),
                difficulty: try c.decode(Int.self, forKey: .difficulty),
                successEffects: try c.decode([SimpleChoiceEffect].self, forKey: .successEffects),
                failEffects: try c.decode([SimpleChoiceEffect].self, forKey: .failEffects))
        case let k:
            ChoiceEffectDecoding.unknownKind(k, in: "ChoiceEffect")
            self = .nothing
        }
    }
}

// MARK: - Codable 준수 (Phase 4 슬라이스 15 — Up Hero 로컬 영속화)
//
// Up Hero 상태를 기기 로컬 파일에 저장하기 위한 영속 대상 도메인 타입의 Codable.
// struct 의 Codable 합성은 타입 선언과 같은 파일이어야 하므로 여기에 둔다.
// String-raw enum·단순 struct 라 전부 자동 합성된다 (custom 구현 불필요).
// 영속 스냅샷 구조(PersistedUpHeroState)와 파일 I/O 는 UpHeroPersistence.swift.
//
// currentSession(CombatSession)·LogEntry·CardBuff 등 전투 세션 그래프는
// discriminated-union 의 custom Codable 이 필요해 전투 슬라이스로 유보한다.

extension EquipSlot: Codable {}
extension ClassType: Codable {}
extension StatKey: Codable {}
extension HeroBaseStats: Codable {}
extension Equipment: Codable {}
extension Hero: Codable {}
extension DungeonProgress: Codable {}
extension PendingDungeonPrep: Codable {}
extension Codex: Codable {}
extension Cosmetics: Codable {}
extension ShopDaily: Codable {}
extension WeeklyVariant: Codable {}
