//
//  UNButtonStyle.swift
//  UpNext 디자인 시스템 — 공용 버튼 스타일 세트 (조사 리포트 13-button-system).
//
//  배경: iOS 전 화면이 primary/secondary/ghost/destructive 를 각자 인라인으로 재구현해
//  높이(40/44/46/48/50/52/56)·radius(4/8/12/14/16)·press 피드백·disabled 처리가 제각각.
//  웹의 de-facto 규약(디자인 토큰 + `.press-affordance` scale-0.97 + `disabled:opacity-50`)이
//  SwiftUI ButtonStyle 로 코드화되지 않아 발생. 이 파일이 그 단일 출처.
//
//  웹 매핑:
//   - PRIMARY  (AppDescription.tsx:156)   bg-accent + text-bg-primary + rounded + py-4
//   - SECONDARY(bgSurface 채움 텍스트 버튼)
//   - GHOST    (ChallengeConfirmModal.tsx:209) 채움 없음 + text-tertiary → active:text-secondary
//   - DESTRUCTIVE(ChallengeConfirmModal.tsx:195) linear-gradient(#FF4632,#FF6B4A) + active:brightness-90
//   - 공통 PRESS(globals.css:285) transform:scale(0.97) 150ms cubic-bezier(0.23,1,0.32,1)
//     prefers-reduced-motion 시 transform none.
//
//  확정 파라미터(사용자 결정 — 스펙의 taste 질문에 대한 답):
//   - cornerRadius 12 통일(웹 토큰 8 아님). 세그먼트/토글(Capsule)은 이 시스템 범위 밖.
//   - press scale 0.97 · easeGB(timingCurve 0.23,1,0.32,1) 0.15s · reduceMotion 시 scale 생략.
//   - disabled opacity 0.5 (현 iOS 0.3 교정) · primary/secondary/destructive 높이 52 · ghost 48.
//   - 듀오/소셜 맥락은 accentCyan — `tint:` 오버라이드로 variant 색만 바꿔 사용(솔로=라임/듀오=시안).
//
//  높이는 `.frame(height:)` 가 아니라 `.frame(minHeight:)` — 라틴 디센더/멀티라인이 잘리지
//  않도록(리포트 15-font-clipping 와 같은 철학). 단일 줄 라벨은 정확히 52/48 로 렌더.
//

import SwiftUI

// MARK: - Variant

/// 공용 버튼 4종. 각 variant 가 채움/텍스트/높이를 고정하고, 호출부는 variant 만 지정.
enum UNButtonVariant {
    /// accentPrimary 채움 + bgPrimary 텍스트. 메인 CTA(팩 열기·계속·확인·탐험 시작 등).
    case primary
    /// bgSurface 채움 + textPrimary 텍스트. 보조 액션(취소·뒤로 등). muted 텍스트는 `tint:` 로.
    case secondary
    /// 채움 없음 + textTertiary → pressed textSecondary. 최소 강조(그만두기·나중에 등).
    case ghost
    /// #FF4632→#FF6B4A 그라디언트 + white 텍스트 + pressed brightness. 파괴적/경고 CTA.
    case destructive
}

// MARK: - 표준 버튼 스타일

/// 웹 variant 체계를 SwiftUI ButtonStyle 로 매핑한 공용 스타일.
///  - `tint`: variant 의 대표색 오버라이드.
///    · primary/destructive → **채움색**(예: 듀오 `.un(.primary, tint: .accentCyan)`)
///    · secondary/ghost → **텍스트색**(예: muted 취소 `.un(.secondary, tint: .textSecondary)`)
///  - `fullWidth`: 컨테이너 폭을 꽉 채울지(기본 true). false 면 내용 폭 + 가로 패딩.
struct UNButtonStyle: ButtonStyle {
    var variant: UNButtonVariant = .primary
    var tint: Color? = nil
    var fullWidth: Bool = true

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // 확정 파라미터 상수.
    static let cornerRadius: CGFloat = 12
    private static let heightPrimary: CGFloat = 52
    private static let heightGhost: CGFloat = 48
    private static let pressScale: CGFloat = 0.97
    private static let disabledOpacity: CGFloat = 0.5
    /// destructive 그라디언트 — 웹 linear-gradient(135deg, #FF4632, #FF6B4A).
    static let destructiveGradient = LinearGradient(
        colors: [Color(hex: 0xFF4632), Color(hex: 0xFF6B4A)],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let radius = Self.cornerRadius
        return configuration.label
            .typography(.body)
            .foregroundStyle(foreground(pressed: pressed))
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .frame(minHeight: minHeight)
            .padding(.horizontal, fullWidth ? 0 : 20)
            .background(background)
            .contentShape(RoundedRectangle(cornerRadius: radius))
            // destructive 는 웹 active:brightness-90 대응(눌림 시 살짝 어둡게).
            .brightness(variant == .destructive && pressed ? -0.08 : 0)
            .scaleEffect((pressed && !reduceMotion) ? Self.pressScale : 1)
            .opacity(isEnabled ? 1 : Self.disabledOpacity)
            .animation(reduceMotion ? nil : Anim.easeOut(0.15), value: pressed)
    }

