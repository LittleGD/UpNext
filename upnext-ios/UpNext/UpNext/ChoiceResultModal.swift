//
//  ChoiceResultModal.swift
//  UpNext — 이벤트 선택 결과 모달 (웹 ChoiceResultModal 의 최소 포팅).
//
//  Phase 4-D (Track D, 피드백 35): DungeonView 안에 인라인이던 2.6s 결과 모달을
//  분리해 톤 색·모티프 아이콘·효과 칩(효과 하나에 칩 하나)·3s 카운트다운을 붙였다.
//  웹의 입자(aura) 레이어는 옮기지 않는다 (플랜: NO aura particle layer).
//
//  디자인 규칙: 카드/칩에 보더 없음, 아이콘을 박스에 넣지 않음. 위계는 배경 단계로.
//  칩은 배경 단계(bgSurface) 한 칸 아래, 텍스트만.
//

import SwiftUI

struct ChoiceResultModal: View {
    let text: String
    let chips: [String]
    let tone: ChoiceResultTone
    let motif: ChoiceResultMotif
    /// 자동 닫힘까지의 시간 (웹 autoMs 3000). 카운트다운 바가 이 길이로 줄어든다.
    var autoSeconds: Double = 3.0
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// 카운트다운 바 진행 (1 → 0). 타이머 자체는 호출자(DungeonView)가 돌린다 — 여기서는
    /// 표시만. reduceMotion 이면 바를 숨기되 닫힘 시점은 같다.
    @State private var progress: CGFloat = 1

    private var toneColor: Color { ChoiceResultTypes.toneColor(tone) }

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture { onDismiss() }
            VStack(spacing: 14) {
                PixelIcon(ChoiceResultTypes.icon(motif: motif, tone: tone), size: 28, color: toneColor)
                Text(text)
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if !chips.isEmpty {
                    // 효과 하나에 칩 하나. 줄바꿈되는 가로 흐름 — 칩 수는 많아야 대여섯 개라
                    // 단순 wrap 레이아웃으로 충분하다.
                    WrapChips(chips: chips, color: tone == .bane ? Color.accentSecondary : Color.textPrimary)
                        .accessibilityElement(children: .combine)
                }
                VStack(spacing: 8) {
                    if !reduceMotion {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.bgSurface)
                                Capsule().fill(toneColor.opacity(0.7))
                                    .frame(width: geo.size.width * progress)
                            }
                        }
                        .frame(height: 3)
                        .accessibilityHidden(true)
                    }
                    Button(AppConfig.loc("계속")) { onDismiss() }
                        .buttonStyle(.un(.primary))
                }
            }
            .padding(22)
            .frame(maxWidth: 320)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 18))
            .padding(.horizontal, 32)
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: autoSeconds)) { progress = 0 }
        }
    }
}

/// 칩 줄바꿈 레이아웃 — 배경 단계만, 보더 없음.
private struct WrapChips: View {
    let chips: [String]
    let color: Color

    var body: some View {
        ChoiceResultFlowLayout(spacing: 6) {
            ForEach(Array(chips.enumerated()), id: \.offset) { _, chip in
                Text(chip)
                    .typography(.caption)
                    .foregroundStyle(color)
                    .monospacedDigit()
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 6))
            }
        }
    }
}

/// 최소 flow 레이아웃 (iOS 16+ Layout). 칩이 폭을 넘치면 다음 줄로.
struct ChoiceResultFlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for sv in subviews {
            let sz = sv.sizeThatFits(.unspecified)
            if x > 0, x + sz.width > width {
                x = 0
                y += rowH + spacing
                rowH = 0
            }
            x += sz.width + spacing
            rowH = max(rowH, sz.height)
        }
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for sv in subviews {
            let sz = sv.sizeThatFits(.unspecified)
            if x > 0, x + sz.width > bounds.width {
                x = 0
                y += rowH + spacing
                rowH = 0
            }
            sv.place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + y),
                     proposal: ProposedViewSize(sz))
            x += sz.width + spacing
            rowH = max(rowH, sz.height)
        }
    }
}
