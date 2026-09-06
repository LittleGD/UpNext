//
//  GbConfirm.swift
//  UpNext — GB 팔레트 확인 다이얼로그 (05-modal-design).
//
//  웹 src/components/uphero/GbConfirm.tsx 1:1 이식. 흰색 iOS 시스템 .alert/
//  .confirmationDialog 가 Up Hero 풀스크린 세계관의 몰입을 깨던 문제를 해결 —
//  다크 GB 팔레트 커스텀 다이얼로그로 통일한다(웹 Phase 9a 와 동일 이유).
//
//  치수는 웹 GbConfirm 수치 그대로:
//   - 카드: max-w-xs(320) · rounded-md(6) · bg GB.darkest · border 1px confirmColor
//   - 백드롭: GB.darkest @ alpha 0xe0(≈0.878) 단색 스크림 (웹처럼 블러 아님 →
//     OverlayContainer(.ultraThinMaterial) 재사용 안 함)
//   - 헤더: px16/pt16/pb8 · 하단 divider 1px GB.dark · PixelIcon 16 + typo-body 제목
//   - 바디(옵션): px16/py12 · typo-caption · GB.light
//   - 푸터: px12/py12 · 상단 divider 1px GB.dark · 버튼 gap 8
//   - confirmColor = danger ? GB_ENEMY(#e88b7a) : GB.lightest(#cdf564)
//  애니메이션: 카드 scale 0.96→1 + fade, 백드롭 fade — Anim.easeOut(0.2)(웹 EASE_OUT).
//  reduceMotion 이면 즉시 표시(웹 prefers-reduced-motion: reduce 대응).
//
//  접근성: 카드 .accessibilityElement(children:.contain) + .isModal(포커스 스코프),
//  제목 .isHeader. 웹 useModalA11y(Tab 트랩)의 SwiftUI 직접 대응은 없으나 VoiceOver
//  스코프는 .isModal 로 보정.
//
//  구조: 재사용 표준형(확인/취소)은 convenience init, DailyHomeView 처럼 커스텀 푸터가
//  필요한 곳은 footer 빌더 init 을 쓴다. 붙이는 쪽은 ChallengeConfirmModal 처럼
//  `.overlay { if ... { GbConfirm(...) } }` 패턴.
//

import SwiftUI

// MARK: - 버튼 스타일

/// GbConfirm 푸터 버튼 — 웹 .gb-confirm-btn.
/// minHeight 44 · padding 10/14 · radius 4 · press scale 0.97(EASE_OUT 120ms) ·
/// disabled opacity 0.5. primary 는 confirmColor 채움 + darkest 텍스트 + semibold(웹 600),
/// secondary 는 투명 배경 + 지정 색 텍스트/보더.
struct GbConfirmButtonStyle: ButtonStyle {
    var fg: Color
    var bg: Color
    var border: Color
    var bold: Bool = false
    /// 세로 스택 푸터(DailyHomeView)에서 버튼을 가로 꽉 채울지.
    var fullWidth: Bool = false

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .typography(.caption)
            .fontWeight(bold ? .semibold : .regular)   // 웹 fontWeight 600 / 400
            .foregroundStyle(fg)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .frame(minHeight: 44)                        // 웹 minHeight:44
            .padding(.horizontal, 14).padding(.vertical, 10)  // 웹 padding:"10px 14px"
            .background(bg, in: RoundedRectangle(cornerRadius: 4))  // 웹 rounded(4)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(border, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 4))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)       // 웹 :active scale(0.97)
            .opacity(isEnabled ? 1 : 0.5)                          // disabled opacity 0.5
            .animation(Anim.easeOut(0.12), value: configuration.isPressed)
    }
}

// MARK: - 표준 확인/취소 푸터 (웹 GbConfirm 기본형)

/// 웹 footer — 취소(secondary) + 확인(primary, confirmColor 채움) 가로 정렬.
struct GbConfirmStandardFooter: View {
    let confirmLabel: LocalizedStringKey
    let cancelLabel: LocalizedStringKey
    let tint: Color
    var showCancel: Bool = true
    let onConfirm: () -> Void
    let onCancel: () -> Void

    var body: some View {
        HStack(spacing: 8) {                       // 웹 gap-2 justify-end
            Spacer(minLength: 0)
            if showCancel {
                Button(cancelLabel) { onCancel() }
                    .buttonStyle(GbConfirmButtonStyle(
                        fg: GBPalette.light, bg: .clear, border: GBPalette.light))
            }
            Button(confirmLabel) { onConfirm() }
                .buttonStyle(GbConfirmButtonStyle(
                    fg: GBPalette.darkest, bg: tint, border: tint, bold: true))
        }
    }
}

// MARK: - 섹션 패널 (웹 GbConfirmPanel)

