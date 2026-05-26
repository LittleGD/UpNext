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

    var body: some View {
        if reduceMotion || !enabled {
            content()
        } else {
            tiltView
        }
    }

    private var tiltView: some View {
        GeometryReader { geo in
            ZStack {
                content()
                // 스펙큘러 반사광 — 기울기에 따라 이동
                LinearGradient(
                    colors: [.clear, Color.white.opacity(0.20), Color.white.opacity(0.06), .clear],
                    startPoint: UnitPoint(x: specularX, y: specularY),
                    endPoint: UnitPoint(x: 1 - specularX, y: 1 - specularY)
                )
                .blendMode(.screen)
                .allowsHitTesting(false)
            }
            .rotation3DEffect(.degrees(rotX), axis: (x: 1, y: 0, z: 0), perspective: 0.8)
            .rotation3DEffect(.degrees(rotY), axis: (x: 0, y: 1, z: 0), perspective: 0.8)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        dragging = true
                        let nx = Double((g.location.x - geo.size.width / 2) / (geo.size.width / 2))
                        let ny = Double((g.location.y - geo.size.height / 2) / (geo.size.height / 2))
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
