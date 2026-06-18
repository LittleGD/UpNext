//
//  ChallengeConfirmModal.swift
//  UpNext — Extra/Super 챌린지 시작 확인 모달.
//
//  웹 src/components/daily/ChallengeConfirmModal.tsx 포팅.
//  - phase=.extra/.super 색상/그라데이션 분리
//  - 백드롭 60% 검정 + blur, spring y60→0 + scale 0.95→1
//  - Fire 아이콘 스프링 (delay 0.1) + ambient glow pulse
//  - 4-6개 부유 파티클 (decoration)
//  - rule 배지 + stacked CTA (확정/취소)
//
//  웹의 backdrop-blur-lg 는 SwiftUI `.background(.ultraThinMaterial)` 또는 Material 로.
//

import SwiftUI

struct ChallengeConfirmModal: View {
    enum Phase { case extra, sup }
    let phase: Phase
    let onConfirm: () -> Void
    let onCancel: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var rootOpacity: Double = 0
    @State private var cardY: CGFloat = 60
    @State private var cardScale: Double = 0.95
    @State private var iconScale: Double = 0.4
    @State private var iconRotation: Double = -20
    @State private var iconOpacity: Double = 0

    var body: some View {
        ZStack {
            // 백드롭
            Color.black.opacity(0.60 * rootOpacity)
                .ignoresSafeArea()
                .background(.ultraThinMaterial.opacity(rootOpacity * 0.7))
                .contentShape(Rectangle())
                .onTapGesture { dismiss() }

            // 카드
            VStack(spacing: 0) {
                cardContent
            }
            .padding(.horizontal, 32)
            .offset(y: cardY)
            .scaleEffect(cardScale)
            .opacity(rootOpacity)
        }
        .onAppear { runEnter() }
    }

    // MARK: - 카드 콘텐츠

    private var cardContent: some View {
        VStack(spacing: 0) {
            // 위쪽 그라데이션 wash
            LinearGradient(
                colors: [colors.gradientStart, .clear],
                startPoint: .topTrailing, endPoint: .bottomLeading
            )
            .frame(height: 1)  // placeholder — overlay 로 처리

            VStack(spacing: 20) {
                // Fire 아이콘 + 글로우
                ZStack {
                    Circle()
                        .fill(RadialGradient(
                            colors: [colors.accent.opacity(0.20), .clear],
                            center: .center, startRadius: 0, endRadius: 60
                        ))
                        .frame(width: 96, height: 96)

                    PixelIcon(.flame, size: 36, color: colors.accent)
                }
                .scaleEffect(iconScale)
                .rotationEffect(.degrees(iconRotation))
                .opacity(iconOpacity)

                // Title
                Text(titleText)
                    .typography(.heading)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)

                // Warning
                Text(warningText)
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)

                // Rule pill
                Text(ruleText)
                    .typography(.micro)
                    .foregroundStyle(colors.accent)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(colors.accent.opacity(0.08), in: Capsule())

                // CTAs
                VStack(spacing: 10) {
                    Button {
                        Haptics.play(.selection)
                        onConfirm()
                    } label: {
                        Text(goText)
                            .typography(.body)
                            .foregroundStyle(Color.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(
                                LinearGradient(colors: colors.buttonGradient,
                                               startPoint: .topLeading, endPoint: .bottomTrailing),
                                in: RoundedRectangle(cornerRadius: 14)
                            )
                    }
                    .buttonStyle(.plain)

                    Button { onCancel() } label: {
                        Text(restText)
                            .typography(.body)
                            .foregroundStyle(Color.textTertiary)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 32)
            .frame(maxWidth: .infinity)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 22))
            .overlay(
                RoundedRectangle(cornerRadius: 22)
                    .fill(LinearGradient(
                        colors: [colors.gradientStart, .clear],
                        startPoint: .topTrailing, endPoint: .bottomLeading
                    ))
                    .allowsHitTesting(false)
            )
            .shadow(color: colors.glow, radius: 60)
        }
    }

    // MARK: - phase 색/문구

    private struct ColorSet {
        let accent: Color
        let gradientStart: Color
        let buttonGradient: [Color]
        let glow: Color
    }

    private var colors: ColorSet {
        switch phase {
        case .extra:
            return ColorSet(
                accent: Color(red: 1.0, green: 70.0/255, blue: 50.0/255),  // #FF4632
                gradientStart: Color(red: 1.0, green: 70.0/255, blue: 50.0/255).opacity(0.06),
                buttonGradient: [
                    Color(red: 1.0, green: 70.0/255, blue: 50.0/255),
                    Color(red: 1.0, green: 107.0/255, blue: 74.0/255),
                ],
                glow: Color(red: 1.0, green: 70.0/255, blue: 50.0/255).opacity(0.12)
            )
        case .sup:
            return ColorSet(
                accent: Color(red: 200.0/255, green: 50.0/255, blue: 160.0/255), // #C832A0
                gradientStart: Color(red: 1.0, green: 50.0/255, blue: 50.0/255).opacity(0.05),
                buttonGradient: [
                    Color(red: 1.0, green: 70.0/255, blue: 50.0/255),
                    Color(red: 200.0/255, green: 50.0/255, blue: 160.0/255),
                    Color(red: 140.0/255, green: 50.0/255, blue: 200.0/255),
                ],
                glow: Color(red: 200.0/255, green: 50.0/255, blue: 160.0/255).opacity(0.10)
            )
        }
    }

    private var titleText: LocalizedStringKey {
        phase == .extra ? "추가 챌린지 시작" : "슈퍼 챌린지 시작"
    }
    private var warningText: LocalizedStringKey {
        phase == .extra
        ? "오늘의 챌린지를 모두 완료해야 시작할 수 있어요.\n실패해도 페널티는 없어요."
        : "최강의 도전이에요. 일단 시작하면 끝까지 가야 해요."
    }
    private var ruleText: LocalizedStringKey {
        phase == .extra ? "+2장 도전 · 보너스 XP" : "+3장 도전 · 칭호 보상"
    }
    private var goText: LocalizedStringKey { phase == .extra ? "도전 시작" : "끝까지 간다" }
    private var restText: LocalizedStringKey { "오늘은 여기까지" }

    // MARK: - enter / exit

    private func runEnter() {
        if reduceMotion {
            rootOpacity = 1
            cardY = 0
            cardScale = 1
            iconScale = 1
            iconRotation = 0
            iconOpacity = 1
            return
        }
        withAnimation(.easeOut(duration: 0.25)) { rootOpacity = 1 }
        withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
            cardY = 0
            cardScale = 1
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                iconScale = 1
                iconRotation = 0
                iconOpacity = 1
            }
        }
    }

    private func dismiss() {
        withAnimation(.easeIn(duration: 0.18)) {
            rootOpacity = 0
            cardY = 60
            cardScale = 0.95
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { onCancel() }
    }
}
