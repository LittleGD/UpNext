//
//  UpHeroSlot.swift
//  Up Hero — 굴림틀(rune drum) 확률 테이블 + 표시 규약. 웹 `src/lib/upHeroSlot.ts` 1:1 포팅.
//
//  던전 분기 이벤트의 한 종류로 등장하는 "코인을 넣고 레버를 당기는 장치" 다.
//  세 개의 룬 드럼이 돌아가 같은 룬이 맞으면 보상이 나온다.
//
//  ── 등급 결정 (C안) ─────────────────────────────────────────────────────
//
//  애플 등급 문항에서 Simulated Gambling: Infrequent (13+) 를 감수한다. 그 대신
//  9+ 방어용으로 걸어뒀던 연출 제약(near-miss 원천 배제·릴 타이밍 고정·꽝 무연출·
//  카지노 어휘 금지)을 풀고 재미와 감촉을 우선한다.
//
//  유지하는 것 (18+ 판정과 한국 RCN 방어, 그리고 앱의 정직성):
//   - `dailySpinCap` 상한. "Infrequent" 판정의 근거다.
//   - 확률 테이블 불변 + 확률 공개 UI. near-miss 는 **결과가 이미 꽝으로 확정된
//     뒤의 표시**일 뿐 당첨 확률을 1‰ 도 바꾸지 않는다 (아래 `render`).
//   - 코인 IAP 없음. 스테이크는 던전에서 주운 코인만이다.
//
//  ── 아키텍처: 결과 우선, 드럼은 표시 전용 ───────────────────────────────
//
//    rollOutcome(blankStreak:rng:) -> SlotOutcomeId       // 가중 테이블 1회 롤
//    render(outcome, rng:)         -> SlotRender          // 확정 결과를 드럼 3칸으로
//    reelTimings(symbols)          -> [t1, t2, t3]        // 릴 정지 시각 (웹·iOS 공용)
//
//  릴 스트립도, 가상 릴 매핑도, 심볼별 확률도 없다. 확률의 단일 출처는 아래
//  `outcomes` 가중치 하나뿐이다. 실제 슬롯머신이 릴 매핑으로 near-miss 를
//  "제조" 하는 것과 달리, 여기서는 롤이 끝나고 꽝이 확정된 뒤에 그 꽝을 어떤
//  그림으로 보여줄지만 고른다. 그래서 near-miss 비율(`nearMissRate`)을 아무렇게나
//  바꿔도 RTP·당첨률은 그대로다. 테스트가 이 성질을 고정한다.
//
//  웹과 iOS 는 이 파일의 상수 배열·비율·타이밍 표만 맞추면 같은 감각을 낸다.
//  난수 소비 순서까지 웹과 같아서 같은 seed 면 같은 그림이 나온다 (XCTest 픽스처).
//

import Foundation

// MARK: - 결과 / 룬 식별자

/// 굴림 1회의 결과. 웹 `SlotOutcomeId` 와 raw value 가 바이트 동일해야 한다 —
/// i18n key(`uphero.slot.result.<id>`) 와 로그 페이로드가 이 문자열을 쓴다.
enum SlotOutcomeId: String, CaseIterable, Equatable, Codable {
    case blank
    case coinSmall
    case coinMid
    case coinJackpot
    case rankProtect
    case destroyProtect
    case itemBox
    case battleBuff
}

/// 드럼에 그려지는 룬. 픽셀아트 결을 지키는 던전 도상 (7·체리·BAR 는 쓰지 않는다).
enum SlotSymbol: String, CaseIterable, Equatable, Codable {
    case blank
    case coin
    case coins
    case gem
    case shield
    case cloth
    case chest
    case star
}

/// 결과 1종의 확률·회계·표시 정의. 웹 `SlotOutcomeDef`.
struct SlotOutcomeDef: Equatable {
    let id: SlotOutcomeId
    /// 상대 가중치. 합계는 반드시 `UpHeroSlot.weightTotal`.
    let weight: Int
    /// RTP 회계용 기준가 (코인 환산). 코인은 액면가, 소모품은 상점가 상당.
    let value: Int
    /// 세 드럼이 맞았을 때 그려질 룬. 꽝은 `UpHeroSlot.render` 가 따로 고른다.
    let symbol: SlotSymbol
}

/// 결과별 실제 지급 내용. 전투 레이어가 이 표를 읽어 배선한다.
/// 확률과 지급을 한 파일에 묶어두면 "표는 고쳤는데 지급을 안 고친" 어긋남이 없다.
enum SlotGrant: Equatable {
    case none
    case coins(amount: Int)
    /// 소실방지권 n 장. 상점에서 살 수 없는 물건이라 굴림틀이 주요 공급원 중 하나.
    case destroyGuards(count: Int)
    /// 하락방지권 n 장.
    case downGuards(count: Int)
    /// 층 보정 랜덤 장비 1개 — 기존 드롭 생성기를 그대로 재사용한다.
    case itemBox(floorBonus: Int)
    /// 다음 n 전투 동안 능력치 +pct%.
    case combatBuff(pct: Int, battles: Int)
}

