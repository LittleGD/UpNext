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
    @EnvironmentObject private var duo: DuoStore
    @State private var confirmCard: ChallengeCard?
    @State private var confirmStartPhase: ChallengePhase?
    @State private var logPromptCard: ChallengeCard?
    @State private var logPickerItem: PhotosPickerItem?
    @State private var logCaption = ""
    @State private var shownReport: WeeklyReportSummary?
    @State private var duoJoinCode = ""
    /// 미니게임 시트 — startMinigame() 으로 티켓 소비 성공 시 true.
    @State private var showMinigame = false

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
                logPromptCard = card
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
        .sheet(isPresented: $showMinigame) {
            MinigameView()
        }
        .sheet(item: $logPromptCard) { card in
            logPromptSheet(card)
                .presentationDetents([.medium])
        }
        .sheet(item: $shownReport) { report in
            reportSheet(report)
                .presentationDetents([.medium, .large])
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
    /// 리텐션 스택(체크인/듀오 — iOS 전용)은 보존하여 덱 위에 둔다.
    private func drawPrompt(_ daily: DailyState, _ s: PhaseSlice) -> some View {
        ScrollView {
            VStack(spacing: 24) {
                homeRetentionStack
                DeckHoldDraw(heading: heading(daily.challengePhase))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .padding(.bottom, 88)
        }
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
                homeRetentionStack
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
                minigameEntry
            }
            .padding(20)
            .padding(.bottom, 88)
        }
    }

    /// 미니게임 진입 — 티켓 보유 시에만 노출. 탭 → 티켓 소비 후 시트.
    @ViewBuilder
    private var minigameEntry: some View {
        let tickets = store.progress?.tickets ?? 0
        if tickets > 0 {
            Button {
                if store.startMinigame() { showMinigame = true }
            } label: {
                HStack(spacing: 10) {
                    PixelIcon(.gamepad, size: 18, color: Color.accentPrimary)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("미니게임")
                            .typography(.body)
                            .foregroundStyle(Color.textPrimary)
                        Text("티켓 \(tickets)장 — 카드 맞추기")
                            .typography(.micro)
                            .foregroundStyle(Color.textTertiary)
                    }
                    Spacer(minLength: 0)
                    PixelIcon(.chevronRight, size: 13, color: Color.textTertiary)
                }
                .padding(14)
                .frame(maxWidth: .infinity)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
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

    // MARK: - 리텐션 카드

    private var homeRetentionStack: some View {
        VStack(spacing: 10) {
            // R1 — 익명 모드 백업 권유 (3일+ 진행 + dismiss 후 7일+ 트리거).
            BackupReminderBannerView()
            retentionCard
            if let report = store.retention?.weeklyReports.first {
                weeklyReportCard(report)
            }
            duoCard
        }
    }

    private var retentionCard: some View {
        let state = store.retention ?? RetentionState.fresh(today: GameStore.todayString())
        let checked = state.lastCheckInDate == GameStore.todayString()
        return HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(checked ? Color.accentPrimary : Color.bgElevated)
                    .frame(width: 44, height: 44)
                PixelIcon(.flame, size: 22,
                          color: checked ? Color.bgPrimary : Color.accentPrimary)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(checked ? "오늘 불꽃이 켜졌어요" : "오늘 불꽃 켜기")
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                Text("\(state.currentLightStreak)일째 · 세이버 \(state.streakSavers)개")
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                    .accessibilityIdentifier("lightStreakLabel")
            }
            Spacer(minLength: 0)
            Button {
                store.checkInToday()
            } label: {
                Text(checked ? "완료" : "체크인")
                    .typography(.caption)
                    .foregroundStyle(checked ? Color.textTertiary : Color.bgPrimary)
                    .padding(.horizontal, 12)
                    .frame(height: 34)
                    .background(checked ? Color.bgElevated : Color.accentPrimary, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(checked)
            .accessibilityIdentifier("todayFlameButton")
        }
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
    }

    private func weeklyReportCard(_ report: WeeklyReportSummary) -> some View {
        Button { shownReport = report } label: {
            HStack(spacing: 12) {
                PixelIcon(.chart, size: 18, color: Color.accentPrimary)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text("지난주 리포트")
                        .typography(.body)
                        .foregroundStyle(Color.textPrimary)
                    Text("\(report.checkInCount)일 체크인 · 카드 \(report.completedCardCount)장 · 로그 \(report.photoLogCount)개")
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                PixelIcon(.chevronRight, size: 12, color: Color.textTertiary)
            }
            .padding(14)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("weeklyReportCard")
    }

    private var duoCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                HStack(spacing: 6) {
                    PixelIcon(.users, size: 16, color: Color.textPrimary)
                    Text("2인 불꽃").typography(.body).foregroundStyle(Color.textPrimary)
                }
                Spacer()
                if duo.isWorking {
                    ProgressView()
                        .scaleEffect(0.7)
                        .tint(Color.accentPrimary)
                }
            }
            if let active = duo.activeDuo, let uid = store.auth.uid {
                activeDuoContent(active, uid: uid)
            } else {
                inviteDuoContent
            }
            if let message = duo.message {
                Text(message)
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                    .lineLimit(2)
            }
        }
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
    }

    private func activeDuoContent(_ active: DuoSnapshot, uid: String) -> some View {
        let today = GameStore.todayString()
        let otherId = active.memberIds.first { $0 != uid }
        let friendName = otherId.flatMap { active.memberNames[$0] } ?? "친구"
        let friendChecked = otherId.map { active.checkedIn(uid: $0, on: today) } ?? false
        let mineChecked = active.checkedIn(uid: uid, on: today)
        let sharedGoal = min(active.sharedDays(currentUid: uid).count, 7)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                duoPill(title: "나", on: mineChecked)
                duoPill(title: friendName, on: friendChecked)
                Spacer(minLength: 0)
                Text("\(sharedGoal) / 7")
                    .typography(.caption)
                    .foregroundStyle(Color.accentPrimary)
            }
            HStack(spacing: 8) {
                ForEach(recentSevenDays(), id: \.self) { day in
                    Circle()
                        .fill(duoColor(active, uid: uid, day: day))
                        .frame(width: 12, height: 12)
                        .accessibilityLabel(day)
                }
                Spacer(minLength: 0)
                Button("나가기") { duo.leaveDuo() }
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                    .buttonStyle(.plain)
            }
            if let code = duo.inviteCode, active.memberIds.count == 1 {
                Text("초대코드 \(code)")
                    .typography(.caption)
                    .foregroundStyle(Color.accentPrimary)
                    .accessibilityIdentifier("duoInviteCodeLabel")
            }
        }
    }

    private var inviteDuoContent: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                TextField("초대코드", text: $duoJoinCode)
                    .typography(.caption)
                    .textInputAutocapitalization(.characters)
                    .disableAutocorrection(true)
                    .padding(.horizontal, 10)
                    .frame(height: 38)
                    .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 10))
                    .accessibilityIdentifier("duoJoinCodeField")
                Button("참여") {
                    duo.joinInvite(code: duoJoinCode)
                }
                .typography(.caption)
                .foregroundStyle(Color.bgPrimary)
                .frame(width: 56, height: 38)
                .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 10))
                .buttonStyle(.plain)
                .accessibilityIdentifier("duoJoinButton")
            }
            Button {
                duo.createInvite()
            } label: {
                HStack(spacing: 6) {
                    PixelIcon(.link, size: 14, color: Color.accentPrimary)
                    Text("초대코드 만들기").typography(.caption).foregroundStyle(Color.accentPrimary)
                }
                    .frame(maxWidth: .infinity)
                    .frame(height: 38)
                    .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("duoCreateInviteButton")
        }
    }

    private func duoPill(title: String, on: Bool) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(on ? Color.accentPrimary : Color.textTertiary.opacity(0.35))
                .frame(width: 7, height: 7)
            Text(title)
                .typography(.micro)
        }
        .foregroundStyle(on ? Color.textPrimary : Color.textTertiary)
        .padding(.horizontal, 8)
        .frame(height: 24)
        .background(Color.bgElevated, in: Capsule())
    }

    private func duoColor(_ duo: DuoSnapshot, uid: String, day: String) -> Color {
        let other = duo.memberIds.first { $0 != uid }
        let mine = duo.checkedIn(uid: uid, on: day)
        let theirs = other.map { duo.checkedIn(uid: $0, on: day) } ?? false
        if mine && theirs { return Color.accentPrimary }
        if mine || theirs { return Color.accentPrimary.opacity(0.38) }
        return Color.bgElevated
    }

    private func recentSevenDays() -> [String] {
        (-6...0).compactMap { RetentionEngine.addDays(GameStore.todayString(), $0) }
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

    private func reportSheet(_ report: WeeklyReportSummary) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("지난주 리포트")
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text("\(report.weekStart) - \(report.weekEnd)")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    reportMetric("체크인", "\(report.checkInCount)일", .flame)
                    reportMetric("완료 카드", "\(report.completedCardCount)장", .check)
                    reportMetric("사진 로그", "\(report.photoLogCount)개", .image)
                    reportMetric("세이버", report.usedSaver ? "사용" : "미사용", .shield)
                }
                if let category = report.topCategory {
                    reportRow(icon: category.pixelIcon, title: "가장 많이 한 카테고리", value: category.label)
                }
                if let title = report.highlightCardTitle {
                    reportRow(icon: .sparkle, title: "인상적인 카드", value: title)
                }
            }
            .padding(20)
        }
        .background(Color.bgPrimary)
    }

    private func reportMetric(_ title: String, _ value: String, _ icon: PixelIconName) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            PixelIcon(icon, size: 16, color: Color.accentPrimary)
            Text(value)
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Text(title)
                .typography(.micro)
                .foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
    }

    private func reportRow(icon: PixelIconName, title: String, value: String) -> some View {
        HStack(spacing: 12) {
            PixelIcon(icon, size: 18, color: Color.accentPrimary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                Text(value)
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
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
