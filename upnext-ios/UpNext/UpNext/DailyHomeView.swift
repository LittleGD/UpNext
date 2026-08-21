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
        // 앰비언트 노출(요인1) — 웹 layout.tsx: body 가 bg-primary, main 은 relative z-[1] 투명이라
        // ClientEffects(오로라·별)가 관통한다. iOS 도 MainShell L79 가 이미 bgPrimary 를 깔고 그 위에
        // AmbientBackground+PixelStars 를 마운트하므로, 화면 루트의 불투명 배경을 제거해(투명화) 관통 노출.
        // 콘텐츠는 bgSurface 카드 위에 있어 대비/가독성은 그대로 유지된다.
        // 05-modal-design — 흰색 시스템 .alert → GbConfirm(GB 팔레트). 껍데기만 교체하고
        // 14-completion-delay 의 2버튼 구조(사진 인증 옵트인)는 그대로 유지. 웹엔 대응
        // 확인창이 없는 iOS 전용 스텝이라 표준 확인/취소가 아닌 커스텀 푸터로 구성.
        .overlay {
            if let card = confirmCard {
                GbConfirm(
                    title: "챌린지 완료",
                    // 10-i18n-leaks(a): %@ 인자는 원문(한국어) title 이 아닌 localizedTitle 로.
                    message: "'\(card.localizedTitle(.current))' 을(를) 완료로 표시할까요?"
                ) { tint in
                    VStack(spacing: 8) {
                        // ① "사진으로 인증하고 완료" → 완료(XP/레벨업)를 *즉시 동기 커밋*하고
                        //   카메라 모달을 띄운다. 완료를 저장 콜백으로 미루는 방식(구 P1-b 1안)은
                        //   촬영 중 강제종료/백그라운드 킬 시 완료가 통째로 유실되는 비가역
                        //   손실이 있어 폐기(코드리뷰 photo-completion-loss). 레벨업/캡처 모달의
                        //   동시 트리거 경합은 MainShell 의 레벨업 오버레이 게이트(pendingCapture
                        //   == nil 일 때만 표시)로 해소한다 — 완료는 영속, 표시만 지연(P1-b 2안).
                        Button("사진으로 인증하고 완료") {
                            // A-1 — 완료(동기 커밋)와 캡처 모달 present 를 *다른 틱*으로 분리한다.
                            //   같은 틱이면 완료 didSet 의 디바운스 작업(WidgetSync·LiveActivity·
                            //   persist)이 fullScreenCover 프레젠테이션+카메라 스킨 빌드+AVCaptureSession
                            //   구성과 경합해 프리징을 유발했다. beginCapture 를 main.async 로 미뤄
                            //   완료 커밋의 동기·디바운스 작업이 먼저 드레인된 다음 present 가 뜨게 한다.
                            //   완료-선커밋(내구성)은 유지 — 촬영 중 강제종료에도 완료 유실 없음.
                            store.completePhaseChallenge(card.id)
                            confirmCard = nil
                            DispatchQueue.main.async {
                                store.growth.beginCapture(cardId: card.id, title: card.title, category: card.category)
                            }
                        }
                        .buttonStyle(GbConfirmButtonStyle(
                            fg: GBPalette.darkest, bg: tint, border: tint, bold: true, fullWidth: true))
                        // ② "사진없이 완료" → 완료만(카메라 안 뜸 → 즉시 다음 인터랙션 가능)
                        Button("사진없이 완료") {
                            store.completePhaseChallenge(card.id)
                            confirmCard = nil
                        }
                        .buttonStyle(GbConfirmButtonStyle(
                            fg: GBPalette.lightest, bg: .clear, border: GBPalette.lightest, fullWidth: true))
                        Button("취소") { confirmCard = nil }
                            .buttonStyle(GbConfirmButtonStyle(
                                fg: GBPalette.light, bg: .clear, border: GBPalette.light, fullWidth: true))
                    }
                }
                .transition(.opacity)
                .zIndex(90)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: confirmCard)
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
        // String 반환값이 Text(변수)로 렌더되므로 LocalizedStringKey 자동 현지화가 안 걸린다.
        // AppConfig.loc 로 인앱 언어(currentLocale) 기준 해석해야 4개국어로 표시됨.
        switch phase {
        case .daily:    return AppConfig.loc("오늘의 챌린지")
        case .extra:    return AppConfig.loc("추가 챌린지")
        case .`super`:  return AppConfig.loc("슈퍼 챌린지")
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
        // 공용 secondary(채움 bgSurface) + accentPrimary 텍스트(DailyHome 관례) — 13-button-system.
        UNButton(title, variant: .secondary, tint: .accentPrimary, action: action)
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
                Text(card.localizedTitle(.current))
                    .typography(.heading)
                    .foregroundStyle(completed ? Color.textTertiary : Color.textPrimary)
                Text(card.localizedDescription(.current))
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
            // 완료 카드: 배경만 죽이고(웹 DailyBoard 패리티) 완료 배지/내용은 풀불투명 유지.
            // 등급 표면 텍스처(요인2c) — 웹 DailyBoard L400 RarityTexture 오버레이 복원.
            // bgSurface 위·콘텐츠 아래(.background)라 텍스트 대비는 그대로. 완료 시 톤다운.
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color.bgSurface.opacity(completed ? 0.55 : 1))
                    RarityTexture(rarity: card.rarity, cornerRadius: 14)
                        .opacity(completed ? 0.35 : 1)
                }
            )
            // 등급 글로우(요인2a) — 웹 rarityGlow(RarityTexture.tsx L167-172), 미완료 카드만.
            .modifier(RarityGlow(rarity: card.rarity, active: !completed))
            .contentShape(Rectangle())
        }
        // 탭 프레스 스케일(요인2e) — 웹 DailyBoard motion.button whileTap scale 0.97.
        .buttonStyle(CardPressStyle())
        .disabled(completed)
    }

    // MARK: - 공통

    private func primaryButton(_ title: String, enabled: Bool = true,
                               action: @escaping () -> Void) -> some View {
        // 공용 primary — OnboardingPrimaryButton 과 100% 동일하던 복붙 정의 흡수(13-button-system).
        UNButton(title, enabled: enabled, action: action)
    }
}

