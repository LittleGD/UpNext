//
//  ReviewPromptModal.swift
//  UpNext — 앱 평가 요청 모달 (챌린지 2일차 1회).
//
//  웹 src/components/ReviewPromptModal.tsx 대응. 3단계 — 물어보기 → (좋아요)
//  App Store 리뷰 / (아쉬워요) 객관식 피드백 → 감사. 만족한 사용자만 공개 별점으로
//  보내고, 아쉬운 쪽은 우리에게 직접 말하게 한다.
//
//  onDismiss 는 어느 경로로 닫히든 정확히 한 번 호출된다 — 호출측(MainShell)이
//  "이미 띄웠음"을 기록하므로 여기서 빠지면 모달이 매번 다시 뜬다.
//

import SwiftUI

struct ReviewPromptModal: View {
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.openURL) private var openURL
    @State private var entered = false
    @State private var step: Step = .ask
    @State private var selected: Set<ReviewPromptService.Reason> = []
    @State private var comment = ""
    @State private var sending = false
    @State private var errorText: String?

    private enum Step { case ask, feedback, thanks }

    var body: some View {
        ZStack {
            Color.black.opacity(0.75 * (entered ? 1 : 0))
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { dismiss() }

            VStack(alignment: .leading, spacing: 14) {
                switch step {
                case .ask:      askStep
                case .feedback: feedbackStep
                case .thanks:   thanksStep
                }
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

    // MARK: - 1단계: 물어보기

    private var askStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("챌린지, 잘 맞으세요?")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Text("이틀째 챌린지를 해내셨네요. 지금 UpNext 는 어떠신가요?")
                .typography(.body)
                .foregroundStyle(Color.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 8) {
                Button(AppConfig.loc("재밌어요! 별점 남기기")) {
                    openURL(ReviewPromptService.writeReviewURL)
                    dismiss()
                }
                .buttonStyle(.un(.primary))

                Button(AppConfig.loc("아쉬운 점이 있어요")) {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) {
                        step = .feedback
                    }
                }
                .buttonStyle(.un(.secondary))

                Button(AppConfig.loc("나중에")) { dismiss() }
                    .buttonStyle(.un(.ghost))
            }
            .padding(.top, 4)
        }
    }

    // MARK: - 2단계: 객관식 피드백

    private var feedbackStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("어떤 점이 아쉬우셨나요?")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Text("해당하는 걸 모두 골라 주세요. 남겨 주신 의견은 개발자가 직접 읽어요.")
                .typography(.caption)
                .foregroundStyle(Color.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            reasonChips

            // 자유 서술 — 500자 제한은 Firestore 규칙과 동일.
            TextEditor(text: $comment)
                .typography(.caption)
                .foregroundStyle(Color.textPrimary)
                .scrollContentBackground(.hidden)
                .frame(height: 72)
                .padding(8)
                .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 10))
                .onChange(of: comment) { newValue in
                    if newValue.count > 500 { comment = String(newValue.prefix(500)) }
                }
                .accessibilityLabel(Text("더 하고 싶은 말이 있다면 자유롭게 적어 주세요"))

            if let errorText {
                Text(errorText)
                    .typography(.caption)
                    .foregroundStyle(Color.accentSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 8) {
                Button(sending ? AppConfig.loc("보내는 중...") : AppConfig.loc("보내기")) {
                    Task { await send() }
                }
                .buttonStyle(.un(.primary))
                .disabled(sending || (selected.isEmpty && comment.trimmed.isEmpty))

                Button(AppConfig.loc("나중에")) { dismiss() }
                    .buttonStyle(.un(.ghost))
            }
        }
    }

    /// 사유 칩 — 선택 시 accentPrimary 로 채운다. 보더 없음(디자인 규칙).
    private var reasonChips: some View {
        FlowChips(items: ReviewPromptService.Reason.allCases) { reason in
            let on = selected.contains(reason)
            Button {
                if on { selected.remove(reason) } else { selected.insert(reason) }
            } label: {
                Text(reason.label)
                    .typography(.caption)
                    .foregroundStyle(on ? Color.bgPrimary : Color.textPrimary)
                    .padding(.horizontal, 12)
                    .frame(height: 36)
                    .background(on ? Color.accentPrimary : Color.bgElevated,
                                in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(on ? .isSelected : [])
        }
    }

    // MARK: - 3단계: 감사

    private var thanksStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("고맙습니다")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Text("보내 주신 의견을 바탕으로 다음 업데이트를 준비할게요.")
                .typography(.body)
                .foregroundStyle(Color.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Button(AppConfig.loc("닫기")) { dismiss() }
                .buttonStyle(.un(.primary))
                .padding(.top, 4)
        }
    }

    // MARK: - 액션

    private func send() async {
        sending = true
        errorText = nil
        let result = await ReviewPromptService.submitFeedback(
            reasons: Array(selected), comment: comment)
        sending = false
        switch result {
        case .success:
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) { step = .thanks }
        case .signedOut:
            errorText = AppConfig.loc("의견을 보내려면 로그인이 필요해요.")
        case .failed:
            errorText = AppConfig.loc("전송에 실패했어요. 잠시 후 다시 시도해 주세요.")
        }
    }

    private func runEnter() {
        if reduceMotion { entered = true; return }
        withAnimation(Anim.cardOverlayEnter) { entered = true }
    }

    private func dismiss() {
        withAnimation(Anim.cardOverlayExit) { entered = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { onDismiss() }
    }
}

/// 칩을 좌측 정렬로 흘려 배치. iOS 16 의 Layout 없이도 동작하도록 단순 래핑 구현.
private struct FlowChips<Item: Identifiable, Content: View>: View {
    let items: [Item]
    @ViewBuilder let content: (Item) -> Content

    var body: some View {
        // 2열 고정 — 사유가 6종이라 3행이면 충분하고, 폭 계산 없이 레이아웃이 안정적이다.
        let rows = stride(from: 0, to: items.count, by: 2).map { start in
            Array(items[start..<min(start + 2, items.count)])
        }
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 8) {
                    ForEach(row) { content($0) }
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
