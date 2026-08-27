//
//  Fortune.swift
//  UpNext — 오늘의 기운 (웹 src/lib/fortune.ts 1:1 포팅).
//
//  설계 원칙(웹과 동일):
//   - **운세가 아니라 렌즈**. 결과를 단정하지 않는다. 하늘이 아니라 유저 자신의
//     덱(= 지금까지의 노력)에서 카드를 뽑는다.
//   - **생년월일 등 개인정보를 일절 받지 않는다.** 시드는 날짜 + 기기 로컬 salt 뿐.
//   - **결정론적**. 같은 날 같은 기기면 다시 열어도 결과가 같다(가챠화 차단).
//
//  웹/iOS 결과 동치: FNV-1a 해시를 UInt32 오버플로 연산으로 JS `Math.imul` 과 같게
//  구현하고, 카드 풀은 Cards.json(= 웹 ALL_CARDS 추출본)의 원본 순서를 그대로 쓴다.
//  같은 날 같은 salt 면 웹과 iOS 가 같은 카드·색·문구·명언을 낸다.
//

import Foundation

/// 오늘의 기운 한 벌. 색·문구·명언이 모두 카드 카테고리 풀에서 나와 넷이 한 주제로 묶인다.
struct DailyFortune {
    /// 오늘의 카드 — 유저가 해금한 카드 중에서만 뽑는다
    let card: ChallengeCard
    let color: FortuneColor
    /// 오늘의 문구 [ko, en, ja, zh]
    let phrase: [String]
    /// 오늘의 명언 [ko, en, ja, zh] — QuotePool 재사용
    let quote: [String]
}

enum Fortune {

    /// FNV-1a 32bit. QuotePool.simpleHash 보다 분산이 좋아 서로 다른 접두사로 파생 시드를
    /// 만들 때 상관관계가 낮다(색·문구·명언이 함께 몰리지 않는다).
    /// 웹 `Math.imul(h, 0x01000193) >>> 0` 와 동치 — UInt32 오버플로 곱셈(&*)으로 하위 32비트만.
    /// 문자 단위는 JS `charCodeAt`(UTF-16 코드 유닛)에 맞춰 `utf16` 을 순회한다.
    static func fnv1a(_ input: String) -> UInt32 {
        var h: UInt32 = 0x811c9dc5
        for u in input.utf16 {
            h ^= UInt32(u)
            h = h &* 0x01000193
        }
        return h
    }

    /// 오늘의 기운 계산. 순수 함수 — 저장소를 건드리지 않는다.
    ///
    /// - Parameters:
    ///   - dateKey: "YYYY-MM-DD" (GameStore.todayString())
    ///   - salt: 기기별 고정 salt. 같은 날 유저마다 다른 카드가 나오게 한다.
    ///   - unlockedCardIds: 해금된 카드 ID 목록
    /// - Returns: 해금 카드가 하나도 없으면 nil (온보딩 직후 방어)
    static func compute(dateKey: String, salt: String, unlockedCardIds: [String]) -> DailyFortune? {
        let unlocked = Set(unlockedCardIds)
        let pool = CardCatalog.allCards.filter { unlocked.contains($0.id) }
        guard !pool.isEmpty else { return nil }

        let base = "\(dateKey)|\(salt)"
        let card = pool[Int(fnv1a("card:\(base)") % UInt32(pool.count))]

        // 색·문구·명언 시드에 card.id 를 섞는다 — 같은 날이라도 카드가 바뀌면 나머지 셋도
        // 함께 바뀌어 "이 카드에 붙은 조합" 이라는 인상이 강해진다.
        let colors = FortunePool.colors[card.category.rawValue] ?? []
        let phrases = FortunePool.phrases[card.category.rawValue] ?? []
        let quotes = QuotePool.pool[card.category.rawValue] ?? []
        guard !colors.isEmpty, !phrases.isEmpty, !quotes.isEmpty else { return nil }

        return DailyFortune(
            card: card,
            color: colors[Int(fnv1a("color:\(base):\(card.id)") % UInt32(colors.count))],
            phrase: phrases[Int(fnv1a("phrase:\(base):\(card.id)") % UInt32(phrases.count))],
            quote: quotes[Int(fnv1a("quote:\(base):\(card.id)") % UInt32(quotes.count))]
        )
    }

    // MARK: - 로컬 상태 (salt + 공개 여부)

    /* 클라우드 동기화하지 않는다. 오늘의 기운은 그날 하루만 의미가 있고, 기기별로 달라도
       문제가 되지 않는 가벼운 상태다. 웹 localStorage "upnext_fortune" 대응. */

    private static let defaultsKey = "upnext_fortune"

    private struct StoredState: Codable {
        /// 기기 고정 salt — 최초 1회 생성 후 불변
        var salt: String
        /// 오늘의 기운을 이미 공개한 날짜. 같은 날 재방문 시 광고를 다시 보지 않는다.
        var revealedDate: String?
    }

    private static func read() -> StoredState {
        if let data = UserDefaults.standard.data(forKey: defaultsKey),
           let stored = try? JSONDecoder().decode(StoredState.self, from: data),
           !stored.salt.isEmpty {
            return stored
        }
        // 디코드 실패/최초 실행 — 새 salt 로 시작
        let fresh = StoredState(salt: UUID().uuidString, revealedDate: nil)
        write(fresh)
        return fresh
    }

    private static func write(_ state: StoredState) {
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: defaultsKey)
        }
        // 저장 실패는 치명적이지 않다 — 다음 방문에 광고를 한 번 더 보게 될 뿐
    }

    /// 기기 고정 salt. 없으면 만들어 저장한다.
    static var salt: String { read().salt }

    /// 오늘 이미 공개했는지
    static func isRevealed(today: String) -> Bool {
        read().revealedDate == today
    }

    /// 공개 처리 (광고 시청 완료 후 호출)
    static func markRevealed(today: String) {
        var state = read()
        state.revealedDate = today
        write(state)
    }
}
