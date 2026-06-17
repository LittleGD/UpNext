//
//  CampTutorialOverlay.swift
//  UpNext — 아지트 첫 진입 온보딩 오버레이.
//
//  웹 components/uphero/CampTutorialOverlay.tsx 포팅. hasSeenCampTutorial=false 일 때
//  아지트 홈 첫 진입 시 1회 노출되는 5-step 캐러셀:
//    welcome → name(이름 입력) → stat → expedition → shop/gear
//  Skip / Prev / Next / Start 모든 경로가 markCampTutorialSeen() 후 onClose.
//  backdrop 탭은 의도적으로 "기억 안 함" 닫기를 막는다(실수 방지) — Skip 으로만 종료.
//
//  디자인 규칙 준수 — 아이콘 박스 금지(픽셀 아이콘만), 카드/버튼 보더 금지(채움으로 표현).
//

import SwiftUI

struct CampTutorialOverlay: View {
    let onClose: () -> Void

    @EnvironmentObject private var upHero: UpHeroStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var idx = 0
    @State private var entered = false
    @State private var nameDraft = ""
    @FocusState private var nameFocused: Bool

    private struct Step {
        let kind: Kind
        let icon: PixelIconName
        let title: String
        let body: String
        enum Kind { case info, name }
    }

    private let steps: [Step] = [
        Step(kind: .info, icon: .treePine,
             title: "아지트에 오신 것을 환영합니다",
             body: "여기는 영웅의 집이에요. 탐험 준비를 하고, 장비를 정돈하고, 코인을 관리하는 공간입니다."),
        Step(kind: .name, icon: .penSquare,
             title: "영웅의 이름을 지어주세요",
             body: "원하는 이름을 입력하세요. 비워두면 추천 이름이 그대로 사용돼요."),
        Step(kind: .info, icon: .user,
             title: "영웅을 탭해 스탯 확인",
             body: "중앙의 영웅 스프라이트를 탭하면 스탯과 스킬, 장비를 한눈에 볼 수 있어요."),
        Step(kind: .info, icon: .sword,
             title: "탐험 시작",
             body: "탐험권으로 던전에 입장하세요. 6장 카드 중 몇 장을 뽑아 버프를 걸고 챌린지를 진행합니다."),
        Step(kind: .info, icon: .shoppingBag,
             title: "상점과 장비",
             body: "던전에서 번 코인으로 상점에서 탐험권과 카드를 사고, 장비를 착용해 영웅을 강하게 만드세요."),
    ]

    private var step: Step { steps[idx] }
    private var isFirst: Bool { idx == 0 }
    private var isLast: Bool { idx == steps.count - 1 }

    var body: some View {
        ZStack {
            Color.black.opacity(0.9 * (entered ? 1 : 0)).ignoresSafeArea()

            card
                .frame(maxWidth: 360)
                .padding(.horizontal, 24)
                .scaleEffect(entered ? 1 : 0.96)
                .opacity(entered ? 1 : 0)
        }
        .onAppear {
            nameDraft = ""
            withAnimation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.85)) {
                entered = true
            }
        }
    }

    private var card: some View {
        VStack(spacing: 0) {
            stepDots.padding(.top, 24)

            // 아이콘 — 박스 없이 픽셀 아이콘만(디자인 규칙).
            PixelIcon(step.icon, size: 40, color: Color.accentPrimary)
                .frame(height: 56)
                .padding(.top, 18)

            Text(step.title)
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.top, 12)
                .padding(.horizontal, 8)

            Text(step.body)
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
                .padding(.horizontal, 8)

            if step.kind == .name {
                TextField(upHero.state.hero.name, text: $nameDraft)
                    .typography(.body)
                    .foregroundStyle(Color.bgPrimary)
                    .multilineTextAlignment(.center)
                    .focused($nameFocused)
                    .submitLabel(isLast ? .done : .next)
                    .onSubmit { advance() }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Color.accentPrimary.opacity(0.9), in: RoundedRectangle(cornerRadius: 8))
                    .frame(maxWidth: 240)
                    .padding(.top, 16)
            }

            Text("\(idx + 1) / \(steps.count)")
                .typography(.micro)
                .monospacedDigit()
                .foregroundStyle(Color.textTertiary)
                .padding(.top, 16)

            controls.padding(.top, 16)
        }
        .padding(.horizontal, 22)
        .padding(.bottom, 20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 18))
    }

    private var stepDots: some View {
        HStack(spacing: 6) {
            ForEach(steps.indices, id: \.self) { i in
                Capsule()
                    .fill(i == idx ? Color.accentPrimary : Color.textTertiary.opacity(0.4))
                    .frame(width: i == idx ? 20 : 6, height: 6)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: idx)
            }
        }
    }

    private var controls: some View {
        HStack(spacing: 8) {
            if isFirst {
                tutorialButton("건너뛰기", filled: false) { finish() }
            } else {
                tutorialButton("이전", filled: false) { goTo(idx - 1) }
            }
            tutorialButton(isLast ? "시작하기" : "다음", filled: true) { advance() }
        }
    }

    private func tutorialButton(_ label: String, filled: Bool,
                                action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .typography(.caption)
                .foregroundStyle(filled ? Color.bgPrimary : Color.textSecondary)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(filled ? Color.accentPrimary : Color.bgElevated,
                            in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    // MARK: - 흐름

    private func advance() {
        SoundPlayer.shared.play(.select)
        if isLast { finish() } else { goTo(idx + 1) }
    }

    private func goTo(_ next: Int) {
        if step.kind == .name { commitName() }
        if nameFocused { nameFocused = false }
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
            idx = max(0, min(steps.count - 1, next))
        }
    }

    private func commitName() {
        let trimmed = String(nameDraft.trimmingCharacters(in: .whitespacesAndNewlines).prefix(16))
        if !trimmed.isEmpty { upHero.renameHero(trimmed) }
    }

    private func finish() {
        if step.kind == .name { commitName() }
        if nameFocused { nameFocused = false }
        upHero.markCampTutorialSeen()
        Haptics.play(.selection)
        withAnimation(reduceMotion ? nil : .easeIn(duration: 0.18)) { entered = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { onClose() }
    }
}