/// `UpHeroSlot.render` 출력. 웹 `SlotRender`.
struct SlotRender: Equatable {
    /// 드럼 세 칸. 항상 3개.
    var symbols: [SlotSymbol]
    /// 꽝을 "두 개 맞고 하나 빗나간" 그림으로 그렸는가. 결과가 이미 꽝으로 확정된
    /// 뒤의 표시 선택이라 확률과 무관하다. 보상이면 항상 false.
    var nearMiss: Bool
}

/// 결과 확정 뒤 연출 강도. 웹 `SlotTier`. 웹·iOS 가 같은 표를 읽어 같은 감촉을 낸다.
///
///  - none  : 꽝. 저음 둔탁음 + light 햅틱 1회 + 프레임 15% 디밍 250ms.
///  - small : 명도 플래시 2프레임 + medium 햅틱.
///  - mid   : 입자 링 + 더블 햅틱 + 짧은 징글.
///  - big   : 풀 버스트 + 화면 2px 셰이크 300ms + 픽셀 스파크 낙하 + 트리플 햅틱
///            + "대박" 카피 + 결과 모달 big 톤.
enum SlotTier: String, Equatable {
    case none, small, mid, big
}

// MARK: - 결과 페이로드

/// 확정된 굴림 결과를 로그 엔트리에 실어 UI 로 나르는 값. 웹 `SlotResultPayload`.
///
/// 표시에 필요한 전부를 담는다 — UI 는 이걸 그리기만 하고 난수를 굴리지 않는다.
/// 지급은 이미 전투 레이어에서 끝났으므로 연출을 건너뛰어도 보상이 어긋나지 않는다.
struct SlotResultPayload: Equatable {
    var outcome: SlotOutcomeId
    /// 드럼 세 칸. 항상 3개 (`UpHeroSlot.renderSymbols` 출력).
    var symbols: [SlotSymbol]
    var cost: Int
    /// 이 굴림으로 받은 코인 (없으면 nil).
    var coins: Int?
    var destroyGuards: Int?
    var downGuards: Int?
    /// 전투 버프 보상일 때의 상승률(퍼센트 포인트)과 지속 전투 수.
    var buffPct: Int?
    var buffBattles: Int?

    init(
        outcome: SlotOutcomeId,
        symbols: [SlotSymbol],
        cost: Int = UpHeroSlot.spinCost,
        coins: Int? = nil,
        destroyGuards: Int? = nil,
        downGuards: Int? = nil,
        buffPct: Int? = nil,
        buffBattles: Int? = nil
    ) {
        self.outcome = outcome
        // 세 칸을 못 받았으면 결과 룬으로 채운다 — 빈 드럼을 그리느니 정직한 표시.
        self.symbols = symbols.count == 3
            ? symbols
            : Array(repeating: UpHeroSlot.def(outcome).symbol, count: 3)
        self.cost = cost
        self.coins = coins
        self.destroyGuards = destroyGuards
        self.downGuards = downGuards
        self.buffPct = buffPct
        self.buffBattles = buffBattles
    }
}

// MARK: - 전투 버프

/// 굴림틀 `battleBuff` 보상이 거는 일시 능력치 상승. 웹 `{ pct, battlesLeft }`.
///
/// `pct` 는 **모든 층위에서 퍼센트 포인트**다 (10 = +10%). 전투 계산이
/// `1 + pct/100` 으로 곱하고, 상태·클라우드도 같은 단위를 그대로 싣는다 —
/// 세션↔상태를 오갈 때 변환하지 않는다.
///
/// (이전에는 상태/클라우드 층위만 [0,1] 비율로 클램프해서, 굴림틀이 준 pct=10 이
/// 탐험을 넘길 때 1 로 접혀 다음 탐험에서 +1% 로 먹는 버그가 있었다. 웹 정본이
/// 퍼센트 포인트로 통일했고 상한은 100(= 배율 2배)이다.)
struct CombatBuff: Equatable, Codable {
    var pct: Double
    var battlesLeft: Int

    /// 상태/클라우드 층위 클램프 — 웹 `normalizeCombatBuff` 와 동일.
    /// 만료(잔여 0)거나 값이 깨졌으면 nil 로 접는다.
    static func normalized(pct: Double?, battlesLeft: Int?) -> CombatBuff? {
        let p = (pct?.isFinite == true) ? pct! : 0
        let left = battlesLeft ?? 0
        if p <= 0 || left <= 0 { return nil }
        // 상한: 배율 2배(+100% = pct 100) / 20 전투.
        return CombatBuff(pct: min(100, p), battlesLeft: min(20, left))
    }

