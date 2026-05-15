// rng.swift — Mulberry32 PRNG 동치성 검증 (Swift 측).
// 컴파일: swiftc UpHeroRNG.swift rng.swift  ↔  scripts/rng-check.mjs

import Foundation

for seed in [12345, 1, 0, 999999] {
    var rng = Mulberry32(seed: seed)
    let vals = (0..<5).map { _ in String(format: "%.15f", rng.unit()) }
    print("seed \(seed): \(vals.joined(separator: " "))")
}
