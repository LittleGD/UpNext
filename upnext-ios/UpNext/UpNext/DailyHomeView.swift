//
//  DailyHomeView.swift
//  UpNext — 오늘의 챌린지 (데일리 홈) — Phase 4 슬라이스 8~9.
//
//  웹 app/page.tsx + components/daily 의 데일리 루프를 SwiftUI 로 포팅.
//  challengePhase(daily/extra/super) 별로 같은 3단계 루프를 돈다:
//   1. 미드로우            → 카드 뽑기 CTA
//   2. 드로우 완료·선택 중  → 6장 중 phase 장수 선택 (daily 는 리롤 가능)
//   3. 선택 확정           → 보드: 카드 완료 처리. 풀클리어 시 다음 페이즈 배너
//
//  PhaseSlice 로 현재 페이즈의 daily/extra/super 필드를 한 곳에서 골라 — 화면 코드는
//  페이즈를 모르고 동작. 웹 CardDrawScreen 의 3D 플립 연출(4.3) · 사진 인증(4.5) ·
//  완료 셀레브레이션 연출은 미포함 (기능적 포팅).
//

import SwiftUI

struct DailyHomeView: View {
    @EnvironmentObject private var store: GameStore
    @State private var confirmCard: ChallengeCard?
    @State private var confirmStartPhase: ChallengePhase?