    /// 만료 처리한 자신. `normalized` 와 같은 규칙.
    var normalized: CombatBuff? {
        CombatBuff.normalized(pct: pct, battlesLeft: battlesLeft)
    }
}

// MARK: - 테이블

enum UpHeroSlot {

    // ══════════════════════════════════════════════════════════════════
    // 비용 / 상한
    // ══════════════════════════════════════════════════════════════════

    /// 1회 굴림 비용. `ShopPrices.reroll` 과 같은 티어.
    ///
    /// 100 을 고른 근거:
    ///  - 데일리 코인 주머니 평균 90 (범위 20~160) 이 대략 1회. "오늘 공짜로 받은 게
    ///    한 판" 이라는 읽기 쉬운 관계가 생긴다.
    ///  - 하루 최대 지출 300C. 풀 클리어 런 수입 추정 3,000~4,000C 의 8~10% 라
    ///    의미는 있되 파괴적이지 않다.
    ///  - 소실방지권 기준가 300 의 1/3. "세 판이면 방지권 한 장 값" 이 성립해
    ///    기대값 감각이 잡힌다.
    ///  - 상점 최저가 fastForward(20) / fortune(30) / ticket(50) 보다 확실히 위다.
    ///    습관적으로 누르는 버튼이 되면 안 된다.
    static let spinCost = 100

    /// 굴림 횟수 상한 — **하루 3회**.
    ///
    /// 카운터는 `UpHeroState.shopDaily.slotSpins` 에 산다. 탐험권·코인 주머니와 같은
    /// 날짜 키(`AppClock.todayString`, 새벽 1시 경계)로 리셋되므로 하루에 탐험을 몇 번
    /// 하든 합산 3회다. 세션은 이 카운터를 갖지 않는다 — 스토어가 오늘 값을 스냅샷
    /// (`slotSpinsToday`)으로 세션 배선에 넘기고, 굴림이 실제로 일어났을 때만 +1 한다.
    /// 애플 등급 "Simulated Gambling: Infrequent" 판정의 근거이자 패치노트
    /// "하루 세 번까지" 의 정직성이 이 상수에 걸려 있다. 웹 `SLOT_DAILY_SPIN_CAP`.
    static let dailySpinCap = 3

    /// `shopDaily.slotSpins` 의 클라우드 와이어 방어 상한. 정상 경로에서는 절대
    /// `dailySpinCap` 을 넘지 않지만 손상된 문서가 들어와도 정수 [0, 100] 으로 접는다.
    /// 웹 `SLOT_SPINS_WIRE_MAX`.
    static let spinsWireMax = 100

    /// 오늘 굴림 횟수 정규화 — nil·음수는 0, 상한 초과는 `spinsWireMax`. 소수는
    /// 호출부(`lenientInt`)가 이미 내림한 정수를 넘긴다. 웹 `normalizeSlotSpins`.
    static func normalizeSpins(_ raw: Int?) -> Int {
        guard let raw else { return 0 }
        return max(0, min(spinsWireMax, raw))
    }

    /// 연속 꽝 pity. `pityThreshold - 1` (= 4) 회 연속 꽝이면 다음 굴림은 반드시
    /// 보상이 나온다 (꽝 가중치를 0 으로 접고 나머지만으로 재정규화).
    ///
    /// 스트릭은 **탐험을 넘어 영속**한다 — `UpHeroState.slotBlankStreak` 이 유일한
    /// 진실이고 클라우드 왕복(와이어 키 "slotBlankStreak")도 탄다. 예전에는 세션
    /// 안에서만 셈해서 세션당 상한 3 에 막혀 임계 5 에 닿을 수 없었다(죽은 pity).
    /// 스토어(`UpHeroStore.resolveChoice`)가 상태 스트릭을 롤 입력으로 넘기고,
    /// 결과를 `nextBlankStreak` 로 되받아 적는다.
    ///
    /// 투명 pity: 스트릭이 `pityThreshold - 1` 에 닿으면 (`isPityArmed`) UI 가
    /// 스핀 전에 "다음은 반드시 나와요" 힌트를 띄운다. 숨기지 않는다.
    ///
    /// 실효 RTP: 원시 92.75% → pity 포함 약 95.4% (정상 상태 마르코프 체인, 스트릭
    /// 4 에 머무는 비율 ≈ 3.0%). 확률 공개 UI 의 표(`odds`)는 원시 표 그대로다 —
    /// pity 는 표를 바꾸는 게 아니라 "5번째는 꽝을 뺀 표로 굴린다" 는 별도 규칙이다.
    static let pityThreshold = 5

