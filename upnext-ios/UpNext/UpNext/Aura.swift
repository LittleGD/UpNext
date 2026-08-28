//
//  Aura.swift
//  UpNext — 오늘의 기운 3종 리딩(재물·관계·건강). 웹 `src/lib/aura.ts` 1:1 포팅.
//
//  설계의 핵심: **점수는 실제 행동에서 나오되, 화면에는 수치를 드러내지 않는다.**
//  최근 14일의 완료·체크인·카테고리 분포가 점수를 만들지만, 유저가 보는 것은 점술의
//  언어다. "최근 14일 중 9일 불꽃을 켰어요" 같은 문장은 점집을 대시보드로 만든다.
//  데이터는 **어떤 문장을 보여줄지 고르는 데만** 쓴다(score → tier, 신호 → omen).
//
//  하루치 흔들림: 행동 신호만 쓰면 습관이 안정된 유저는 매일 같은 결과가 나온다.
//  그건 점이 아니라 통계표다. 그래서 (날짜 + 기기 salt + 기운) 해시로 ±12 를 더한다.
//  난수가 아니라 해시라 같은 날이면 값이 고정이고, 행동 신호가 여전히 지배적이다.
//
//  결정론: 같은 데이터 + 같은 날 + 같은 salt 면 항상 같은 결과. 난수를 쓰지 않는다.
//  점수는 첫 리딩을 여는 시점에 3종을 한꺼번에 스냅샷해 저장하므로, 그날 안에서
//  값이 흔들리지 않는다(오전에 본 재물기운이 오후에 달라지면 점이 아니라 대시보드다).
//
//  톤 규칙: 낮은 점수를 꾸짖지 않는다. tier 는 심판이 아니라 날씨다("잔잔"은 나쁨이 아니다).
//
//  웹과의 동치: 가중치·임계값·창 길이·카테고리 묶음·tier 경계(80/60/38)·흔들림 폭(±12)·
//  판정 순서를 그대로 옮겼다. blend 의 반올림도 JS `Math.round` 와 같다
//  (값이 음수가 아니라 `rounded()` 와 동일).
//

import Foundation

/// 관측 창 — 너무 짧으면 표본이 없고, 너무 길면 "요즘"이 아니게 된다. 웹 `AURA_WINDOW_DAYS`.
let auraWindowDays = 14

/// 기운 종류. 선언 순서 = 화면 순서 = 저장 순서(재물 → 관계 → 건강). 웹 `AURA_KINDS`.
enum AuraKind: String, Codable, CaseIterable, Hashable {
    case wealth
    case relationship
    case health
}

/// 오늘의 결. 심판이 아니라 날씨다.
enum AuraTier: String, Codable, Hashable {
    case great   // 대길
    case good    // 길
    case fair    // 평
    case care    // 잔잔
}

/// 조짐 — 어떤 신호가 이 점수를 만들었는지에 따라 고르는 **문장의 결**. 웹 `AuraOmen`.
/// 수치는 여기서 끝나고 화면으로 넘어가지 않는다. UI 는 이 값으로 문장만 고른다.
enum AuraOmen: String, Codable, Hashable {
    case closing    // 끝맺음이 잘 되는 흐름 (풀클리어)
    case gathering  // 한 방향으로 힘이 모임 (카테고리 집중)
    case rhythm     // 리듬이 몸에 뱄음 (체크인 규칙성)
    case carried    // 이어온 시간이 받쳐줌 (연속 기록)
    case resting    // 쉼이 다음을 준비함 (방패)
    case unformed   // 아직 흐름이 잡히기 전 (표본 적음)
}

/// 기운 하나의 리딩 결과. 웹 `AuraReading` 과 JSON 필드까지 동일하다.
struct AuraReading: Codable, Hashable {
    let kind: AuraKind
    /// 0~100. 실측 신호의 가중합 + 하루치 흔들림.
    /// **화면에 숫자로 노출하지 마라.** 등급(tier)과 조짐(omen)만 보여준다.
    /// 점수를 드러내면 유저가 역산하려 들고, 그 순간 점집이 성적표가 된다.
    let score: Int
    let tier: AuraTier
    let omen: AuraOmen
    /// 같은 조짐·등급 안에서 고를 표현 번호(0~2). 날짜 해시라 같은 날이면 고정이다.
    /// 구 스냅샷에는 없어 기본값 0 으로 디코드된다(하루짜리 값이라 마이그레이션 불필요).
    var variant: Int = 0
}

