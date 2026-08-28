//
//  FortuneToastView.swift
//  UpNext — 챌린지(홈) 상단 "오늘의 기운" 리마인드 토스트.
//
//  웹 챌린지 페이지 토스트(fortune.toast.*) iOS 대응. 진입 팝업(FortunePromptModal)을
//  스킵한 유저에게 하루 한 번, 끌 수 있는 형태로만 다시 알린다.
//
//  원칙:
//   - **토스트는 광고를 부르지 않는다.** 탭하면 불꽃 탭으로 보내고, 실제 광고·공개는
//     사용자가 그 화면에서 진행한다(FortuneCardView 의 옵트인 경로 그대로).
//   - 진입 팝업 *대신* 뜨지 않는다. 팝업을 이미 물어본 뒤에만 뜬다(중복 권유 금지).
//   - 닫으면 그날은 끝. 하루에 두 번 조르지 않는다.
//   - 죽은 CTA 금지 — 광고를 띄울 수 없거나 뽑을 카드가 없으면 아예 렌더하지 않는다.
//
//  상태 재사용(새로 만들지 않는다):
//   - "오늘 진입 팝업을 물어봤음" = MainShell 의 @AppStorage("fortunePromptDeclinedDate")
//     ("나중에" 든 "지금 열기" 든 어느 경로로 닫혀도 오늘 날짜가 찍힌다 — MainShell:225,236).
//     팝업이 *떠 있는 동안* 켜지는 askedThisLaunch 는 게이트로 쓰지 않는다(canShow 주석).
//   - "오늘의 기운 미공개" = Fortune.isRevealed(today:).
//   - 탭 이동 신호 = FortuneAutoOpen.request() (FortunePromptModal 의 "지금 열기" 와 같은 계약).
//

import SwiftUI
import UIKit

@MainActor
struct FortuneToastView: View {
    /// 좌우 여백. 호출측이 이미 인셋을 준 컨테이너(보드 ScrollView)에선 0.
    /// 여백을 *뷰 안쪽*에서 주는 이유 — 조건이 거짓이면 이 뷰는 통째로 사라져야 한다.
    /// 호출측에서 .padding 을 걸면 숨겨진 상태에서도 그 여백만 레이아웃에 남는다.
    var horizontalInset: CGFloat = 0
    /// 위 여백. 화면 최상단에 바로 붙는 자리에서만 준다.
    var topInset: CGFloat = 0
    /// 탭 — 불꽃(기록) 탭으로 이동 + 오늘의 기운 자동 열기 신호. 광고는 여기서 부르지 않는다.
    let onOpen: () -> Void

    @EnvironmentObject private var store: GameStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 오늘 이 토스트를 닫은 날짜("YYYY-MM-DD"). 닫으면 그날은 다시 뜨지 않는다.
    @AppStorage("fortuneToastDismissedDate") private var dismissedDate: String = ""
    /// 진입 팝업을 오늘 이미 물어본 날짜 — MainShell 이 쓰는 키를 그대로 읽는다(단일 진실).
    /// @AppStorage 라 MainShell 이 값을 쓰는 즉시 이 뷰가 갱신된다(팝업 닫자마자 등장).
    @AppStorage("fortunePromptDeclinedDate") private var promptAskedDate: String = ""

    /// 등장 연출용 — 옵셔널 분기가 켜지는 순간 onAppear 로 켠다(FortunePromptModal 과 같은 규약).
    @State private var entered = false

    /// 이번 앱 실행에서 토스트로 불꽃 탭에 이미 보냈는지. 광고를 중도 이탈하고 돌아왔을 때
    /// 같은 문구로 다시 조르지 않기 위한 실행 수명 게이트(날짜 키를 소모하지는 않는다 —
    /// 불꽃 탭의 오늘의 기운 카드는 그대로 남아 있어 진입 경로가 사라지지 않는다).
    private static var openedThisLaunch = false

    var body: some View {
        if canShow {
            toast
                .offset(y: entered ? 0 : -14)
                .opacity(entered ? 1 : 0)
                .padding(.horizontal, horizontalInset)
                .padding(.top, topInset)
                .onAppear { runEnter() }
                .transition(.opacity)
        }
    }

    // MARK: - 표시 조건

