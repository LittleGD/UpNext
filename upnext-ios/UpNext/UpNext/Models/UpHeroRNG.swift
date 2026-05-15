//
//  UpHeroRNG.swift
//  UpNext 로직 — 결정론적 PRNG (mulberry32).
//
//  웹 src/lib/upHeroRng.ts를 비트 단위로 1:1 포팅.
//  Up Hero 전투의 모든 확률 분기가 이 RNG를 통과 → 같은 seed면 같은 전투 재현.
//  Phase 2.5 동치성 검증의 핵심 (같은 seed → 웹과 Swift가 동일 수열).
//
//  JS Math.imul / >>> / |0 을 Swift UInt32 wrapping 연산(&+, &*, >>)으로 정확 환산:
//   - JS 32-bit 정수 연산 ≡ Swift UInt32 wrapping
//   - JS `t >>> n` (unsigned shift) ≡ Swift UInt32 `t >> n`
//   - JS `Math.imul(a,b)` (32-bit 곱) ≡ Swift `a &* b`
//
//  Phase 2.3 (결정론적 알고리즘 Swift 포팅) 산출물.
//

import Foundation

/// 게임 로직이 쓰는 난수 소스 — [0, 1) 실수를 제공. 웹 `rng()` 대응.
protocol RandomSource {
    /// [0, 1) 범위 균등 분포 난수. 웹 rng()와 동일 시맨틱.
    mutating func unit() -> Double
}

/// mulberry32 결정론 PRNG. 웹 `createRng(seed)`와 비트 단위 동일.
/// 32-bit state, 주기 2^32. seed 0은 degenerate라 golden ratio로 정규화.
struct Mulberry32: RandomSource {
    private var state: UInt32

    init(seed: Int) {
        // 웹 `(seed | 0) || 0x9e3779b9` — 32-bit 절단 후 0이면 golden ratio.
        let s = UInt32(truncatingIfNeeded: seed)
        state = (s == 0) ? 0x9e3779b9 : s
    }

    mutating func unit() -> Double {
        // 웹 createRng 클로저 본문과 1:1.
        state = state &+ 0x6d2b79f5
        var t = state
        t = (t ^ (t >> 15)) &* (t | 1)
        t = t ^ (t &+ ((t ^ (t >> 7)) &* (t | 61)))
        return Double(t ^ (t >> 14)) / 4294967296.0
    }
}

/// 시스템 난수 소스 — 프로덕션 기본값. 웹 `Math.random` 경로 대응.
struct SystemRandom: RandomSource {
    mutating func unit() -> Double {
        Double.random(in: 0..<1)
    }
}

// MARK: - RandomSource 공용 헬퍼

extension RandomSource {
    /// [0, n) 정수. 웹 `Math.floor(rng() * n)` 패턴 대응.
    mutating func int(below n: Int) -> Int {
        guard n > 0 else { return 0 }
        return min(n - 1, Int(unit() * Double(n)))
    }

    /// 확률 p로 true. 웹 `rng() < p` 패턴 대응.
    mutating func chance(_ p: Double) -> Bool {
        unit() < p
    }

    /// 배열에서 균등 랜덤 1개. 비었으면 nil.
    mutating func pick<T>(_ array: [T]) -> T? {
        guard !array.isEmpty else { return nil }
        return array[int(below: array.count)]
    }
}
