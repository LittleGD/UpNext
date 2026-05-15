// idle.swift — IdleAccrual 오프라인 보상 동치성 검증 (Swift 측).
// 컴파일: swiftc IdleAccrual.swift idle.swift  ↔  scripts/idle-check.mjs

import Foundation

let cases: [(Int, Int)] = [
    (4 * 60000, 1), (10 * 60000, 1), (60 * 60000, 10),
    (600 * 60000, 50), (5 * 60000, 1), (480 * 60000, 30),
]
for (ms, lv) in cases {
    if let r = IdleAccrual.calculateIdleReward(elapsedMs: ms, level: lv) {
        print("reward(\(ms),\(lv)): xp=\(r.xp) coins=\(r.coins) el=\(r.elapsedMin) raw=\(r.rawElapsedMin)")
    } else {
        print("reward(\(ms),\(lv)): nil")
    }
}
let rewinds: [(Int, Int?, Int)] = [
    (1000, 100000, 500), (1000, nil, 100000), (100000, 100030, 100000), (1000, 1030, 900),
]
for (now, seen, idle) in rewinds {
    let seenLabel = seen.map(String.init) ?? "undefined"
    let rewound = IdleAccrual.detectClockRewind(now: now, lastSeenAt: seen, lastIdleAt: idle)
    print("rewind(\(now),\(seenLabel),\(idle)): \(rewound)")
}