    private var minHeight: CGFloat {
        variant == .ghost ? Self.heightGhost : Self.heightPrimary
    }

    private func foreground(pressed: Bool) -> Color {
        switch variant {
        case .primary:     return .bgPrimary
        case .secondary:   return tint ?? .textPrimary
        case .ghost:       return pressed ? (tint ?? .textSecondary) : (tint ?? .textTertiary)
        case .destructive: return .white
        }
    }

    @ViewBuilder
    private var background: some View {
        let shape = RoundedRectangle(cornerRadius: Self.cornerRadius)
        switch variant {
        case .primary:     shape.fill(tint ?? .accentPrimary)
        case .secondary:   shape.fill(Color.bgSurface)
        case .ghost:       Color.clear
        case .destructive: shape.fill(Self.destructiveGradient)
        }
    }
}

// MARK: - press 전용 스타일 (웹 .press-affordance)

/// 채움/높이/텍스트를 건드리지 않고 **공통 press 어포던스(scale 0.97)만** 얹는 스타일.
/// 커스텀 레이아웃(아이콘·보더·그라디언트·게임 아트 등 variant 로 흡수하면 안 되는 버튼)에
/// 웹 전역 규약(`.press-affordance` = active:scale-0.97, reduced-motion 시 none)만 부여한다.
/// disabled 시각(opacity/채움)은 각 버튼이 이미 자체 처리(예: 조건부 채움)하므로 건드리지
/// 않는다 — 그래야 기존 중복 press 스타일(HeroTapStyle·DungeonPressStyle: scale 전용)을
/// 시각 변화 없이 그대로 흡수한다.
struct UNPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        return configuration.label
            .scaleEffect((pressed && !reduceMotion) ? 0.97 : 1)
            .animation(reduceMotion ? nil : Anim.easeOut(0.15), value: pressed)
    }
}

// MARK: - 정적 편의 생성자 (.buttonStyle(.un(.primary)))

extension ButtonStyle where Self == UNButtonStyle {
    /// `Button { … }.buttonStyle(.un(.primary))` 형태.
    static func un(_ variant: UNButtonVariant,
                   tint: Color? = nil,
                   fullWidth: Bool = true) -> UNButtonStyle {
        UNButtonStyle(variant: variant, tint: tint, fullWidth: fullWidth)
    }
}

extension ButtonStyle where Self == UNPressStyle {
    /// press 어포던스만 얹는 `.buttonStyle(.unPress)`.
    static var unPress: UNPressStyle { UNPressStyle() }
}

// MARK: - 텍스트 CTA 편의 래퍼

/// 라벨 텍스트 하나짜리 표준 버튼. 화면마다 복붙되던 primary 헬퍼
/// (OnboardingPrimaryButton·DailyHome.primaryButton)의 단일 대체.
/// title 은 이미 로컬라이즈된 런타임 문자열(`AppConfig.loc(…)`)을 그대로 렌더 — verbatim.
struct UNButton: View {
    let title: String
    var variant: UNButtonVariant = .primary
    var tint: Color? = nil
    var fullWidth: Bool = true
    var enabled: Bool = true
    let action: () -> Void

    init(_ title: String,
         variant: UNButtonVariant = .primary,
         tint: Color? = nil,
         fullWidth: Bool = true,
         enabled: Bool = true,
         action: @escaping () -> Void) {
        self.title = title
        self.variant = variant
        self.tint = tint
        self.fullWidth = fullWidth
        self.enabled = enabled
        self.action = action
    }

    var body: some View {
        Button(action: action) { Text(title) }
            .buttonStyle(.un(variant, tint: tint, fullWidth: fullWidth))
            .disabled(!enabled)
    }
}