    var body: some View {
        Group {
            if let daily = store.daily, let progress = store.progress {
                let s = slice(daily, progress)
                if !s.isDrawComplete {
                    drawPrompt(daily, s)
                } else if !s.isSelectionComplete {
                    selectView(daily, s)
                } else {
                    boardView(daily, s)
                }
            } else {
                ProgressView().tint(Color.accentPrimary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
        .alert("챌린지 완료", isPresented: cardConfirmBinding, presenting: confirmCard) { card in
            Button("완료") {
                store.completePhaseChallenge(card.id)
                confirmCard = nil
            }
            Button("취소", role: .cancel) { confirmCard = nil }
        } message: { card in
            Text("'\(card.title)' 을(를) 완료로 표시할까요?")
        }
        .alert("챌린지 추가", isPresented: phaseConfirmBinding, presenting: confirmStartPhase) { phase in
            Button("시작") {
                if phase == .extra { store.startExtraChallenge() } else { store.startSuperChallenge() }
                confirmStartPhase = nil
            }
            Button("취소", role: .cancel) { confirmStartPhase = nil }
        } message: { phase in
            Text(phase == .extra
                 ? "오늘의 챌린지를 모두 끝냈어요.\n추가 챌린지(카드 2장)에 도전할까요?"
                 : "추가 챌린지 완료!\n슈퍼 챌린지(카드 3장)에 도전할까요?")
        }
    }

    private var cardConfirmBinding: Binding<Bool> {
        Binding(get: { confirmCard != nil }, set: { if !$0 { confirmCard = nil } })
    }
    private var phaseConfirmBinding: Binding<Bool> {
        Binding(get: { confirmStartPhase != nil }, set: { if !$0 { confirmStartPhase = nil } })
    }

    // MARK: - 페이즈 슬라이스

    /// 현재 challengePhase 에 해당하는 daily/extra/super 필드 묶음.
    private struct PhaseSlice {
        var drawn: [ChallengeCard]
        var selected: [ChallengeCard]
        var completedIds: [String]
        var isDrawComplete: Bool
        var isSelectionComplete: Bool
        var maxCards: Int
        var penaltyCardId: String?
    }

    private func slice(_ d: DailyState, _ progress: UserProgress) -> PhaseSlice {
        switch d.challengePhase {
        case .daily:
            return PhaseSlice(drawn: d.drawnCards, selected: d.selectedCards,
                              completedIds: d.completedIds, isDrawComplete: d.isDrawComplete,
                              isSelectionComplete: d.isSelectionComplete,
                              maxCards: progress.mode.cardCount, penaltyCardId: d.penaltyCardId)
        case .extra:
            return PhaseSlice(drawn: d.extraDrawnCards, selected: d.extraSelectedCards,
                              completedIds: d.extraCompletedIds, isDrawComplete: d.extraDrawComplete,
                              isSelectionComplete: d.extraSelectionComplete,
                              maxCards: ChallengePhase.extra.cardCount, penaltyCardId: nil)
        case .`super`:
            return PhaseSlice(drawn: d.superDrawnCards, selected: d.superSelectedCards,
                              completedIds: d.superCompletedIds, isDrawComplete: d.superDrawComplete,
                              isSelectionComplete: d.superSelectionComplete,
                              maxCards: ChallengePhase.`super`.cardCount, penaltyCardId: nil)
        }
    }

    private func heading(_ phase: ChallengePhase) -> String {
        switch phase {
        case .daily:    return "오늘의 챌린지"
        case .extra:    return "추가 챌린지"
        case .`super`:  return "슈퍼 챌린지"
        }
    }

    // MARK: - 상태 1 — 미드로우

    private func drawPrompt(_ daily: DailyState, _ s: PhaseSlice) -> some View {
        VStack(spacing: 24) {
            Spacer()
            VStack(spacing: 8) {
                Text(heading(daily.challengePhase))
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text("덱에서 카드 6장을 펼쳐\n실천할 \(s.maxCards)장을 골라요")
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
                    .multilineTextAlignment(.center)
            }
            primaryButton("카드 뽑기") { store.drawPhaseCards() }
            Spacer()
        }
        .padding(.horizontal, 32)
    }

    // MARK: - 상태 2 — 드로우 완료, 선택 중

    private func selectView(_ daily: DailyState, _ s: PhaseSlice) -> some View {
        let selectedIds = Set(s.selected.map(\.id))
        return ScrollView {
            VStack(spacing: 16) {
                VStack(spacing: 4) {
                    Text("\(heading(daily.challengePhase)) — 카드 고르기")
                        .typography(.title)
                        .foregroundStyle(Color.textPrimary)
                    Text("실천할 \(s.maxCards)장을 선택하세요")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12),
                                    GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(s.drawn) { card in
                        drawnCard(card,
                                  selected: selectedIds.contains(card.id),
                                  isPenalty: s.penaltyCardId == card.id)
                    }
                }
                if daily.challengePhase == .daily && !daily.rerollUsed {
                    Button { store.rerollCards() } label: {
                        Label("다시 뽑기", systemImage: "arrow.clockwise")
                            .typography(.caption)
                            .foregroundStyle(Color.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
                primaryButton("\(s.selected.count) / \(s.maxCards) 선택 — 확정",
                              enabled: s.selected.count == s.maxCards) {
                    store.confirmPhaseSelection()
                }
            }
            .padding(20)
            .padding(.bottom, 88)
        }
    }

    private func drawnCard(_ card: ChallengeCard, selected: Bool, isPenalty: Bool) -> some View {
        let highlighted = selected || isPenalty
        return Button {
            guard !isPenalty else { return }
            if selected { store.deselectPhaseCard(card.id) } else { store.selectPhaseCard(card) }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(card.rarity.displayName)
                        .typography(.micro)
                        .foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(card.rarity.color, in: Capsule())
                    Spacer()
                    if isPenalty {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(Color.bgPrimary)
                    } else if selected {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Color.bgPrimary)
                    }
                }
                Text(card.title)
                    .typography(.caption)
                    .foregroundStyle(highlighted ? Color.bgPrimary : Color.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(card.description)
                    .typography(.micro)
                    .foregroundStyle(highlighted ? Color.bgPrimary.opacity(0.7) : Color.textTertiary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
            .padding(12)
            .background(highlighted ? Color.accentPrimary : Color.bgSurface,
                        in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - 상태 3 — 선택 확정, 보드

    private func boardView(_ daily: DailyState, _ s: PhaseSlice) -> some View {
        let done = s.completedIds.count
        let total = s.selected.count
        let allDone = total > 0 && done >= total
        return ScrollView {
            VStack(spacing: 16) {
                HStack {
                    Text(heading(daily.challengePhase))
                        .typography(.title)
                        .foregroundStyle(Color.textPrimary)
                    Spacer()
                    Text("\(done) / \(total)")
                        .typography(.body)
                        .foregroundStyle(Color.accentPrimary)
                }
                if allDone {
                    completionBanner(daily.challengePhase)
                    nextChallengePrompt(daily.challengePhase)
                }
                VStack(spacing: 12) {
                    ForEach(s.selected) { card in
                        boardCard(card, completed: s.completedIds.contains(card.id))
                    }
                }
            }
            .padding(20)
            .padding(.bottom, 88)
        }
    }

    private func completionBanner(_ phase: ChallengePhase) -> some View {
        VStack(spacing: 6) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 32))
                .foregroundStyle(Color.bgPrimary)
            Text("\(heading(phase)) 완료!")
                .typography(.heading)
                .foregroundStyle(Color.bgPrimary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 14))
    }

    /// daily/extra 풀클리어 후 다음 페이즈 도전 버튼. super 면 없음.
    @ViewBuilder
    private func nextChallengePrompt(_ phase: ChallengePhase) -> some View {
        switch phase {
        case .daily:
            challengeButton("추가 챌린지 도전") { confirmStartPhase = .extra }
        case .extra:
            challengeButton("슈퍼 챌린지 도전") { confirmStartPhase = .`super` }
        case .`super`:
            EmptyView()
        }
    }

    private func challengeButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .typography(.body)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .foregroundStyle(Color.accentPrimary)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private func boardCard(_ card: ChallengeCard, completed: Bool) -> some View {
        Button {
            confirmCard = card
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(card.rarity.displayName)
                        .typography(.micro)
                        .foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(card.rarity.color, in: Capsule())
                    Spacer()
                    if completed {
                        Label("완료", systemImage: "checkmark.circle.fill")
                            .typography(.caption)
                            .foregroundStyle(Color.accentPrimary)
                    } else {
                        Text("+\(GameConstants.xpPerRarity[card.rarity] ?? 10) XP")
                            .typography(.caption)
                            .foregroundStyle(Color.accentPrimary)
                    }
                }
                Text(card.title)
                    .typography(.heading)
                    .foregroundStyle(completed ? Color.textTertiary : Color.textPrimary)
                Text(card.description)
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .multilineTextAlignment(.leading)
                if !completed {
                    Text("탭하여 완료")
                        .typography(.caption)
                        .foregroundStyle(Color.accentPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 10))
                        .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
            .opacity(completed ? 0.6 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(completed)
    }

    // MARK: - 공통

    private func primaryButton(_ title: String, enabled: Bool = true,
                               action: @escaping () -> Void) -> some View {
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
