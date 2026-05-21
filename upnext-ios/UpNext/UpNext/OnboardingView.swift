//
//  OnboardingView.swift
//  UpNext — 신규 유저 온보딩 흐름 (Phase 4 슬라이스 5).
//
//  웹 components/onboarding/OnboardingFlow.tsx 의 4단계 흐름을 SwiftUI 로 포팅:
//   intro(앱 소개) → difficulty(난이도) → starterPack(스타터 팩) → levelUp(레벨 1)
//
//  store.phase == .onboarding 일 때 ContentView 라우터가 띄운다. 마지막 단계의
//  finishOnboarding() 이 progress 를 확정하고 클라우드 업로드 → phase 가 .ready 로
//  바뀌면 라우터가 자동으로 메인 앱으로 넘어간다.
//
//  하단 바: 좌측 아이콘 백버튼 + 우측 진행 버튼 (intro 는 첫 단계라 백버튼 없음).
//  웹 SplashScreen 미포팅(iOS 런치 스크린이 대체), AppDescription(405줄)은 핵심
//  메시지로 압축, LevelUpScreen 파티클 연출 단순화 — 흐름 완결, 연출은 디자인 패스.
//

import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var store: GameStore
    @State private var step: Step = .intro

    private enum Step: Int, CaseIterable {
        case intro, difficulty, starterPack, levelUp
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.bgPrimary.ignoresSafeArea()

            Group {
                switch step {
                case .intro:
                    OnboardingIntro { goTo(.difficulty) }
                case .difficulty:
                    OnboardingDifficulty(onBack: { goTo(.intro) }) { mode in
                        store.setMode(mode)
                        goTo(.starterPack)
                    }
                case .starterPack:
                    OnboardingStarterPack(onBack: { goTo(.difficulty) }) { packId in
                        store.selectStarterPack(packId)
                        goTo(.levelUp)
                    }
                case .levelUp:
                    OnboardingLevelUp(onBack: { goTo(.starterPack) }) {
                        store.finishOnboarding()
                    }
                }
            }

            if step != .intro {
                stepIndicator
            }
        }
    }

    private func goTo(_ next: Step) {
        withAnimation(.easeInOut(duration: 0.2)) { step = next }
    }

    private var stepIndicator: some View {
        HStack(spacing: 6) {
            ForEach(Step.allCases, id: \.self) { s in
                Capsule()
                    .fill(s.rawValue <= step.rawValue ? Color.accentPrimary : Color.bgElevated)
                    .frame(width: 28, height: 4)
            }
        }
        .padding(.top, 14)
    }
}

// MARK: - 1. 앱 소개

private struct OnboardingIntro: View {
    let onNext: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 28) {
                Image("Wordmark")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 56)
                    .foregroundStyle(Color.accentPrimary)
                VStack(alignment: .leading, spacing: 18) {
                    point("매일 챌린지 카드를 뽑아요",
                          "덱에서 카드 6장이 펼쳐지면, 오늘 실천할 카드를 골라요")
                    point("작은 습관이 쌓여요",
                          "운동·학습·마음챙김 — 카드 한 장이 하루의 작은 목표")
                    point("갓생이 게임이 돼요",
                          "스트릭·레벨·카드 수집으로 꾸준함에 보상이 따라와요")
                }
            }
            Spacer()
            // 첫 단계 — 백버튼 없음
            OnboardingBottomBar(title: "시작하기", action: onNext)
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func point(_ title: String, _ desc: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).typography(.body).foregroundStyle(Color.textPrimary)
            Text(desc).typography(.caption).foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - 2. 난이도 선택