    /// 영속 스트릭의 방어 상한. 정상 경로에서는 pity 가 4 에서 끊어주므로 절대 5 를
    /// 넘지 않는다 — 손상된 저장본/클라우드 값이 들어와도 정수 [0, 1000] 으로 접는다.
    /// 웹 `SLOT_BLANK_STREAK_MAX`.
    static let blankStreakMax = 1000

    /// 소실방지권 1장의 RTP 회계 기준가.
    ///
    /// 소실방지권은 상점에서 팔지 않으므로 붙은 가격표가 없다. 그래도 300 은 이
    /// 아이템의 확립된 가치이고 아래 가중치가 그 값을 기준으로 풀렸으므로, 상수를
    /// 지우지 말고 회계 기준으로 남긴다. 값을 바꾸려면 가중치를 함께 다시 풀 것.
    static let destroyGuardShadowValue = 300

    /// 하락방지권 1장의 가치. `ShopPrices.downGuard` 와 같아야 한다.
    static let downGuardValue = 150

    // ══════════════════════════════════════════════════════════════════
    // 보상 테이블
    // ══════════════════════════════════════════════════════════════════

    /// 확정 보상 테이블. **가중치 합계는 반드시 1000.**
    ///
    /// 각 결과의 `value` 는 RTP 회계용 기준가다. 코인은 액면가, 소모품은 상점가
    /// (또는 상점가 상당), 버프는 아래 근거.
    ///
    ///  - `rankProtect` 150 : 하락방지권 1장 (`ShopPrices.downGuard`).
    ///  - `destroyProtect` 300 : 소실방지권 1장 (`destroyGuardShadowValue`).
    ///  - `itemBox` 150 : 층 보정 랜덤 장비 1개. 기존 드롭 생성기를 그대로 쓴다.
    ///  - `battleBuff` 100 : 다음 3전투 능력치 +10%. 굴림 1회 값어치.
    ///
    /// ⚠️ 웹 `SLOT_OUTCOMES` 와 **순서까지** 같아야 한다. 누적 가중치를 훑는
    /// 방식이라 순서가 다르면 같은 난수에서 다른 결과가 나온다.
    static let outcomes: [SlotOutcomeDef] = [
        SlotOutcomeDef(id: .blank,          weight: 490, value: 0,   symbol: .blank),
        SlotOutcomeDef(id: .coinSmall,      weight: 194, value: 100, symbol: .coin),
        SlotOutcomeDef(id: .coinMid,        weight: 112, value: 250, symbol: .coins),
        SlotOutcomeDef(id: .coinJackpot,    weight: 17,  value: 700, symbol: .gem),
        SlotOutcomeDef(id: .rankProtect,    weight: 105, value: 150, symbol: .shield),
        SlotOutcomeDef(id: .destroyProtect, weight: 39,  value: 300, symbol: .cloth),
        SlotOutcomeDef(id: .itemBox,        weight: 34,  value: 150, symbol: .chest),
        SlotOutcomeDef(id: .battleBuff,     weight: 9,   value: 100, symbol: .star),
    ]

    /// 가중치 합계 계약값. 테스트가 이 값을 강제한다.
    static let weightTotal = 1000

    /// 결과별 실제 지급 내용. 웹 `SLOT_GRANTS`.
    static let grants: [SlotOutcomeId: SlotGrant] = [
        .blank: .none,
        .coinSmall: .coins(amount: 100),
        .coinMid: .coins(amount: 250),
        .coinJackpot: .coins(amount: 700),
        .rankProtect: .downGuards(count: 1),
        .destroyProtect: .destroyGuards(count: 1),
        // 보스 드롭과 같은 +10 층 보정. "굴림틀에서 나온 상자" 가 잡몹 드롭보다는 좋다.
        .itemBox: .itemBox(floorBonus: 10),
        .battleBuff: .combatBuff(pct: 10, battles: 3),
    ]

    /// 결과 정의 조회. 표가 상수라 nil 이 나올 수 없지만, 호출부가 옵셔널을
    /// 강제 해제하지 않아도 되게 blank 를 폴백으로 둔다.
    static func def(_ id: SlotOutcomeId) -> SlotOutcomeDef {
        outcomes.first { $0.id == id } ?? outcomes[0]
    }

    /// 결과별 지급 내용 조회.
    static func grant(_ id: SlotOutcomeId) -> SlotGrant {
        grants[id] ?? .none
    }

    /// 꽝이 아닌 결과인가. UI 가 연출 강도를 가르는 단일 기준. 웹 `isSlotWin`.
    static func isWin(_ id: SlotOutcomeId) -> Bool {
        id != .blank
    }

    // ══════════════════════════════════════════════════════════════════
    // 롤
    // ══════════════════════════════════════════════════════════════════

