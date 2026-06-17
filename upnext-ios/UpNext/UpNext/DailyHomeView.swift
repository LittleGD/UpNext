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
import PhotosUI

struct DailyHomeView: View {
    @EnvironmentObject private var store: GameStore
    @State private var confirmCard: ChallengeCard?
    @State private var confirmStartPhase: ChallengePhase?
    @State private var logPromptCard: ChallengeCard?
    @State private var logPickerItem: PhotosPickerItem?
    @State private var logCaption = ""
    // 리텐션(불꽃/리포트/듀오)과 미니게임은 아지트로 이전됨 — 데일리는 순수 카드 흐름.

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
        // ChallengeConfirmModal — 시스템 .alert 대체. 백드롭 + spring + 파티클 + gradient CTA.
        .overlay {
            if let phase = confirmStartPhase {
                ChallengeConfirmModal(
                    phase: phase == .extra ? .extra : .sup,
                    onConfirm: {
                        if phase == .extra { store.startExtraChallenge() }
                        else { store.startSuperChallenge() }
                        confirmStartPhase = nil
                    },
                    onCancel: { confirmStartPhase = nil }
                )
                .transition(.opacity)
                .zIndex(100)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: confirmStartPhase)
        .sheet(item: $logPromptCard) { card in
            logPromptSheet(card)
                .presentationDetents([.medium])
        }
        .onChange(of: logPickerItem) { item in
            guard let item, let card = logPromptCard else { return }
            let caption = logCaption
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                await MainActor.run {
                    store.growth.addChallengeLog(imageData: data, card: card, caption: caption)
                    logPickerItem = nil
                    logPromptCard = nil
                    logCaption = ""
                }
            }
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

    // MARK: - 상태 1 — 미드로우 (웹 CardDrawScreen state 1 · 덱 홀드)

    /// R4 — "카드 뽑기" 버튼 대신 웹의 덱 홀드 드로우 (DeckHoldDraw) 복원.
    /// 웹 CardDrawScreen 처럼 덱을 화면 수직 중앙 단독 hero 로 배치(min-h-[60vh] justify-center).
    /// 리텐션(불꽃/리포트/듀오)은 아지트로 이전 — 데일리는 카드뽑기만 풀포커스.
    /// BackupReminderBanner 만 웹 page.tsx(L140) 처럼 상단 조건부 유지(익명 백업 권유).
    private func drawPrompt(_ daily: DailyState, _ s: PhaseSlice) -> some View {
        VStack(spacing: 0) {
            BackupReminderBannerView()
                .padding(.horizontal, 20)
                .padding(.top, 12)
            Spacer(minLength: 0)
            DeckHoldDraw(heading: heading(daily.challengePhase))
                .padding(.horizontal, 20)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, 88)
    }

    // MARK: - 상태 2 — 드로우 완료, 선택 중 (웹 CardDrawScreen state 3+2)

    /// R4 — 2열 그리드+탭 토글을 웹의 부채꼴 핸드+3D 프리뷰+리뷰 캐러셀로 전면 교체.
    /// 웹 fixed inset-0 처럼 풀블리드 포커스 (리텐션 미표시 — 웹 동치).
    private func selectView(_ daily: DailyState, _ s: PhaseSlice) -> some View {
        CardSelectScreen(
            phase: daily.challengePhase,
            drawn: s.drawn,
            selected: s.selected,
            maxCards: s.maxCards,
            penaltyCardId: s.penaltyCardId,
            hasPenalty: daily.hasPenalty,
            rerollUsed: daily.rerollUsed)
    }

    // MARK: - 상태 3 — 선택 확정, 보드

    private func boardView(_ daily: DailyState, _ s: PhaseSlice) -> some View {
        let done = s.completedIds.count
        let total = s.selected.count
        let allDone = total > 0 && done >= total
        return ScrollView {
            VStack(spacing: 16) {
                // 웹 page.tsx(L140) 패리티 — 백업 권유 배너만 보드 상단 조건부.
                // 리텐션(불꽃/리포트/듀오)·미니게임은 아지트로 이전됨.
                BackupReminderBannerView()
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
            PixelIcon(.check, size: 32, color: Color.bgPrimary)
            Text("\(heading(phase)) 완료!")
                .typography(.heading)
                .foregroundStyle(Color.bgPrimary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 14))
    }

    /// daily/extra 풀클리어 후 다음 페이즈 도전 — hold-to-charge 배너. super 면 없음.
    @ViewBuilder
    private func nextChallengePrompt(_ phase: ChallengePhase) -> some View {
        switch phase {
        case .daily:
            ChallengePhaseBanner(phase: .extra) { confirmStartPhase = .extra }
        case .extra:
            ChallengePhaseBanner(phase: .sup) { confirmStartPhase = .`super` }
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
                        HStack(spacing: 4) {
                            PixelIcon(.check, size: 12, color: Color.accentPrimary)
                            Text("완료").typography(.caption).foregroundStyle(Color.accentPrimary)
                        }
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

    private func logPromptSheet(_ card: ChallengeCard) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Capsule()
                .fill(Color.textTertiary.opacity(0.3))
                .frame(width: 42, height: 5)
                .frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: 6) {
                Text("2초 로그 남기기")
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text(card.title)
                    .typography(.body)
                    .foregroundStyle(Color.accentPrimary)
            }
            TextField("한 줄 캡션", text: $logCaption)
                .typography(.body)
                .padding(.horizontal, 12)
                .frame(height: 46)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
                .accessibilityIdentifier("challengeLogCaption")
            PhotosPicker(selection: $logPickerItem, matching: .images) {
                HStack(spacing: 6) {
                    PixelIcon(.camera, size: 18, color: Color.bgPrimary)
                    Text("사진 1장 선택").typography(.body).foregroundStyle(Color.bgPrimary)
                }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .accessibilityIdentifier("challengeLogPicker")
            Button("나중에") {
                logPromptCard = nil
                logCaption = ""
            }
            .typography(.caption)
            .foregroundStyle(Color.textTertiary)
            .frame(maxWidth: .infinity)
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(Color.bgPrimary)
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
