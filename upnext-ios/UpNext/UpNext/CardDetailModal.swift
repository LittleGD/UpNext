//
//  CardDetailModal.swift
//  UpNext — 카드 상세 모달 + 3D 카드 뷰어 (R4 — UI/인터랙션 회복).
//
//  웹 components/cards/Card3DViewer.tsx + CardDetailModal.tsx 포팅.
//  컬렉션에서 해금 카드를 탭하면 뜨며, 드래그 + 자이로로 카드를 3D 기울일 수 있다.
//
//  R4 추가:
//   - 자이로 틸트 — CMMotionManager. 웹 useGyroscope + 합성 (드래그 중엔 자이로 0,
//     아니면 자이로 tilt). 웹 Card3DViewer L:114-127 의 combinedX/Y 로직 동치.
//   - 등급 backdrop — RarityBackdrop 를 카드 뒤에 배치 (웹 RarityBackdrop.tsx).
//

import SwiftUI
import CoreMotion
import Combine

// MARK: - 자이로 틸트 (CMMotionManager → 0~±12° attitude)

/// 디바이스 attitude(roll/pitch)를 카드 3D 틸트 각도로. 웹 useGyroscope 등가.
/// 드래그 중이 아닐 때만 적용 (Card3DView 가 dragging 으로 분기).
@MainActor
final class CardGyro: ObservableObject {
    @Published var tiltX: Double = 0   // pitch 유래 (앞뒤 기울기)
    @Published var tiltY: Double = 0   // roll 유래 (좌우 기울기)
    private let manager = CMMotionManager()
    private let maxTilt: Double = 12   // 자이로 기여 최대 각도

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 60.0
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let m = motion else { return }
            let rollDeg = m.attitude.roll * 180 / .pi
            let pitchDeg = m.attitude.pitch * 180 / .pi
            // 0.5 계수 — attitude 변화를 절제된 카드 틸트로 (웹 gyro 스케일 근사).
            self.tiltY = max(-self.maxTilt, min(self.maxTilt, rollDeg * 0.5))
            self.tiltX = max(-self.maxTilt, min(self.maxTilt, -pitchDeg * 0.5))
        }
    }

    func stop() { manager.stopDeviceMotionUpdates() }
}

// MARK: - 3D 카드 뷰어

/// TCG 비율(5:7) 카드. 드래그/자이로로 3D 기울고, 놓으면 스프링 복귀.
struct Card3DView: View {
    let card: ChallengeCard
    @StateObject private var gyro = CardGyro()
    @State private var drag: CGSize = .zero
    @State private var dragging = false

    /// 드래그 → 회전 각도 변환 계수 (216pt 드래그 = 18°).
    private let rotationDivisor: Double = 12
    private let dragClamp: CGFloat = 216

    var body: some View {
        // 합성 — 웹 combinedX/Y (L:114-127): 드래그 중엔 자이로 0, 아니면 자이로 tilt 가산.
        let rotY = Double(drag.width) / rotationDivisor + (dragging ? 0 : gyro.tiltY)
        let rotX = Double(-drag.height) / rotationDivisor + (dragging ? 0 : gyro.tiltX)
        cardFace
            .rotation3DEffect(.degrees(rotY), axis: (x: 0, y: 1, z: 0))
            .rotation3DEffect(.degrees(rotX), axis: (x: 1, y: 0, z: 0))
            .animation(.easeOut(duration: 0.18), value: gyro.tiltY)
            .animation(.easeOut(duration: 0.18), value: gyro.tiltX)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        dragging = true
                        drag = CGSize(
                            width: value.translation.width.clamped(to: -dragClamp...dragClamp),
                            height: value.translation.height.clamped(to: -dragClamp...dragClamp))
                    }
                    .onEnded { _ in
                        withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) {
                            drag = .zero
                        }
                        dragging = false
                    }
            )
            .onAppear { gyro.start() }
            .onDisappear { gyro.stop() }
    }

    private var cardFace: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                PixelIcon(card.category.pixelIcon, size: 30, color: card.rarity.color)
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
            // 등급 분위기 — 카드 뒤 (웹 RarityBackdrop). 카드보다 z 아래.
            RarityBackdrop(rarity: card.rarity)
                .ignoresSafeArea()
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
