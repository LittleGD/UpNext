//
//  CardDetailModal.swift
//  UpNext — 카드 상세 모달 + 3D 카드 뷰어 (Phase 4 슬라이스 12).
//
//  웹 components/cards/Card3DViewer.tsx + CardDetailModal.tsx 포팅.
//  컬렉션에서 해금 카드를 탭하면 sheet 로 뜨며, 드래그로 카드를 3D 기울일 수 있다.
//
//  웹의 자이로 틸트·홀로그래픽 오버레이·인용문(quotePool)은 condensed —
//  드래그 회전 + 등급 글로우만 (기능적 포팅, 연출 폴리시는 이후).
//

import SwiftUI

// MARK: - 3D 카드 뷰어

/// TCG 비율(5:7) 카드. 드래그하면 손가락을 따라 3D 로 기울고, 놓으면 스프링 복귀.
struct Card3DView: View {
    let card: ChallengeCard
    @State private var drag: CGSize = .zero

    /// 드래그 → 회전 각도 변환 계수 (216pt 드래그 = 18°).
    private let rotationDivisor: Double = 12
    private let dragClamp: CGFloat = 216

    var body: some View {
        cardFace
            .rotation3DEffect(.degrees(Double(drag.width) / rotationDivisor),
                              axis: (x: 0, y: 1, z: 0))
            .rotation3DEffect(.degrees(Double(-drag.height) / rotationDivisor),
                              axis: (x: 1, y: 0, z: 0))
            .gesture(
                DragGesture()
                    .onChanged { value in
                        drag = CGSize(
                            width: value.translation.width.clamped(to: -dragClamp...dragClamp),
                            height: value.translation.height.clamped(to: -dragClamp...dragClamp))
                    }
                    .onEnded { _ in
                        withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) {
                            drag = .zero
                        }
                    }
            )
    }

    private var cardFace: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image(systemName: card.category.icon)
                    .font(.system(size: 30))
                    .foregroundStyle(card.rarity.color)
                Spacer()
                Text(card.rarity.displayName)
                    .typography(.micro)
                    .foregroundStyle(Color.bgPrimary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(card.rarity.color, in: Capsule())
            }

            Text(card.title)
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
                .padding(.top, 24)
            Text(card.category.label)
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
                .padding(.top, 6)
            Text(card.description)
                .typography(.body)
                .foregroundStyle(Color.textSecondary)
                .padding(.top, 12)

            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
        .frame(width: 280, height: 392)  // TCG 5:7 비율
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
        .shadow(color: card.rarity.color.opacity(0.35), radius: 22, y: 10)
    }
}

// MARK: - 상세 모달

/// 컬렉션 카드 탭 시 뜨는 상세 sheet — 3D 카드 뷰어를 담는다.
struct CardDetailModal: View {
    let card: ChallengeCard
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            VStack(spacing: 20) {
                Spacer()
                Card3DView(card: card)
                Text("드래그해서 카드를 기울여 보세요")
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                Spacer()
                Button("닫기") { dismiss() }
                    .typography(.body)
                    .foregroundStyle(Color.accentPrimary)
            }
            .padding(.vertical, 24)
        }
    }
}

private extension Comparable {
    /// 값을 범위 안으로 클램프.
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
