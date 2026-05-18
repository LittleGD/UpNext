//
//  Color+Tokens.swift
//  UpNext 디자인 시스템 — 컬러 토큰.
//
//  웹 src/app/globals.css의 :root CSS 변수를 1:1 포팅.
//  Target Membership: UpNext ✅ + UpNextWidgetExtension ✅ (디자인 토큰은 양쪽 공유)
//
//  원본 대응:
//   - 웹의 `var(--bg-primary)` → Swift `Color.bgPrimary`
//   - 토큰 추가/변경 시 globals.css와 이 파일을 함께 갱신 (단일 진실의 원천 유지)
//
//  Phase 1.1 (디자인 시스템 Swift 포팅) 산출물.
//

import SwiftUI

// MARK: - Hex 초기화 헬퍼

extension Color {
    /// 0xRRGGBB 형태 16진수로 Color 생성. SwiftUI 기본 Color엔 hex init이 없어 직접 정의.
    /// - Parameters:
    ///   - hex: 0xRRGGBB (예: 0x0A0A0A)
    ///   - alpha: 불투명도 0.0~1.0 (기본 1.0)
    init(hex: UInt32, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue:  Double(hex & 0xFF) / 255.0,
            opacity: alpha
        )
    }

    /// "#RRGGBB" 또는 "RRGGBB" 16진 문자열로 Color 생성. 데이터에 문자열로 박힌
    /// hex (Up Hero 던전 themeColor 등)용. 파싱 실패 시 중립 회색 fallback.
    init(hexString: String) {
        let raw = hexString.hasPrefix("#") ? String(hexString.dropFirst()) : hexString
        if raw.count == 6, let value = UInt32(raw, radix: 16) {
            self.init(hex: value)
        } else {
            self.init(hex: 0x808080)
        }
    }
}

// MARK: - 디자인 토큰

extension Color {

    // ─── 배경 (globals.css: --bg-*) ───
    static let bgPrimary  = Color(hex: 0x0A0A0A)
    static let bgSurface  = Color(hex: 0x141414)
    static let bgElevated = Color(hex: 0x1E1E1E)
    static let bgHover    = Color(hex: 0x282828)

    // ─── 액센트 — Citric + Tangerine + Aquamarine (--accent-*) ───
    static let accentPrimary   = Color(hex: 0xCDF564)  // 라임 (메인)
    static let accentSecondary = Color(hex: 0xFF4632)  // 탠저린 레드
    static let accentCyan      = Color(hex: 0x9BF0E1)  // 아쿠아마린
    static let accentBlue      = Color(hex: 0x4100F5)
    static let accentFushia    = Color(hex: 0xF037A5)

    // ─── 텍스트 — WCAG AA(4.5:1) 대비 확보 (--text-*) ───
    static let textPrimary   = Color(hex: 0xF0F0F0)  // 17:1
    static let textSecondary = Color(hex: 0x9A9A9A)  // 8.5:1
    static let textTertiary  = Color(hex: 0x6B6B6B)  // 4.7:1

    // ─── 카드 등급 (--rarity-*) ───
    static let rarityNormal = Color(hex: 0x808080)
    static let rarityRare   = Color(hex: 0x9BF0E1)
    static let rarityUnique = Color(hex: 0xF037A5)
    static let rarityLegend = Color(hex: 0xCDF564)

    // ─── Backdrop 3단 (--backdrop-*) — 모달 뒤 어둡기 ───
    static let backdropModal     = Color(hex: 0x000000, alpha: 0.6)   // 가벼운 정보 모달
    static let backdropDialog    = Color(hex: 0x000000, alpha: 0.7)   // 카드/상세 디테일
    static let backdropImmersive = Color(hex: 0x000000, alpha: 0.85)  // 풀스크린 몰입

    // ─── 미니게임 — skill / curse / heart (--color-*) ───
    static let colorSkill        = Color(hex: 0x9BF0E1)
    static let colorSkillStrong  = Color(hex: 0x5ED1BA)
    static let colorCurse        = Color(hex: 0xF037A5)
    static let colorCurseStrong  = Color(hex: 0xA8226F)
    static let colorHeartActive  = Color(hex: 0xF037A5)
    static let colorHeartEmpty   = Color(hex: 0x3A3A3A)

    // ─── 미니게임 — 신호등 시그널 (--signal-*) ───
    static let signalGo         = Color(hex: 0x7BC47F)  // 초록 = GO
    static let signalReady      = Color(hex: 0xE5C454)  // 노랑 = 준비
    static let signalStop       = Color(hex: 0xC44A4A)  // 빨강 = 대기
    static let signalStopStrong = Color(hex: 0xE85A5A)  // 빨강 밝은 변종 (4.93:1)

    // ─── 미니게임 — surface 상태 스펙트럼 (--surface-minigame-*) ───
    static let surfaceMinigameIdle    = Color(hex: 0x87B87A, alpha: 0.20)
    static let surfaceMinigameHover   = Color(hex: 0x87B87A, alpha: 0.28)
    static let surfaceMinigameActive  = Color(hex: 0xCDF564, alpha: 0.20)
    static let surfaceMinigameSuccess = Color(hex: 0xCDF564, alpha: 0.33)
    static let surfaceMinigameFail    = Color(hex: 0x5A2A2A)

    // ─── 폴라로이드 — 종이 / 잉크 팔레트 (--paper-*, --ink-*) ───
    static let paperCream       = Color(hex: 0xF9F8F5)  // MemoEditor 뒷면 바탕
    static let paperLine        = Color(hex: 0xD4C9B8)  // 라인 노트 guide
    static let paperPlaceholder = Color(hex: 0xA09080)  // placeholder
    static let inkWarmText      = Color(hex: 0x2A2A2A)  // 메모 본문
    static let inkWarmBlack     = Color(hex: 0x16120E, alpha: 0.92)
    static let inkRed           = Color(hex: 0xDC2626, alpha: 0.92)
    static let inkBlue          = Color(hex: 0x1E40AF, alpha: 0.92)
    static let inkGreen         = Color(hex: 0x059669, alpha: 0.92)
    static let inkPurple        = Color(hex: 0x7C3AED, alpha: 0.92)

    // ─── 오류 / 경고 공용 (--color-error-*) ───
    static let colorError       = Color(hex: 0xD84343)
    static let colorErrorStrong = Color(hex: 0xC42929)

    // ─── 기타 surface (--surface-tooltip) ───
    static let surfaceTooltip = Color(hex: 0x000000, alpha: 0.75)
}