    /// 가중 테이블 1회 롤. 웹 `rollSlotOutcome`.
    ///
    /// - Parameters:
    ///   - blankStreak: 직전까지 연속으로 나온 꽝 횟수. `pityThreshold - 1`
    ///     이상이면 꽝 가중치를 0 으로 접고 나머지 결과만으로 재정규화한다. 즉 이번
    ///     굴림은 반드시 보상이 나오되, 보상 **종류의 상대 비율은 원래 표 그대로** 다.
    ///   - rng: 난수원. 세션 RNG 를 물리면 웹과 같은 seed 에서 같은 수열이 나온다.
    static func rollOutcome<R: RandomSource>(
        blankStreak: Int = 0,
        rng: inout R
    ) -> SlotOutcomeId {
        let pity = isPityArmed(blankStreak: blankStreak)
        let pool = pity ? outcomes.filter { $0.id != .blank } : outcomes
        let total = pool.reduce(0) { $0 + $1.weight }
        if total <= 0 { return .blank }
        // 웹과 같은 감산 훑기. Double 누적이 아니라 단발 곱이라 부동소수 오차가
        // 웹(`rand() * total` 후 정수 감산)과 비트 단위로 같은 경로를 탄다.
        var roll = rng.unit() * Double(total)
        for o in pool {
            roll -= Double(o.weight)
            if roll < 0 { return o.id }
        }
        return pool[pool.count - 1].id
    }

    /// 영속 스트릭을 관용적으로 교정 — 정수 [0, `blankStreakMax`]. 웹 `normalizeSlotBlankStreak`.
    /// 로컬 저장본·클라우드·스토어가 전부 이 하나를 쓴다 (한쪽만 고치지 말 것).
    /// 필드가 없는 레거시 저장본(nil)은 0 이다.
    static func normalizeBlankStreak(_ raw: Int?) -> Int {
        guard let raw else { return 0 }
        return max(0, min(blankStreakMax, raw))
    }

    /// 다음 굴림이 pity 로 보장되는가. 롤(`rollOutcome`)과 힌트 UI 가 같은 판정을
    /// 읽어야 "힌트는 떴는데 꽝" 이 구조적으로 불가능하다. 웹 `isSlotPityArmed`.
    static func isPityArmed(blankStreak: Int) -> Bool {
        normalizeBlankStreak(blankStreak) >= pityThreshold - 1
    }

    /// 굴림 1회 뒤의 스트릭. 보상이면 0, 꽝이면 +1 (상한 `blankStreakMax`).
    /// 스토어가 상태를 갱신할 때 쓰는 유일한 규칙이라 여기 두고 테스트로 고정한다.
    /// 웹 `nextSlotBlankStreak`.
    static func nextBlankStreak(prev: Int, outcome: SlotOutcomeId) -> Int {
        if isWin(outcome) { return 0 }
        return min(blankStreakMax, normalizeBlankStreak(prev) + 1)
    }

    // ══════════════════════════════════════════════════════════════════
    // 드럼 표시 (near-miss 는 표시 전용)
    // ══════════════════════════════════════════════════════════════════

    /// 꽝 중 near-miss 로 그릴 비율. 이 값은 **표시 비율**이다. 아무 값으로 바꿔도
    /// `rollOutcome` 의 분포·RTP·당첨률은 변하지 않는다 (테스트가 고정). 웹 `SLOT_NEAR_MISS_RATE`.
    static let nearMissRate = 0.3

    /// near-miss 배치. A 는 릴1·릴2 동일 + 릴3 다름 (서스펜스 유발), B 는 릴1·릴3
    /// 동일 + 릴2 다름 (릴1·릴2 가 다르니 서스펜스 없음, 그래도 "아깝다").
    /// 웹 `SLOT_NEAR_MISS_VARIANT_A_RATE`.
    static let nearMissVariantARate = 0.8

    /// 꽝 화면에 쓰는 룬. `blank` 룬 자체는 그리지 않는다.
    /// 웹 `BLANK_FACE_POOL` 과 순서까지 동일 (부분 셔플·가중 훑기가 순서에 의존).
    static let blankFacePool: [SlotSymbol] = [
        .coin, .coins, .gem, .shield, .cloth, .chest, .star,
    ]

    /// near-miss 에서 "맞은 두 개" 로 뽑힐 룬의 가중치. 고가치 룬(잭팟 보석·소실방지
    /// 천)에 무게를 둬 "아깝다" 를 키운다. 표시 가중치일 뿐, 실제 당첨 확률표
    /// (`outcomes`) 와는 아무 관계가 없다. 웹 `NEAR_MISS_MATCH_WEIGHT` (합 11).
    static let nearMissMatchWeight: [SlotSymbol: Int] = [
        .coin: 1, .coins: 1, .gem: 3, .shield: 1, .cloth: 3, .chest: 1, .star: 1,
    ]

