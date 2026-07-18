//
//  PolaroidTilt.swift
//  UpNext — 폴라로이드 3D 틸트 래퍼 (포인터 추적 + 자이로스코프).
//
//  웹 src/components/growth/PolaroidTilt.tsx 포팅.
//  - 드래그(터치): 손가락 위치로 ±15° rotateX/rotateY
//  - 자이로(CoreMotion): 디바이스 기울임으로 ±15° (포인터 활성 시 무시)
//  - 스프링 보간 (response 0.34, damping 0.7)
//  - 반사광(스펙큘러) — 기울기에 따라 white sheen 이동
//  - autoHint: mount 후 살짝 wiggle (1.1s)
//  - reduce-motion: 모두 비활성 (children passthrough)
//

import SwiftUI
import CoreMotion

/// content() 의 실제 렌더 크기를 위로 전달하는 PreferenceKey (09-polaroid-gloss).
private struct PolaroidSizeKey: PreferenceKey {
    static var defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) { value = nextValue() }
}

struct PolaroidTilt<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var enabled: Bool = true
    var autoHint: Bool = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var rotX: Double = 0
    @State private var rotY: Double = 0
    @State private var dragging: Bool = false
    @State private var motion = CMMotionManager()
    @State private var neutralPitch: Double?
    /// content() 의 실제 렌더 크기 — 드래그 제스처의 nx/ny 정규화에만 쓴다.
    /// (구 구현은 GeometryReader 로 읽었으나, 그 GeometryReader 가 레이아웃 트리에
    ///  flexible view 로 끼어들어 세로 잔여 공간을 흡수 → 글로스가 카드보다 큰 박스를
    ///  채우며 정렬이 깨지던 오이식(09-polaroid-gloss). 이제 크기만 preference 로 읽는다.)
    @State private var cardSize: CGSize = .zero

    var body: some View {
        if reduceMotion || !enabled {
            content()
        } else {
            tiltView
        }
    }

    // 09-polaroid-gloss: GeometryReader 를 레이아웃에 끼우지 않고 `.background` 로 크기만 읽고,
    // 글로스는 `content()` 에 `.overlay` 로 얹는다(overlay 는 base view 실제 렌더 크기를 따라감
    // = 웹의 `absolute inset-0` 시맨틱). 이러면 PhotoDetailModal/PhotoCaptureModal 양쪽 호출부
    // (`.frame(maxWidth:)` 만 주고 높이 미지정)에서 카드가 실제 콘텐츠 크기로 레이아웃된다.
    private var tiltView: some View {
        content()
            .background(
                GeometryReader { geo in
                    Color.clear
                        .preference(key: PolaroidSizeKey.self, value: geo.size)
                }
            )
            .onPreferenceChange(PolaroidSizeKey.self) { cardSize = $0 }
            .overlay(
                // 스펙큘러 반사광 — 기울기에 따라 이동. 카드 실제 크기에만 얹혀 여백으로 안 번짐.
                LinearGradient(
                    colors: [.clear, Color.white.opacity(0.20), Color.white.opacity(0.06), .clear],
                    startPoint: UnitPoint(x: specularX, y: specularY),
                    endPoint: UnitPoint(x: 1 - specularX, y: 1 - specularY)
                )
                .blendMode(.screen)
                .allowsHitTesting(false)
                .clipShape(RoundedRectangle(cornerRadius: 4))   // 카드 코너와 정합 (웹 rounded-sm 대응, 누락분 보강)
            )
            .rotation3DEffect(.degrees(rotX), axis: (x: 1, y: 0, z: 0), perspective: 0.8)
            .rotation3DEffect(.degrees(rotY), axis: (x: 0, y: 1, z: 0), perspective: 0.8)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        dragging = true
                        let size = cardSize == .zero ? CGSize(width: 300, height: 363) : cardSize
                        let nx = Double((g.location.x - size.width / 2) / (size.width / 2))
                        let ny = Double((g.location.y - size.height / 2) / (size.height / 2))
                        withAnimation(.spring(response: 0.34, dampingFraction: 0.7)) {
                            rotY = max(-15, min(15, nx * 15))
                            rotX = max(-15, min(15, -ny * 15))
                        }
                    }
                    .onEnded { _ in
                        dragging = false
                        withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                            rotX = 0
                            rotY = 0
                        }
                    }
            )
            .onAppear {
                if autoHint { runAutoHint() }
                startGyro()
            }
            .onDisappear {
                motion.stopDeviceMotionUpdates()
            }
    }

    private var specularX: Double {
        // -15..15 → 0.85..0.35 (좌우 반대 방향 spike)
        0.85 - ((rotY + 15) / 30) * 0.5
    }
    private var specularY: Double {
        0.85 - ((rotX + 15) / 30) * 0.5
    }

    private func runAutoHint() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.7)) {
                rotX = -6
                rotY = 8
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.7)) {
                rotX = 4
                rotY = -5
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                rotX = 0
                rotY = 0
            }
        }
    }

    private func startGyro() {
        guard motion.isDeviceMotionAvailable else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 60.0
        motion.startDeviceMotionUpdates(to: .main) { data, _ in
            guard let d = data, !dragging else { return }
            let pitch = d.attitude.pitch
            let roll = d.attitude.roll
            if neutralPitch == nil { neutralPitch = pitch }
            let dPitch = pitch - (neutralPitch ?? pitch)
            // pitch/roll 은 라디안 — 도로 변환 후 ×0.4
            let degPitch = dPitch * 180.0 / .pi * 0.4
            let degRoll = roll * 180.0 / .pi * 0.4
            withAnimation(.spring(response: 0.34, dampingFraction: 0.7)) {
                rotX = max(-15, min(15, -degPitch))
                rotY = max(-15, min(15, degRoll))
            }
        }
    }
}
