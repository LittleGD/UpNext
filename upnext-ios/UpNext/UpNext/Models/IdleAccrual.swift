//
//  IdleAccrual.swift
//  UpNext 로직 — 오프라인 수련 보상 (Idle accrual).
//
//  웹 src/lib/idleAccrual.ts를 1:1 포팅. 결정론적 — Phase 2.5 동치성 검증 대상.
//  앱을 닫은 사이 영웅이 "수련"했다 간주하고 XP/코인 일부 지급 (방치형 RPG promise).
//
//  Phase 2.3 (결정론적 알고리즘 Swift 포팅) 산출물.
//

import Foundation

/// 오프라인 수련 보상 결과. 웹 `IdleReward` interface.
struct IdleReward: Equatable {
    let xp: Int             // 지급 XP (round)
    let coins: Int          // 지급 코인 (round)
    let elapsedMin: Int     // 실제 반영된 경과 분 (cap 적용 후)
    let rawElapsedMin: Int  // 표기용 raw 경과 분 (cap 미적용)
}

enum IdleAccrual {

    static let xpPerMin = 0.5
    static let coinsPerMin = 0.3
    static let minElapsedMin = 5
    static let maxElapsedMin = 8 * 60       // 8시간 cap
    /// 시스템 시계 rewind 허용 여유 (ms) — NTP 조정/DST 등 합법적 소폭 후퇴 허용.
    static let clockRewindToleranceMs = 60_000

    /// 경과 시간이 유효한지 (= clock rewind가 아닌지) 검증. 웹 `detectClockRewind`.
    /// true면 idle reward grinding 의심 → 지급 skip.
    static func detectClockRewind(now: Int, lastSeenAt: Int?, lastIdleAt: Int) -> Bool {
        if let lastSeenAt, now < lastSeenAt - clockRewindToleranceMs {
            return true
        }
        if now < lastIdleAt - clockRewindToleranceMs {
            return true
        }
        return false
    }

    /// 경과 시간(ms) + 영웅 레벨 기반 누적 보상 계산. 웹 `calculateIdleReward`.
    /// 최소 5분 미만은 nil 반환 (지급 없음).
    static func calculateIdleReward(elapsedMs: Int, level: Int) -> IdleReward? {
        // 웹 Math.floor(elapsedMs / 60_000) — 양수 범위에서 Int 나눗셈이 floor와 동일.
        let rawMin = max(0, elapsedMs / 60_000)
        if rawMin < minElapsedMin { return nil }

        let capped = min(maxElapsedMin, rawMin)
        // level scale: Lv1=1.0, Lv10≈1.45, Lv30≈2.45, Lv50≈3.45.
        let levelMult = 1.0 + Double(max(0, level - 1)) / 20.0

        return IdleReward(
            xp: Int((Double(capped) * xpPerMin * levelMult).rounded()),
            coins: Int((Double(capped) * coinsPerMin * levelMult).rounded()),
            elapsedMin: capped,
            rawElapsedMin: rawMin
        )
    }

    /// "1시간 20분" 포맷 — 인앱 언어로 현지화. 웹 `formatElapsedI18n`(uphero.idle.elapsed.*).
    /// Int 보간은 %lld 포맷키로 카탈로그 매칭.
    static func formatElapsed(_ min: Int) -> String {
        if min < 60 { return AppConfig.loc("\(min)분") }
        let h = min / 60
        let m = min % 60
        if m == 0 { return AppConfig.loc("\(h)시간") }
        return AppConfig.loc("\(h)시간 \(m)분")
    }
}