private struct OnboardingDifficulty: View {
    let onBack: () -> Void
    let onSelect: (GameMode) -> Void
    @State private var selected: GameMode?

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("난이도를 골라주세요")
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text("하루에 수행할 카드 수예요 — 설정에서 언제든 바꿀 수 있어요")
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 56)

            Spacer()

            VStack(spacing: 10) {
                ForEach(GameMode.allCases, id: \.self) { mode in
                    modeCard(mode)
                }
            }

            Spacer()

            OnboardingBottomBar(onBack: onBack, title: "다음", enabled: selected != nil) {
                if let selected { onSelect(selected) }
            }
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func modeCard(_ mode: GameMode) -> some View {
        let isSel = selected == mode
        return Button {
            selected = mode
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(label(mode))
                        .typography(.heading)
                        .foregroundStyle(isSel ? Color.bgPrimary : Color.textPrimary)
                    Text(desc(mode))
                        .typography(.caption)
                        .foregroundStyle(isSel ? Color.bgPrimary.opacity(0.7) : Color.textTertiary)
                }
                Spacer()
                Text("\(mode.cardCount)장/일")
                    .typography(.caption)
                    .foregroundStyle(isSel ? Color.bgPrimary.opacity(0.7) : Color.textTertiary)
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(isSel ? Color.accentPrimary : Color.bgSurface,
                        in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func label(_ m: GameMode) -> String {
        switch m {
        case .normal:  return "일반"
        case .godlife: return "갓생"
        case .ultra:   return "초갓생"
        }
    }

    private func desc(_ m: GameMode) -> String {
        switch m {
        case .normal:  return "가볍게 시작 — 하루 카드 1장"
        case .godlife: return "꾸준한 갓생 — 하루 카드 2장"
        case .ultra:   return "끝까지 간다 — 하루 카드 3장"
        }
    }
}

// MARK: - 3. 스타터 팩 선택

private struct OnboardingStarterPack: View {
    let onBack: () -> Void
    let onSelect: (String) -> Void
    @State private var selectedId: String?
    @State private var revealing = false

    var body: some View {
        if revealing, let id = selectedId,
           let pack = StarterPacks.all.first(where: { $0.id == id }) {
            revealView(pack)
        } else {
            selectView
        }
    }

    private var selectView: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("스타터 팩을 골라주세요")
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text("처음 시작할 카드 묶음이에요")
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 56)

            Spacer()

            VStack(spacing: 10) {
                ForEach(StarterPacks.all) { pack in
                    packCard(pack)
                }
            }

            Spacer()

            OnboardingBottomBar(onBack: onBack, title: "팩 열기", enabled: selectedId != nil) {
                withAnimation(.easeInOut(duration: 0.2)) { revealing = true }
            }
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func packCard(_ pack: StarterPack) -> some View {
        let isSel = selectedId == pack.id
        return Button {
            selectedId = pack.id
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(pack.name)
                    .typography(.body)
                    .foregroundStyle(isSel ? Color.bgPrimary : Color.textPrimary)
                Text(pack.description)
                    .typography(.caption)
                    .foregroundStyle(isSel ? Color.bgPrimary.opacity(0.7) : Color.textTertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(isSel ? Color.accentPrimary : Color.bgSurface,
                        in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func revealView(_ pack: StarterPack) -> some View {
        let cards = CardCatalog.cards(ids: pack.cardIds)
        return VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 4) {
                Text(pack.name)
                    .typography(.title)
                    .foregroundStyle(Color.accentPrimary)
                Text("이 카드들로 시작해요")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
            }
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3),
                spacing: 10
            ) {
                ForEach(cards) { card in
                    revealCard(card)
                }
            }
            .padding(.top, 24)
            Spacer()
            // 백버튼 — 팩 선택 화면으로 되돌아가 다른 팩을 고를 수 있다
            OnboardingBottomBar(
                onBack: { withAnimation(.easeInOut(duration: 0.2)) { revealing = false } },
                title: "시작"
            ) {
                onSelect(pack.id)
            }
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func revealCard(_ card: ChallengeCard) -> some View {
        VStack(spacing: 6) {
            Text(card.rarity.displayName)
                .typography(.micro)
                .foregroundStyle(Color.bgPrimary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(card.rarity.color, in: Capsule())
            Text(card.title)
                .typography(.micro)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .padding(.horizontal, 6)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - 4. 레벨 1 달성

private struct OnboardingLevelUp: View {
    let onBack: () -> Void
    let onComplete: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 12) {
                Text("LEVEL 1")
                    .typography(.display)
                    .foregroundStyle(Color.accentPrimary)
                Text("준비 완료!")
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text("덱이 만들어졌어요.\n이제 매일 카드를 뽑아 갓생을 시작할 차례예요.")
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
                    .multilineTextAlignment(.center)
            }
            Spacer()
            OnboardingBottomBar(onBack: onBack, title: "UpNext 시작하기", action: onComplete)
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - 공통 하단 바 (좌: 아이콘 백버튼 · 우: 진행 버튼)

private struct OnboardingBottomBar: View {
    var onBack: (() -> Void)? = nil
    let title: String
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            if let onBack {
                Button(action: onBack) {
                    PixelIcon(.chevronLeft, size: 17, color: Color.textSecondary)
                        .frame(width: 52, height: 52)
                        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("이전")
            }
            OnboardingPrimaryButton(title: title, enabled: enabled, action: action)
        }
    }
}

private struct OnboardingPrimaryButton: View {
    let title: String
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .typography(.body)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .foregroundStyle(Color.bgPrimary)
                .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
                .opacity(enabled ? 1 : 0.3)
        }
        .disabled(!enabled)
    }
}