/// 3종 한 벌. 웹 `Record<AuraKind, AuraReading>` 과 같은 JSON 모양으로 직렬화된다.
struct AuraSnapshot: Codable, Hashable {
    let wealth: AuraReading
    let relationship: AuraReading
    let health: AuraReading

    subscript(kind: AuraKind) -> AuraReading {
        switch kind {
        case .wealth: return wealth
        case .relationship: return relationship
        case .health: return health
        }
    }
}

/// 알고리즘 입력 — 스토어에서 뽑아 온 원시 신호. 웹 `AuraInput`.
struct AuraInput {
    /// 완료 이력 (순서 무관 — 창 안인지만 본다)
    var history: [DayRecord]
    /// 체크인 날짜 목록
    var checkInDates: [String]
    /// 방패로 메운 날짜 목록
    var usedSaverDates: [String]
    /// 현재 불꽃 연속일수
    var streak: Int
    /// 2인 불꽃이 맺어져 있는지
    var duoActive: Bool
    /// 오늘 날짜 "YYYY-MM-DD"
    var today: String
    /// 기기 고정 salt(`Fortune.salt`). 하루치 흔들림 시드로 쓴다.
    /// 없으면 흔들림 0 으로 신호만 계산한다(테스트·검증용).
    var salt: String?
}

enum Aura {

    /// 관측 창 길이. 웹 `AURA_WINDOW_DAYS`.
    static let windowDays = auraWindowDays

    // MARK: - 카테고리 묶음 (웹과 동일)

    private static let wealthCats: [Category] = [.productivity, .learning]
    private static let relationCats: [Category] = [.social, .trending]
    private static let healthCats: [Category] = [.fitness, .nutrition, .wellness, .mindfulness]

    /// 카드 ID → 카테고리. 웹 `CARD_CATEGORY` Map 과 동일(중복 ID 는 뒤가 이긴다).
    private static let cardCategory: [String: Category] = Dictionary(
        CardCatalog.allCards.map { ($0.id, $0.category) },
        uniquingKeysWith: { _, last in last }
    )

    // MARK: - 공개 API

    /// 세 기운을 한 번에. 순서는 항상 재물 → 관계 → 건강.
    static func compute(_ input: AuraInput) -> AuraSnapshot {
        let w = summarize(input)
        return AuraSnapshot(
            wealth: wealth(w, input),
            relationship: relationship(w, input),
            health: health(w, input)
        )
    }

    // MARK: - 날짜 (타임존 비의존)