    private static func pickWeightedSymbol<R: RandomSource>(rng: inout R) -> SlotSymbol {
        let entries = blankFacePool.map { ($0, nearMissMatchWeight[$0] ?? 0) }
        let total = entries.reduce(0) { $0 + $1.1 }
        var roll = rng.unit() * Double(total)
        for (s, w) in entries {
            roll -= Double(w)
            if roll < 0 { return s }
        }
        return entries[entries.count - 1].0
    }

    /// 이미 결정된 결과를 드럼 세 칸으로 옮긴다. **순수 함수** — `outcome` 을 읽기만
    /// 하고, 같은 난수열이면 같은 그림을 낸다. 결과를 바꾸는 코드는 한 줄도 없다.
    /// 웹 `renderSymbols`. 난수 소비 순서: [nearMiss 판정] → [match 가중 롤] →
    /// [miss 균등] → [variant]. 비-near-miss 꽝은 Fisher-Yates 3칸.
    ///
    ///  - 보상: 같은 룬 3개. 언제나. nearMiss = false.
    ///  - 꽝  : `nearMissRate` 비율로 near-miss (두 개 동일 + 하나 다름),
    ///          나머지는 서로 다른 룬 3개. 어느 쪽이든 3개가 모두 같아지는 일은 없어
    ///          화면이 결과와 모순될 수 없다.
    static func render<R: RandomSource>(
        _ outcome: SlotOutcomeId,
        rng: inout R
    ) -> SlotRender {
        let d = def(outcome)
        if d.id != .blank {
            return SlotRender(symbols: [d.symbol, d.symbol, d.symbol], nearMiss: false)
        }

        if rng.unit() < nearMissRate {
            let match = pickWeightedSymbol(rng: &rng)
            let others = blankFacePool.filter { $0 != match }
            let miss = others[min(others.count - 1, Int(rng.unit() * Double(others.count)))]
            let variantA = rng.unit() < nearMissVariantARate
            return SlotRender(
                symbols: variantA ? [match, match, miss] : [match, miss, match],
                nearMiss: true)
        }

        // Fisher-Yates 부분 셔플로 서로 다른 3개를 뽑는다. 웹과 인덱스 계산까지 동일.
        var pool = blankFacePool
        for i in 0..<3 {
            let span = pool.count - i
            let j = i + min(span - 1, Int(rng.unit() * Double(span)))
            pool.swapAt(i, j)
        }
        return SlotRender(symbols: [pool[0], pool[1], pool[2]], nearMiss: false)
    }

    /// `render` 의 튜플 편의형 — 세션 배선(`UpHeroSession.applySpinSlot`)이 쓰는 시그니처.
    /// near-miss 여부는 페이로드에 싣지 않고 UI 가 `isNearMiss` 로 되짚는다 (웹과 동일).
    static func renderSymbols<R: RandomSource>(
        _ outcome: SlotOutcomeId,
        rng: inout R
    ) -> (SlotSymbol, SlotSymbol, SlotSymbol) {
        let r = render(outcome, rng: &rng)
        return (r.symbols[0], r.symbols[1], r.symbols[2])
    }

    /// 그려진 세 룬이 near-miss 그림인가. 페이로드에는 `symbols` 만 실리므로 UI 는
    /// 이 함수로 되짚는다 (`render` 의 `nearMiss` 와 항상 일치). 웹 `isNearMiss`.
    static func isNearMiss(_ symbols: [SlotSymbol]) -> Bool {
        guard symbols.count == 3 else { return false }
        let (a, b, c) = (symbols[0], symbols[1], symbols[2])
        if a == b && b == c { return false }
        return (a == b && c != a) || (a == c && b != a)
    }

    // ══════════════════════════════════════════════════════════════════
    // 축하 티어
    // ══════════════════════════════════════════════════════════════════

    /// 결과 → 티어. 기준가(`value`)와 희소성으로 가른다. 웹 `SLOT_CELEBRATION_TIER`.
    ///  - big 은 700C 잭팟과 상점에서 살 수 없는 소실방지권(기준가 300).
    ///  - battleBuff 는 기준가 100 이라 small. 희소하지만(9‰) 체감 가치가 굴림 1회다.
    static let celebrationTier: [SlotOutcomeId: SlotTier] = [
        .blank: .none,
        .coinSmall: .small,
        .battleBuff: .small,
        .coinMid: .mid,
        .rankProtect: .mid,
        .itemBox: .mid,
        .coinJackpot: .big,
        .destroyProtect: .big,
    ]

    static func tier(_ id: SlotOutcomeId) -> SlotTier {
        celebrationTier[id] ?? .none
    }

    // ══════════════════════════════════════════════════════════════════
    // 릴 타이밍 (웹·iOS 공용 숫자)
    // ══════════════════════════════════════════════════════════════════

