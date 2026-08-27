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
        // reduceMotion 은 런타임에 토글되지 않으므로 구조 분기를 둬도 포커스 소실 위험이 없다.
        // 반면 `enabled`(호출부의 flipped/편집 상태)는 런타임에 바뀌므로, 이걸 구조 분기(if !enabled
        // { content() })로 두면 하위 TextEditor 가 재생성돼 포커스가 날아간다. 따라서 enabled 는
        // 구조를 바꾸지 않고 tiltView 내부에서 제스처 mask·회전값만 게이트한다(웹 target.closest
        // passthrough 근사 — 메모/textarea 면에선 틸트를 하위뷰로 양보).
        if reduceMotion {
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
            // enabled==false(메모 면)면 회전을 중립(0)으로 렌더해 카드를 평평하게 두고,
            // 제스처는 GestureMask(.subviews)로 하위뷰(TextEditor)에 양보한다.
            .rotation3DEffect(.degrees(enabled ? rotX : 0), axis: (x: 1, y: 0, z: 0), perspective: 0.8)
            .rotation3DEffect(.degrees(enabled ? rotY : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.8)
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
                    },
                including: enabled ? .all : .subviews
            )
            .onAppear {
                guard enabled else { return }
                if autoHint { runAutoHint() }
                startGyro()
            }
            // enabled 가 런타임에 바뀌면(앞↔뒤 플립 등) 자이로도 같이 켜고 끈다.
            //   구 구현은 onAppear 에서 무조건 startGyro() 라 enabled=false 여도
            //   CMMotionManager 가 60Hz 로 계속 돌며 매 프레임 withAnimation(.spring) 을
            //   호출했다(회전은 0 으로 렌더돼 화면엔 안 보이지만 배터리·CPU 는 그대로 소모).
            .onChange(of: enabled) { on in
                if on {
                    startGyro()
                } else {
                    motion.stopDeviceMotionUpdates()
                    neutralPitch = nil
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                        rotX = 0; rotY = 0
                    }
                }
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
        guard enabled, motion.isDeviceMotionAvailable else { return }
        guard !motion.isDeviceMotionActive else { return }   // 중복 start 방지
        motion.deviceMotionUpdateInterval = 1.0 / 60.0
        motion.startDeviceMotionUpdates(to: .main) { data, _ in
            // enabled 가 꺼진 뒤 도착한 늦은 콜백은 무시(정지 요청과 레이스).
            guard enabled, let d = data, !dragging else { return }
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