/// Phase 5-B — 확인 다이얼로그 안의 섹션 패널. 배경 단계(어두운 dark → active 면
/// dark 원색)와 라임 글로우로 "걸림" 을 말한다. 보더는 쓰지 않는다 — 카드/버튼
/// 보더 금지 규칙. `trailing` 은 헤더 오른쪽 칩(보유 개수 등) 자리다.
/// 웹 GbConfirm.tsx `GbConfirmPanel` 1:1 (radius 6 · padding 8/10 · glow 10px 44).
struct GbConfirmPanel<Trailing: View, Content: View>: View {
    let active: Bool
    let title: String
    @ViewBuilder let trailing: () -> Trailing
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Text(title)
                    .typography(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(active ? GBPalette.lightest : GBPalette.light)
                Spacer(minLength: 0)
                trailing()
            }
            content()
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            active ? GBPalette.dark : GBPalette.dark.opacity(0.53),
            in: RoundedRectangle(cornerRadius: 6))
        .shadow(color: active ? GBPalette.lightest.opacity(0.27) : .clear, radius: 5)
        .animation(Anim.easeOut(0.16), value: active)
    }
}

// MARK: - GbConfirm

struct GbConfirm<Footer: View>: View {
    let title: LocalizedStringKey
    var message: LocalizedStringKey? = nil
    /// 줄마다 색이 다른 바디(강화 확인의 소실/하락 경고 등). 주면 `message` 대신 이걸 그린다.
    /// 웹은 같은 자리를 `<span style={{ color }}>` 로 칠한다 — LocalizedStringKey 로는 못 하는 표현.
    var messageText: Text? = nil
    var danger: Bool = false
    /// 백드롭 탭 시 호출(웹: backdrop self-click = onCancel). nil 이면 탭 무시.
    var onBackdropTap: (() -> Void)? = nil
    /// confirmColor 를 인자로 받아 버튼 색을 카드와 통일하는 푸터 빌더.
    @ViewBuilder let footer: (Color) -> Footer

    @State private var mounted = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 커스텀 푸터용 primary init.
    init(
        title: LocalizedStringKey,
        message: LocalizedStringKey? = nil,
        messageText: Text? = nil,
        danger: Bool = false,
        onBackdropTap: (() -> Void)? = nil,
        @ViewBuilder footer: @escaping (Color) -> Footer
    ) {
        self.title = title
        self.message = message
        self.messageText = messageText
        self.danger = danger
        self.onBackdropTap = onBackdropTap
        self.footer = footer
    }

    /// confirmColor — 웹 GbConfirm.tsx:79.
    private var confirmColor: Color { danger ? GBPalette.enemy : GBPalette.lightest }

    var body: some View {
        ZStack {
            // 백드롭 — 단색 스크림(#0a1f0a @ 0.878), 탭 = 취소.
            GBPalette.darkest.opacity(0.878)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { onBackdropTap?() }
                .opacity(mounted ? 1 : 0)          // 백드롭 fade
            card
                .scaleEffect(mounted ? 1 : 0.96)   // 카드 scale 0.96→1
                .opacity(mounted ? 1 : 0)
        }
        .onAppear {
            if reduceMotion { mounted = true; return }
            withAnimation(Anim.easeOut(0.2)) { mounted = true }
        }
    }

    private var card: some View {
        VStack(spacing: 0) {
            // Header — 아이콘 + 제목, 하단 divider.
            HStack(alignment: .top, spacing: 8) {
                PixelIcon(danger ? .warningDiamond : .infoBox, size: 16, color: confirmColor)
                    .padding(.top, 2)
                Text(title)
                    .typography(.body)
                    .foregroundStyle(GBPalette.lightest)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 8)
            .overlay(alignment: .bottom) {
                Rectangle().fill(GBPalette.dark).frame(height: 1)
            }

            // Body (옵션) — 경고/비용/결과 예측. messageText 가 있으면 그쪽이 우선이다.
            if let body = messageText ?? message.map({ Text($0) }) {
                body
                    .typography(.caption)
                    .foregroundStyle(GBPalette.light)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 16).padding(.vertical, 12)
            }

            // Footer — 상단 divider + 버튼.
            footer(confirmColor)
                .padding(.horizontal, 12).padding(.vertical, 12)
                .overlay(alignment: .top) {
                    Rectangle().fill(GBPalette.dark).frame(height: 1)
                }
        }
        .frame(maxWidth: 320)                        // 웹 max-w-xs
        .background(GBPalette.darkest, in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(confirmColor, lineWidth: 1))
        .padding(.horizontal, 16)                    // 웹 백드롭 p-4
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }
}

// MARK: - 표준 확인/취소 convenience

extension GbConfirm where Footer == GbConfirmStandardFooter {
    /// 표준 확인/취소 다이얼로그(웹 GbConfirm 기본형).
    /// showCancel:false 면 단일 확인 버튼(정보/에러용 — 웹엔 없는 iOS 자유 설계).
    init(
        title: LocalizedStringKey,
        message: LocalizedStringKey? = nil,
        confirmLabel: LocalizedStringKey = "확인",
        cancelLabel: LocalizedStringKey = "취소",
        danger: Bool = false,
        showCancel: Bool = true,
        onConfirm: @escaping () -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.init(
            title: title,
            message: message,
            danger: danger,
            onBackdropTap: onCancel          // 백드롭 탭 = 취소(단일버튼 info 도 dismiss)
        ) { tint in
            GbConfirmStandardFooter(
                confirmLabel: confirmLabel,
                cancelLabel: cancelLabel,
                tint: tint,
                showCancel: showCancel,
                onConfirm: onConfirm,
                onCancel: onCancel)
        }
    }
}