    /// 릴 3개의 기본 정지 시각(ms). 왼쪽부터 160ms 간격으로 서고 총 1.4s 다.
    /// 세 칸이 동시에 서면 "굴렸다" 는 감각이 안 산다. 웹 `REEL_BASE_STOP_MS`.
    static let reelBaseStopMs: [Int] = [1080, 1240, 1400]

    /// 릴1·릴2 가 같은 룬으로 서면 릴3 정지를 이만큼 늦춘다. 당첨이든 near-miss 든
    /// 같은 서스펜스다 — 결과는 롤 시점에 이미 확정돼 있고 연출은 결과를 바꾸지 않는다.
    /// 웹 `REEL_SUSPENSE_EXTRA_MS`.
    static let reelSuspenseExtraMs = 700

    /// 릴1·릴2 가 같은 룬인가 = 릴3 서스펜스 연장 여부. 웹 `hasReelSuspense`.
    static func hasReelSuspense(_ symbols: [SlotSymbol]) -> Bool {
        symbols.count >= 2 && symbols[0] == symbols[1]
    }

    /// 릴 정지 시각 [t1, t2, t3] (ms, 스핀 시작 기준). 순수 함수라 웹과 iOS 가 같은
    /// 숫자를 쓴다. 웹 `reelTimings`.
    ///
    ///   릴1·릴2 다름 : [1080, 1240, 1400]  총 1.4s
    ///   릴1·릴2 같음 : [1080, 1240, 2100]  총 2.1s (릴3 +700ms 서스펜스)
    static func reelTimings(_ symbols: [SlotSymbol]) -> [Int] {
        let t3 = reelBaseStopMs[2] + (hasReelSuspense(symbols) ? reelSuspenseExtraMs : 0)
        return [reelBaseStopMs[0], reelBaseStopMs[1], t3]
    }

    /// 서스펜스 구간(릴2 정지 → 릴3 정지) 의 틱 간격(ms). 60 → 160 으로 벌어지며
    /// 감속한다. 합계가 정확히 `reelSuspenseExtraMs` + 기본 간격(160) 이라 마지막
    /// 틱이 릴3 착지와 겹친다. 웹 `REEL_SUSPENSE_TICK_GAPS_MS`.
    static let reelSuspenseTickGapsMs: [Int] = [60, 60, 65, 75, 90, 110, 135, 160, 105]

    /// 서스펜스 틱 시각(ms, 스핀 시작 기준). 서스펜스가 아니면 빈 배열. 웹 `suspenseTickTimes`.
    static func suspenseTickTimes(_ symbols: [SlotSymbol]) -> [Int] {
        guard hasReelSuspense(symbols) else { return [] }
        var t = reelBaseStopMs[1]
        return reelSuspenseTickGapsMs.map { gap in
            t += gap
            return t
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // 회계 (확률 공개용)
    // ══════════════════════════════════════════════════════════════════

    /// 1회 굴림의 기대 회수액 (코인 환산). 웹 `slotExpectedValue`.
    static func expectedValue() -> Double {
        let total = outcomes.reduce(0) { $0 + $1.weight }
        let weighted = outcomes.reduce(0) { $0 + $1.weight * $1.value }
        return Double(weighted) / Double(total)
    }

    /// 환수율 (기대 회수액 / 비용). 0.9275 = 92.75%. 웹 `slotRtp`.
    static func rtp() -> Double {
        expectedValue() / Double(spinCost)
    }

    /// 보상이 나올 확률 (꽝이 아닐 확률). 0.51 = 51%. 웹 `slotWinRate`.
    static func winRate() -> Double {
        let total = outcomes.reduce(0) { $0 + $1.weight }
        let blank = outcomes.first { $0.id == .blank }?.weight ?? 0
        return Double(total - blank) / Double(total)
    }

    /// 결과별 확률 (0-1). 유저에게 확률을 공개하는 화면이 이 함수를 읽는다.
    /// 한국 확률형아이템 공개 의무는 코인 IAP 가 없어 대상 외지만, 공개하지 않을
    /// 이유도 없다 — 등급 소명 근거이기도 하다. 웹 `slotOdds`.
    static func odds() -> [SlotOutcomeId: Double] {
        let total = outcomes.reduce(0) { $0 + $1.weight }
        var out: [SlotOutcomeId: Double] = [:]
        for o in outcomes { out[o.id] = Double(o.weight) / Double(total) }
        return out
    }

    /// 확률 공개 UI 의 표 한 줄 — 결과 id, 확률, 그리고 라벨을 유도할 지급 내용.
    /// 웹 `SlotOddsRow`.
    struct OddsRow: Equatable {
        let id: SlotOutcomeId
        let probability: Double
        let grant: SlotGrant
    }

    /// 확률 공개 UI 가 그리는 표. `outcomes` 순서 그대로(꽝이 첫 줄)라 웹과 같은 순서로
    /// 렌더된다. 라벨은 `grant` 에서 유도하므로 결과 모달의 보상 문구와 어긋날 수 없다.
    /// 웹 `slotOddsRows`.
    static func oddsRows() -> [OddsRow] {
        let p = odds()
        return outcomes.map { OddsRow(id: $0.id, probability: p[$0.id] ?? 0, grant: grant($0.id)) }
    }

    /// 확률 표시 포맷 — 소수 둘째 자리까지, 끝의 0 은 떼고 `%` 를 붙인다
    /// (0.49 → "49%", 0.017 → "1.7%", 0.9275 → "92.75%"). 웹 `formatSlotPercent` 와
    /// 같은 문자열을 내야 두 플랫폼의 공개 확률이 글자 단위로 같다.
    static func formatPercent(_ p: Double) -> String {
        let pct = (p * 10000).rounded() / 100
        var s = String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), pct)
        if s.contains(".") {
            while s.hasSuffix("0") { s.removeLast() }
            if s.hasSuffix(".") { s.removeLast() }
        }
        return s + "%"
    }