    /// "YYYY-MM-DD" 를 UTC 그레고리력 날짜로. 창 계산은 순수 일수 연산이라
    /// 기기 타임존에 따라 결과가 흔들리면 안 된다 — 계산 전용 달력을 따로 쓴다.
    private static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(secondsFromGMT: 0) ?? TimeZone.current
        c.locale = Locale(identifier: "en_US_POSIX")
        return c
    }()

    private static func date(fromDay day: String) -> Date? {
        let parts = day.split(separator: "-")
        guard parts.count == 3,
              let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]) else { return nil }
        return calendar.date(from: DateComponents(year: y, month: m, day: d))
    }

    private static func dayString(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    /// 오늘 포함 최근 n일의 날짜 집합. 웹 `daysBefore`.
    private static func daysBefore(_ today: String, _ n: Int) -> Set<String> {
        guard let base = date(fromDay: today) else { return [today] }
        var out = Set<String>()
        for i in 0..<n {
            if let d = calendar.date(byAdding: .day, value: -i, to: base) {
                out.insert(dayString(d))
            }
        }
        return out
    }

    // MARK: - 신호 합성 (웹과 같은 수식)

    /// 0~1 로 눌러 담기. 웹 `ratio`.
    private static func ratio(_ part: Int, _ whole: Int) -> Double {
        guard whole > 0 else { return 0 }
        let value: Double = Double(part) / Double(whole)
        return max(0, min(1, value))
    }

    /// 신호 여러 개를 가중 평균해 0~100 으로. 웹 `blend`.
    /// JS `Math.round` 와 동치 — 값이 항상 0 이상이라 `rounded()`(반올림, 0에서 멀어지는 쪽)와 같다.
    private static func blend(_ parts: [(value: Double, weight: Double)]) -> Int {
        var total: Double = 0
        var sum: Double = 0
        for p in parts {
            total += p.weight
            sum += p.value * p.weight
        }
        guard total > 0 else { return 0 }
        let scaled: Double = (sum / total) * 100
        return Int(scaled.rounded())
    }

    /// 하루치 흔들림 폭. 신호를 뒤집지 않을 만큼만 — tier 경계를 가끔 넘길 정도. 웹 `SWAY`.
    private static let sway = 12

    /// (날짜 + salt + 기운) 해시로 -sway...+sway 를 만든다. 웹 `dailySway`.
    /// 기운마다 다른 값이 나와야 셋이 함께 움직이는 기계적인 인상을 피한다.
    /// 해시는 `Fortune.fnv1a` 를 그대로 쓴다 — 웹 `fnv1a` 와 같은 함수라 값도 같다.
    private static func dailySway(_ today: String, _ salt: String?, _ kind: AuraKind) -> Int {
        guard let salt, !salt.isEmpty else { return 0 }
        let h = Fortune.fnv1a("sway:\(today):\(salt):\(kind.rawValue)")
        return Int(h % UInt32(sway * 2 + 1)) - sway
    }

    /// 조짐·조언 표현 가짓수. 웹 `AURA_VARIANTS`.
    static let auraVariants = 3

    /// 같은 조짐 안에서 오늘 쓸 표현 번호. 흔들림과 다른 접두사라 상관관계가 없다.
    /// 웹 `variantOf` 와 같은 해시·같은 결과.
    private static func variantOf(_ today: String, _ salt: String?, _ kind: AuraKind) -> Int {
        guard let salt, !salt.isEmpty else { return 0 }
        return Int(Fortune.fnv1a("phrase:\(today):\(salt):\(kind.rawValue)") % UInt32(auraVariants))
    }

    /// 0~100 으로 자르기. 웹 `clamp100`(입력이 이미 정수라 반올림은 항등).
    private static func clamp100(_ n: Int) -> Int {
        max(0, min(100, n))
    }

    /// tier 경계 80/60/38. 웹 `tierOf`.
    static func tier(of score: Int) -> AuraTier {
        if score >= 80 { return .great }
        if score >= 60 { return .good }
        if score >= 38 { return .fair }
        return .care
    }

    // MARK: - 관측 창 집계

    /// 창 안의 집계. 웹 `Window` interface.
    private struct Summary {
        var days: Int
        var activeDays: Int       // 카드를 하나라도 완료한 날
        var fullClearDays: Int
        var failedDays: Int
        var checkInDays: Int
        var saverDays: Int
        var byCategory: [Category: Int]
        var totalCompleted: Int
    }

    private static func summarize(_ input: AuraInput) -> Summary {
        let win = daysBefore(input.today, windowDays)
        var byCategory: [Category: Int] = [:]
        for c in Category.allCases { byCategory[c] = 0 }

        var activeDays = 0
        var fullClearDays = 0
        var failedDays = 0
        var totalCompleted = 0

        for rec in input.history where win.contains(rec.date) {
            let done = rec.completedCardIds
            if !done.isEmpty { activeDays += 1 }
            if rec.wasFullClear { fullClearDays += 1 }
            if rec.wasFailed == true { failedDays += 1 }
            totalCompleted += done.count
            for id in done {
                if let cat = cardCategory[id] {
                    byCategory[cat, default: 0] += 1
                }
            }
        }

        return Summary(
            days: windowDays,
            activeDays: activeDays,
            fullClearDays: fullClearDays,
            failedDays: failedDays,
            checkInDays: input.checkInDates.filter { win.contains($0) }.count,
            saverDays: input.usedSaverDates.filter { win.contains($0) }.count,
            byCategory: byCategory,
            totalCompleted: totalCompleted
        )
    }

    private static func sumCats(_ w: Summary, _ cats: [Category]) -> Int {
        cats.reduce(0) { $0 + (w.byCategory[$1] ?? 0) }
    }

    // MARK: - 세 기운

    /// 재물기운 — 쌓는 힘. 꾸준함과 마무리에서 나온다.
    /// 신호: 풀클리어 비율(약속을 끝까지 지킨 날), 생산성·학습 카드 비중, 연속 기록.
    private static func wealth(_ w: Summary, _ input: AuraInput) -> AuraReading {
        let focus = sumCats(w, wealthCats)
        let base = blend([
            (value: ratio(w.fullClearDays, w.days), weight: 3),
            (value: ratio(focus, max(4, w.totalCompleted)), weight: 2),
            (value: ratio(input.streak, 10), weight: 1),
        ])
        let score = clamp100(base + dailySway(input.today, input.salt, .wealth))
        var omen: AuraOmen = .unformed
        if w.totalCompleted == 0 { omen = .unformed }
        else if w.fullClearDays >= 3 { omen = .closing }
        else if focus >= 3 { omen = .gathering }
        else if input.streak >= 3 { omen = .carried }
        return AuraReading(kind: .wealth, score: score, tier: tier(of: score), omen: omen,
                           variant: variantOf(input.today, input.salt, .wealth))
    }

    /// 관계기운 — 잇는 힘. 소통 카드와 2인 불꽃에서 나온다.
    /// 표본이 적은 카테고리라 기준을 낮게 잡는다(소통 카드는 매일 나오지 않는다).
    private static func relationship(_ w: Summary, _ input: AuraInput) -> AuraReading {
        let focus = sumCats(w, relationCats)
        let base = blend([
            (value: ratio(focus, 5), weight: 3),
            (value: input.duoActive ? 1 : 0, weight: 2),
            (value: ratio(w.activeDays, w.days), weight: 1),
        ])
        let score = clamp100(base + dailySway(input.today, input.salt, .relationship))
        var omen: AuraOmen = .unformed
        if focus >= 2 { omen = .gathering }
        else if w.activeDays >= 5 { omen = .rhythm }
        return AuraReading(kind: .relationship, score: score, tier: tier(of: score), omen: omen,
                           variant: variantOf(input.today, input.salt, .relationship))
    }

    /// 건강기운 — 지키는 힘. 몸 카드와 체크인 규칙성에서 나온다.
    /// 방패로 쉬어간 날은 감점하지 않는다. 쉬는 것도 관리다(원칙: 낮은 점수로 꾸짖지 않는다).
    /// 다만 실패일(무리했거나 놓친 날)은 약하게 감점한다.
    private static func health(_ w: Summary, _ input: AuraInput) -> AuraReading {
        let focus = sumCats(w, healthCats)
        let penalty: Double = ratio(w.failedDays, w.days) * 0.5
        let base = blend([
            (value: ratio(focus, 8), weight: 3),
            (value: ratio(w.checkInDays, w.days), weight: 3),
            (value: max(0, 1 - penalty), weight: 1),
        ])
        let score = clamp100(base + dailySway(input.today, input.salt, .health))
        var omen: AuraOmen = .unformed
        if w.checkInDays >= 7 { omen = .rhythm }
        else if focus >= 3 { omen = .gathering }
        else if w.saverDays > 0 { omen = .resting }
        return AuraReading(kind: .health, score: score, tier: tier(of: score), omen: omen,
                           variant: variantOf(input.today, input.salt, .health))
    }
}