    /// 온보딩 완료(진행 데이터 존재) + 오늘 진입 팝업을 이미 물어봤음 + 오늘의 기운 미공개
    /// + 광고 가용 + 오늘 닫지 않음 + 뽑을 카드 존재.
    private var canShow: Bool {
        #if DEBUG
        // UITest 런치에선 자동 노출을 막아 챌린지 화면 검증을 가리지 않게 한다
        // (MainShell.evaluateFortunePrompt 와 같은 규약 — 전용 인자로만 시드).
        let args = ProcessInfo.processInfo.arguments
        if args.contains(where: { $0.hasPrefix("UITest") }),
           !args.contains("UITestSeedFortuneToast") { return false }
        #endif
        guard !Self.openedThisLaunch else { return false }
        guard let progress = store.progress else { return false }

        let today = GameStore.todayString()
        guard dismissedDate != today else { return false }
        // 진입 팝업을 물어보기 *전에* 뜨면 같은 권유가 두 번 겹친다 — 팝업 다음 순번.
        //
        // 판정은 날짜 키 하나로만 한다. `FortuneAutoOpen.askedThisLaunch` 는 팝업을 *띄우는*
        // 순간 켜지므로(MainShell:535, 사용자가 답하기 전) 그걸 함께 보면 팝업이 떠 있는 동안
        // 뒤에서 토스트가 살아나 VoiceOver 로 새 나가고 같은 권유가 겹쳐 읽힌다.
        // 날짜 키는 팝업이 어느 경로로 닫히든("지금 열기"/"나중에"/백드롭) 기록되므로
        // (MainShell:225,236) "물어본 뒤" 라는 조건을 정확히 표현한다.
        guard promptAskedDate == today else { return false }
        guard !Fortune.isRevealed(today: today) else { return false }
        guard AdsService.shared.isAvailable else { return false }
        // 해금 카드가 하나도 없으면 열 것이 없다(FortuneCardView 의 isEmpty 판정과 같은 근거).
        guard Fortune.compute(dateKey: today,
                              salt: Fortune.salt,
                              unlockedCardIds: progress.unlockedCardIds) != nil else { return false }
        return true
    }

    // MARK: - 표면

    /// 보더 없음 — bgElevated 면 + 그림자로만 떠 있는 층을 표현(기존 토스트/배너 관례).
    private var toast: some View {
        HStack(spacing: 8) {
            Button(action: open) {
                HStack(spacing: 10) {
                    // 장식 아이콘 — 버튼 레이블은 문구 하나로 충분하다(에셋 이름이 읽히지 않게).
                    PixelIcon(.sparkle, size: 18, color: Color.accentPrimary)
                        .accessibilityHidden(true)
                    Text("오늘의 운세와 기운을 확인해보세요")
                        .typography(.caption)
                        .foregroundStyle(Color.textPrimary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                    PixelIcon(.chevronRight, size: 12, color: Color.accentPrimary)
                        .accessibilityHidden(true)
                }
                .frame(minHeight: 32)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("fortuneToastOpenButton")

            Button(action: dismiss) {
                PixelIcon(.cancel, size: 14, color: Color.textTertiary)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // 아이콘 전용 버튼 — VoiceOver 가 읽을 이름을 명시한다(카탈로그 기존 키).
            .accessibilityLabel(Text("닫기"))
            .accessibilityIdentifier("fortuneToastDismissButton")
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
        .shadow(color: Color.black.opacity(0.3), radius: 12, y: 4)
        .accessibilityIdentifier("fortuneToast")
        .accessibilityElement(children: .contain)
    }

    // MARK: - 동작

    /// 상단에서 내려오는 등장. reduce motion 이면 이동 없이 즉시 표시한다.
    private func runEnter() {
        guard !entered else { return }
        // 안내는 연출과 무관하게 항상 한 번 — reduce motion 을 켠 사용자가 VoiceOver
        // 사용자와 크게 겹치므로, 애니 분기 안에 두면 정작 필요한 쪽이 못 듣는다.
        defer { announceForVoiceOver() }
        if reduceMotion { entered = true; return }
        withAnimation(Anim.cardOverlayEnter.delay(0.3)) { entered = true }
    }

    /// 토스트는 포커스를 뺏지 않으므로 VoiceOver 사용자는 등장을 놓칠 수 있다 —
    /// 같은 문구를 한 번 읽어 준다(새 문자열 없이 표시 문구 재사용).
    private func announceForVoiceOver() {
        guard UIAccessibility.isVoiceOverRunning else { return }
        let message = AppConfig.loc("오늘의 운세와 기운을 확인해보세요")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            UIAccessibility.post(notification: .announcement, argument: message)
        }
    }

    /// 탭 — 불꽃 탭으로 보내고 오늘의 기운을 자동으로 연다. 광고 호출은 그 화면의 몫.
    ///
    /// 오늘 몫은 여기서 소진한다(웹 FortuneToast.openFlame 과 같은 계약). 문은 이미
    /// 열어줬고 불꽃 탭의 오늘의 기운 카드는 그대로 남아 있으므로, 돌아왔을 때 같은
    /// 토스트가 또 내려오면 하루에 두 번 조르는 꼴이 된다.
    private func open() {
        SoundPlayer.shared.play(.select)
        Self.openedThisLaunch = true
        dismissedDate = GameStore.todayString()
        onOpen()
    }

    /// 닫기 — 이동 없이 닫고 오늘은 다시 뜨지 않는다.
    /// 퇴장 연출이 끝난 뒤 날짜를 찍는다(먼저 찍으면 canShow 가 즉시 false 라 연출이 잘린다).
    private func dismiss() {
        SoundPlayer.shared.play(.select)
        let today = GameStore.todayString()
        if reduceMotion {
            dismissedDate = today
            return
        }
        withAnimation(Anim.cardOverlayExit) { entered = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { dismissedDate = today }
    }
}
