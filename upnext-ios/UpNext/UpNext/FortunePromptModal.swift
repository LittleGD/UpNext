//
//  FortunePromptModal.swift
//  UpNext — 앱 실행 진입 팝업 "오늘의 기운이 도착했어요".
//
//  웹 SyncProvider 의 모달 체인(업데이트 노트 → 오늘의 기운 팝업) iOS 대응.
//  MainShell 이 PatchNotesModal / ReviewPromptModal 과 같은 자리(루트 ZStack)에서
//  띄우고, 표시 조건·1회 게이팅도 MainShell 이 판단한다 (여기는 순수 표시 뷰).
//
//  원칙(FortuneCardView 와 동일):
//   - 광고는 사용자가 눌러야만 뜬다. 이 팝업도 "지금 열기" 를 눌러야 진행된다.
//   - 스킵 가능해야 한다 — "나중에" 는 그날 다시 묻지 않는다.
//   - 보상은 코스메틱(오늘의 카드·색·문구·명언)까지만.
//

import Combine
import SwiftUI

// MARK: - 자동 열기 신호 (MainShell → FortuneCardView 계약)

/// 진입 팝업에서 "지금 열기" 를 누른 사실을 불꽃 탭까지 전달하는 1회성 신호.
///
/// GameStore 를 거치지 않는 이유 — 오늘의 기운은 클라우드로 동기화하지 않는 로컬 상태이고
/// (Fortune.swift 주석), 이 신호는 *한 번의 탭에서 다음 화면까지* 만 살아 있으면 된다.
/// 앱 실행 수명 싱글턴이라 MainTabView 가 재생성돼도(로그아웃→로그인) 값이 유지된다.
///
/// 계약:
///  1. MainShell 이 "지금 열기" 를 받으면 `request()` → 탭을 `.record` 로 전환.
///  2. 불꽃 탭의 오늘의 기운 진입점(FortuneCardView)이 `consume()` 이 true 를 돌려주면
///     사용자가 카드를 직접 탭한 것과 똑같은 경로(광고 → 공개)를 실행한다.
///     `consume()` 은 1회성이라 두 번째 호출부터는 false — 중복 재생 걱정이 없다.
///  3. 관찰은 `@ObservedObject private var autoOpen = FortuneAutoOpen.shared` 로,
///     소비는 `onAppear`(이미 불꽃 탭에 있던 경우)와
///     `onChange(of: autoOpen.pending)`(다른 탭에서 전환해 온 경우) 양쪽에서.
final class FortuneAutoOpen: ObservableObject {
    static let shared = FortuneAutoOpen()
    private init() {}

    /// 대기 중인 자동 열기 요청. 소비되면 즉시 false 로 돌아간다.
    @Published private(set) var pending: Bool = false

    /// 이번 앱 실행에서 진입 팝업을 이미 띄웠는지 — "앱 실행당 1회" 게이트.
    /// 뷰 @State 로 두면 MainTabView 재생성 시 초기화돼 한 실행에 두 번 물어보게 된다.
    var askedThisLaunch: Bool = false

    /// 자동 열기 요청. (MainShell 의 "지금 열기")
    func request() { pending = true }

    /// 요청을 소비한다. 대기 중이었으면 true 를 돌려주고 신호를 내린다.
    func consume() -> Bool {
        guard pending else { return false }
        pending = false
        return true
    }
}

// MARK: - 진입 팝업

struct FortunePromptModal: View {
    /// "지금 열기" — 불꽃 탭으로 이동하고 오늘의 기운을 연다.
    let onConfirm: () -> Void
    /// "나중에" — 닫고 오늘은 다시 묻지 않는다.
    let onSkip: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var entered = false

    var body: some View {
        ZStack {
            // 백드롭 탭 = "나중에" — 스킵 경로를 하나로 유지한다(닫았는데 또 묻지 않도록).
            Color.black.opacity(0.75 * (entered ? 1 : 0))
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { dismiss(confirmed: false) }

            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    PixelIcon(.sparkle, size: 20, color: Color.accentPrimary)
                    Text("오늘의 기운이 도착했어요")
                        .typography(.heading)
                        .foregroundStyle(Color.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                }

                Text("광고를 보면 오늘의 카드와 색·문구·명언이 열려요")
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(spacing: 8) {
                    Button(AppConfig.loc("지금 열기")) { dismiss(confirmed: true) }
                        .buttonStyle(.un(.primary))

                    Button(AppConfig.loc("나중에")) { dismiss(confirmed: false) }
                        .buttonStyle(.un(.ghost))
                }
                .padding(.top, 4)
            }
            .padding(20)
            .frame(maxWidth: 380)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 18))
            .padding(.horizontal, 16)
            .scaleEffect(entered ? 1 : 0.96)
            .opacity(entered ? 1 : 0)
        }
        .accessibilityAddTraits(.isModal)
        .onAppear { runEnter() }
    }

    private func runEnter() {
        if reduceMotion { entered = true; return }
        withAnimation(Anim.cardOverlayEnter) { entered = true }
    }

    /// 어느 경로로 닫히든 콜백은 정확히 한 번 — 호출측(MainShell)이 "이미 물었음" 을
    /// 기록하므로 여기서 빠지면 팝업이 다시 뜬다(ReviewPromptModal 과 같은 규약).
    private func dismiss(confirmed: Bool) {
        SoundPlayer.shared.play(.select)
        withAnimation(Anim.cardOverlayExit) { entered = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if confirmed { onConfirm() } else { onSkip() }
        }
    }
}