// MARK: - 저장 (UserDefaults "upnext_fortune" 확장)

/// 오늘 기준 기운 상태. 웹 `AuraState`.
struct AuraState {
    /// 오늘 이미 연 기운. 광고 없이 다시 볼 수 있다.
    var opened: [AuraKind]
    /// 오늘 고정된 3종 리딩. 아직 첫 리딩을 열지 않았으면 nil.
    var snapshot: AuraSnapshot?

    static let empty = AuraState(opened: [], snapshot: nil)

    var allOpened: Bool { opened.count >= AuraKind.allCases.count }
}

/// 기운 열람 기록/스냅샷 저장소.
///
/// 웹 localStorage `"upnext_fortune"` 과 **같은 키·같은 JSON 모양**을 쓴다
/// (salt / revealedDate / auraDate / auraOpened / auraSnapshot).
/// Fortune.swift 가 이미 그 키에 salt·revealedDate 를 쓰고 있으므로, 여기서는
/// 구조체로 통째로 덮어쓰지 않고 **JSON 딕셔너리 수준에서 병합**한다.
/// 통째로 인코딩하면 서로의 필드를 지우게 된다.
///
/// auraDate 가 오늘이 아니면 열람 기록과 스냅샷을 통째로 버린다. 날짜 비교를
/// `state(today:)` 한 곳으로 좁혀, 자정을 넘긴 어제 값이 오늘 화면에 섞이는 경로를 없앤다.
enum AuraStore {

    private static let defaultsKey = "upnext_fortune"

    // MARK: 원시 JSON 입출력

