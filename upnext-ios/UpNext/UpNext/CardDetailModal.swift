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
    // 첫 샘플을 기준(0°)으로 잡기 위한 캘리브레이션 저장 — 웹 useGyroscope.ts:45,84-93 이식.
    private var neutralRoll: Double?
    private var neutralPitch: Double?

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        // 매 start() 마다 기준값 리셋 — 웹 useGyroscope.ts:63-65/111/123 의 initialRef=null 재설정과 동치.
        neutralRoll = nil
        neutralPitch = nil
        manager.deviceMotionUpdateInterval = 1.0 / 60.0
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let m = motion else { return }
            let rollDeg = m.attitude.roll * 180 / .pi
            let pitchDeg = m.attitude.pitch * 180 / .pi
            // 첫 샘플을 기준(0°)으로 잡고 이후는 델타만 반영 — 웹 useGyroscope.ts:84-93 과 동치.
            // (구 구현은 attitude 절대값을 직접 매핑해, 기기를 손에 든 자연 자세에서도 카드가
            //  이미 크게 기울어 보이던 미이식 갭. PolaroidTilt 의 neutral 캡처 패턴과 통일.)
            if self.neutralRoll == nil { self.neutralRoll = rollDeg }
            if self.neutralPitch == nil { self.neutralPitch = pitchDeg }
            let dRoll = rollDeg - (self.neutralRoll ?? rollDeg)
            let dPitch = pitchDeg - (self.neutralPitch ?? pitchDeg)
            // 0.5 계수 — attitude 변화를 절제된 카드 틸트로 (웹 gyro 스케일 근사).
            self.tiltY = max(-self.maxTilt, min(self.maxTilt, dRoll * 0.5))
            self.tiltX = max(-self.maxTilt, min(self.maxTilt, -dPitch * 0.5))
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        // 방어적 재캘리브레이션 — 다음 start() 에서 다시 첫 샘플을 기준으로 잡도록.
        neutralRoll = nil
        neutralPitch = nil
    }
}

// MARK: - 3D 카드 뷰어

/// TCG 비율(5:7) 카드. 드래그/자이로로 3D 기울고, 놓으면 스프링 복귀.
struct Card3DView: View {
    let card: ChallengeCard
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.locale) private var locale
    @StateObject private var gyro = CardGyro()
    @State private var drag: CGSize = .zero
    @State private var dragging = false

    /// 드래그 → 회전 각도 변환 계수 (216pt 드래그 = 18°).
    private let rotationDivisor: Double = 12
    private let dragClamp: CGFloat = 216

    var body: some View {
        // 합성 — 웹 combinedX/Y (L:114-127): 드래그 중엔 자이로 0, 아니면 자이로 tilt 가산.
        let dragY = reduceMotion ? 0 : Double(drag.width) / rotationDivisor
        let dragX = reduceMotion ? 0 : Double(-drag.height) / rotationDivisor
        let gyroY = reduceMotion || dragging ? 0 : gyro.tiltY
        let gyroX = reduceMotion || dragging ? 0 : gyro.tiltX
        let rotY = dragY + gyroY
        let rotX = dragX + gyroX
        cardFace
            .rotation3DEffect(.degrees(rotY), axis: (x: 0, y: 1, z: 0))
            .rotation3DEffect(.degrees(rotX), axis: (x: 1, y: 0, z: 0))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: gyro.tiltY)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: gyro.tiltX)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        guard !reduceMotion else { return }
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
            .onAppear { if !reduceMotion { gyro.start() } }
            .onDisappear { gyro.stop() }
    }

    private var cardFace: some View {
        // R8 — 콘텐츠 3-zone 패럴럭스: 제목 = 깊이 8 (가장 가까움) / 설명 = 4 / 보더 = 0.
        //   tilt 각도에 따라 inner zone 이 약간씩 다르게 움직여 z-depth 입체감을 만든다.
        let depthMul: Double = 0.6
        let titleOffsetX = reduceMotion ? 0 : Double(drag.width) / rotationDivisor * depthMul * 0.8
        let titleOffsetY = reduceMotion ? 0 : Double(-drag.height) / rotationDivisor * depthMul * 0.8
        let descOffsetX = reduceMotion ? 0 : Double(drag.width) / rotationDivisor * depthMul * 0.4
        let descOffsetY = reduceMotion ? 0 : Double(-drag.height) / rotationDivisor * depthMul * 0.4

        return ZStack(alignment: .topLeading) {
            // 카드 베이스
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

                Text(card.localizedTitle(.current))
                    .typography(.heading)
                    .foregroundStyle(Color.textPrimary)
                    .padding(.top, 24)
                    .offset(x: titleOffsetX, y: titleOffsetY)
                Text(card.category.label)
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .padding(.top, 6)
                    .offset(x: descOffsetX, y: descOffsetY)
                Text(card.localizedDescription(.current))
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
                    .padding(.top, 12)
                    .offset(x: descOffsetX, y: descOffsetY)

                Spacer(minLength: 12)

                // 인용문 zone (웹 getCardQuote footer) — 카테고리별 명언, italic + opacity 60.
                // 더 깊은 패럴럭스(quoteZ) — desc 보다 약간 더 이동해 3-zone 깊이감.
                Text(QuotePool.quote(for: card, lang: locale.language.languageCode?.identifier ?? "ko"))
                    .typography(.caption)
                    .italic()
                    .foregroundStyle(Color.textTertiary.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
                    .offset(x: descOffsetX * 1.4, y: descOffsetY * 1.4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)

            // RarityTexture 표면 (등급 패턴)
            RarityTexture(rarity: card.rarity, cornerRadius: 16)
                .allowsHitTesting(false)

            // 홀로그래픽 글레어 — 웹 Card3DViewer 처럼 normal 외 모든 등급(rare/unique/legend).
            // conic 색은 등급색 단일 hue (HolographicGlare 가 rarityColor 로 생성).
            if card.rarity != .normal {
                HolographicGlare(
                    rotateX: reduceMotion ? 0 : Double(-drag.height) / rotationDivisor + (dragging ? 0 : gyro.tiltX),
                    rotateY: reduceMotion ? 0 : Double(drag.width) / rotationDivisor + (dragging ? 0 : gyro.tiltY),
                    rarityColor: card.rarity.color,
                    cornerRadius: 16
                )
                .allowsHitTesting(false)
            }
        }
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
            // R8 — 백드롭 블러 (.ultraThinMaterial) 추가.
            Color.bgPrimary.opacity(0.95).ignoresSafeArea()
                .background(.ultraThinMaterial)

            // 등급 분위기 — 카드 뒤.
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