    /// 아이템 상자에서 나올 등급을 굴리는 층 보정값. 웹 `slotItemBoxFloor`.
    /// 실제 등급/장비 생성은 기존 드롭 생성기가 한다 — 새 생성기를 만들지 않는다.
    static func itemBoxFloor(currentFloor: Int) -> Int {
        if case .itemBox(let bonus) = grant(.itemBox) {
            return currentFloor + bonus
        }
        return currentFloor
    }
}

// MARK: - 굴림틀 이벤트

/// 굴림틀 분기 이벤트 상수. 웹 `src/data/flavor/slot.ts` 1:1.
///
/// 별도 화면이 아니라 기존 `pickEvent` → 선택 패널 → `resolveChoice` 흐름에
/// 그대로 얹히는 이벤트다. 다른 이벤트와 다른 점은 딱 하나, 선택 결과를
/// 일반 결과 모달 대신 드럼 연출 모달이 받는다는 것.
enum UpHeroSlotEvent {

    /// prompt literal 은 `recentEventPrompts` LRU 의 키로도 쓰이므로 상수로 고정한다.
    /// `isSlotEvent` 가 이 값으로 판별한다. 웹과 **글자 단위로 같아야** LRU 가 일치한다.
    static let prompt =
        "무너진 사당 안쪽, 룬이 새겨진 드럼 세 개짜리 낡은 굴림틀이 아직 돌아간다."

    /// choice 이벤트가 떴을 때 그것이 굴림틀일 확률.
    ///
    /// tick 당 choice 확률이 0.25 이므로 실제로는 tick 의 약 3%. 풀 클리어 런
    /// (수백 tick) 에서 서너 번 마주치는 빈도라 `dailySpinCap` 3 과 대략 맞물린다.
    /// 더 흔해지면 "던전이 아니라 장치를 하러 들어가는" 게임이 된다.
    static let chance = 0.12

    /// 이 이벤트가 굴림틀인가. prompt literal 이 판별 키.
    static func isSlotEvent(_ prompt: String) -> Bool {
        prompt == Self.prompt
    }

    /// 굴림틀 선택지. 웹 `SLOT_EVENT` 와 라벨·키·효과가 1:1.
    ///
    /// "당긴다" 쪽은 `resultText` 를 일부러 비운다 — 비어 있으면 일반 결과 로그가
    /// push 되지 않고 `spinSlot` 효과가 드럼 결과 엔트리를 직접 push 한다.
    /// 결과 모달이 두 번 뜨는 것을 구조적으로 막는 장치다.
    static var event: DungeonEvent {
        DungeonEvent(
            prompt: prompt,
            promptKey: "uphero.slot.event.prompt",
            options: [
                ChoiceOption(
                    label: "코인 \(UpHeroSlot.spinCost) 을 넣고 손잡이를 당긴다",
                    labelKey: "uphero.slot.option.spin",
                    labelParams: ["cost": .number(Double(UpHeroSlot.spinCost))],
                    effect: .spinSlot(cost: UpHeroSlot.spinCost),
                    outcomes: nil,
                    resultText: nil,
                    resultTextKey: nil),
                ChoiceOption(
                    label: "손대지 않고 지나간다",
                    labelKey: "uphero.slot.option.skip",
                    labelParams: nil,
                    effect: .nothing,
                    outcomes: nil,
                    resultText: "먼지 앉은 손잡이를 뒤로 하고 걸음을 옮겼다.",
                    resultTextKey: "uphero.slot.result.skip"),
            ])
    }
}