    private static func readRaw() -> [String: Any] {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            return [:]
        }
        return obj
    }

    private static func writeRaw(_ raw: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(raw),
              let data = try? JSONSerialization.data(withJSONObject: raw) else { return }
        UserDefaults.standard.set(data, forKey: defaultsKey)
        // 저장 실패는 치명적이지 않다 — 다음 방문에 광고를 한 번 더 보게 될 뿐.
    }

    // MARK: 관용 디코드

    /// 저장 순서가 UI 순서를 흔들지 않게 AuraKind 선언 순서로 정규화한다.
    private static func decodeOpened(_ value: Any?) -> [AuraKind] {
        guard let raw = value as? [String] else { return [] }
        let set = Set(raw.compactMap { AuraKind(rawValue: $0) })
        return AuraKind.allCases.filter { set.contains($0) }
    }

    /// 3종이 모두 온전할 때만 스냅샷으로 인정한다 — 반쪽 스냅샷은 없느니만 못하다.
    /// (AuraSnapshot 은 세 필드가 모두 필수라 디코드 자체가 그 검증이다.)
    private static func decodeSnapshot(_ value: Any?) -> AuraSnapshot? {
        guard let obj = value,
              JSONSerialization.isValidJSONObject(obj),
              let data = try? JSONSerialization.data(withJSONObject: obj) else { return nil }
        return try? JSONDecoder().decode(AuraSnapshot.self, from: data)
    }

    private static func encodeSnapshot(_ snapshot: AuraSnapshot) -> [String: Any]? {
        guard let data = try? JSONEncoder().encode(snapshot),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            return nil
        }
        return obj
    }

    // MARK: 공개 API

    /// 오늘 기준 기운 상태 읽기. 날짜가 넘어갔으면 빈 상태를 돌려준다.
    static func state(today: String) -> AuraState {
        let raw = readRaw()
        guard let date = raw["auraDate"] as? String, date == today else { return .empty }
        return AuraState(opened: decodeOpened(raw["auraOpened"]),
                         snapshot: decodeSnapshot(raw["auraSnapshot"]))
    }

    /// 첫 리딩을 여는 순간 3종을 한꺼번에 고정한다.
    /// 이미 오늘 스냅샷이 있으면 덮어쓰지 않는다 — 하루 안에서 점수는 불변이다.
    /// - Returns: 실제로 오늘 유효한 스냅샷 (기존 것이 있으면 그것)
    @discardableResult
    static func ensureSnapshot(today: String, compute: () -> AuraSnapshot) -> AuraSnapshot {
        let current = state(today: today)
        if let snapshot = current.snapshot { return snapshot }

        let snapshot = compute()
        var raw = readRaw()
        raw["auraDate"] = today
        // 날짜가 넘어왔다면 어제 열람 기록은 여기서 함께 버려진다.
        if current.opened.isEmpty {
            raw.removeValue(forKey: "auraOpened")
        } else {
            raw["auraOpened"] = current.opened.map(\.rawValue)
        }
        if let encoded = encodeSnapshot(snapshot) {
            raw["auraSnapshot"] = encoded
        } else {
            raw.removeValue(forKey: "auraSnapshot")
        }
        writeRaw(raw)
        return snapshot
    }

    /// 기운 하나를 연 것으로 기록. 이미 있으면 그대로 둔다.
    /// - Returns: 기록 후의 열람 목록 (AuraKind 선언 순서)
    @discardableResult
    static func markOpened(today: String, kind: AuraKind) -> [AuraKind] {
        let current = state(today: today)
        if current.opened.contains(kind) { return current.opened }

        let next = AuraKind.allCases.filter { $0 == kind || current.opened.contains($0) }
        var raw = readRaw()
        raw["auraDate"] = today
        raw["auraOpened"] = next.map(\.rawValue)
        // 스냅샷 없이 열람만 기록되는 경로는 없어야 하지만, 만에 하나 그렇게 되면
        // 다음 ensureSnapshot 이 채운다 (auraDate 는 여기서 이미 오늘로 맞춘다).
        // 없을 때 **지우는 것**이 핵심이다 — auraDate 를 오늘로 올리면서 어제 스냅샷을
        // 남겨두면 그 값이 오늘 것으로 승격된다(웹 markAuraOpened 는 undefined 로 버린다).
        if let snapshot = current.snapshot, let encoded = encodeSnapshot(snapshot) {
            raw["auraSnapshot"] = encoded
        } else {
            raw.removeValue(forKey: "auraSnapshot")
        }
        writeRaw(raw)
        return next
    }
}
