// gamerules.swift — XP 커브 / 레벨 / 칭호 동치성 검증 (Swift 측).
// 컴파일: swiftc Card.swift Game.swift GameRules.swift gamerules.swift
//         ↔  scripts/gamerules-check.mjs

import Foundation

for lv in [0, 1, 2, 5, 10, 20] {
    print("totalXP(\(lv))=\(GameRules.totalXPForLevel(lv)) toNext(\(lv))=\(GameRules.xpToNextLevel(lv))")
}
for xp in [0, 99, 100, 500, 3000, 99999] {
    print("levelFromXP(\(xp))=\(GameRules.levelFromXP(xp))")
}
for (xp, lv) in [(0, 0), (150, 1), (3000, 8)] {
    let p = GameRules.xpProgress(totalXP: xp, level: lv)
    print("xpProgress(\(xp),\(lv))=cur\(p.current)/need\(p.needed)")
}
for lv in [0, 1, 3, 5, 8, 12, 13, 99] {
    print("title(\(lv))=\(GameRules.titleForLevel(lv, lang: .en))")
}