// MARK: - 카드 표면 연출 (요인2 — 등급 글로우 · 프레스 스케일)

/// 등급 외곽 글로우 — 웹 rarityGlow(cards/RarityTexture.tsx L167-172) 수치 1:1.
/// CSS `0 0 12px ${color}08` 의 blur px → SwiftUI shadow radius 로 그대로, 알파는 hex/255.
///  · normal 무글로우 / rare r12@0x08 / unique r16@0x0c + r1@0x14 / legend r24@0x12 + r2@0x18.
/// active(=미완료)일 때만 — 웹은 `!isCompleted` 조건.
private struct RarityGlow: ViewModifier {
    let rarity: Rarity
    let active: Bool

    func body(content: Content) -> some View {
        if !active {
            content
        } else {
            switch rarity {
            case .normal:
                content
            case .rare:
                content.shadow(color: rarity.color.opacity(0x08 / 255.0), radius: 12)
            case .unique:
                content
                    .shadow(color: rarity.color.opacity(0x0c / 255.0), radius: 16)
                    .shadow(color: rarity.color.opacity(0x14 / 255.0), radius: 1)
            case .legend:
                content
                    .shadow(color: rarity.color.opacity(0x12 / 255.0), radius: 24)
                    .shadow(color: rarity.color.opacity(0x18 / 255.0), radius: 2)
            }
        }
    }
}

/// 카드 탭 프레스 스케일 — 웹 motion.button whileTap `{ scale: 0.97 }` 패리티.
/// .plain 처럼 기본 버튼 스타일을 벗기고 press 스케일만 얹는다(콘텐츠 색은 라벨에서 지정).
private struct CardPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
