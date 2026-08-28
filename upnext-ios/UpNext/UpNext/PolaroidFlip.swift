//
//  PolaroidFlip.swift
//  UpNext — 폴라로이드 앞면↔뒷면 3D 플립.
//
//  웹 src/components/growth/PolaroidFlip.tsx 포팅.
//  - 가로 드래그로 직접 회전 (150px = 90°)
//  - release: ±90° 이상 또는 빠른 flick 으로 플립, 미달 시 0 으로 복귀
//  - 외부 onFlip prop 으로 버튼 트리거 가능
//

import SwiftUI

struct PolaroidFlip<Front: View, Back: View>: View {
    @Binding var flipped: Bool
    /// 드래그 플립 제스처 활성 여부. 기본 true — **앞면·뒷면 양쪽에서** 스와이프로 뒤집는다.
    /// (구 구현은 뒷면이면 무조건 제스처를 하위뷰로 넘겨, 뒷면 메모에서 앞면으로 돌아오는
    ///  스와이프가 영영 먹지 않았다. 이제 "수평 우세 드래그"만 잡아 메모 편집과 공존한다.)
    var enabled: Bool = true
    /// 드래그 플립이 실제로 시작될 때 1회 호출 — 호출부가 키보드를 내리는 데 쓴다.
    var onInteractionBegan: (() -> Void)?
    let front: () -> Front
    let back: () -> Back

    init(
        flipped: Binding<Bool>,
        enabled: Bool = true,
        onInteractionBegan: (() -> Void)? = nil,
        @ViewBuilder front: @escaping () -> Front,
        @ViewBuilder back: @escaping () -> Back
    ) {
        self._flipped = flipped
        self.enabled = enabled
        self.onInteractionBegan = onInteractionBegan
        self.front = front
        self.back = back
    }

    /// 플립 판정을 시작하기 위한 최소 수평 이동. 탭(0px)·세로 스크롤과 확실히 구분되는 값.
    private let hSlop: CGFloat = 14

    @State private var dragDeg: Double = 0
    @State private var dragging: Bool = false
    @State private var startTime: Date?

    private var baseRotation: Double { flipped ? 180 : 0 }
    private var effectiveRotation: Double { baseRotation + dragDeg }

    var body: some View {
        // 웹 PolaroidFlip 의 onPointerDown target.closest("textarea,input,button,…") passthrough
        // 근사 이식. iOS 엔 per-target bailout 이 없으므로 **제스처 성격**으로 구분한다:
        //   - 수평 우세 드래그(|dx| > |dy|, dx ≥ 14pt) → 플립. 카드를 넘기는 동작.
        //   - 탭 / 세로 드래그 / 짧은 이동 → 하위뷰(TextEditor·캔버스)로 통과. 편집·캐럿 이동.
        // 그래서 뒷면(메모)에서도 스와이프로 앞면에 돌아올 수 있다.
        //   핵심: `.gesture` 는 항상 부착하고 GestureMask 로만 게이트한다. if/else 로 제스처를
        //   붙였다 뗐다 하면 뷰 정체성이 바뀌어 하위 TextEditor 가 재생성 → 편집 진입 순간
        //   포커스가 소실되는 SwiftUI 함정에 빠진다(실측 확인).
        faces.gesture(flipGesture, including: enabled ? .all : .subviews)
    }

    private var faces: some View {
        ZStack {
            // Front
            front()
                .rotation3DEffect(.degrees(effectiveRotation), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
                .opacity(showFront ? 1 : 0)
                .allowsHitTesting(flipped ? false : true)
            // Back (180° offset)
            back()
                .rotation3DEffect(.degrees(effectiveRotation + 180), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
                .opacity(showFront ? 0 : 1)
                .allowsHitTesting(flipped ? true : false)
        }
    }

    private var flipGesture: some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { g in
                if !dragging {
                    // 수평 우세 판정 — 세로 드래그·짧은 이동은 하위뷰(메모 캐럿/선택) 몫으로 둔다.
                    guard abs(g.translation.width) >= hSlop,
                          abs(g.translation.width) > abs(g.translation.height) else { return }
                    dragging = true
                    startTime = Date()
                    onInteractionBegan?()   // 메모 키보드 내리기 등
                }
                dragDeg = (g.translation.width / 150) * 90
            }
            .onEnded { g in
                // 플립 드래그로 승격되지 않은 터치(탭·세로 드래그)는 아무것도 하지 않는다.
                guard dragging else { dragDeg = 0; return }
                let elapsed = Date().timeIntervalSince(startTime ?? Date())
                let velocity = elapsed > 0 ? Double(g.translation.width) / elapsed : 0
                // 웹 수치 파리티 — flick 임계값 1.8px/ms(=1800px/s, 터치). 웹 PolaroidFlip.tsx:133
                //   isTouch ? 1.8 : 1.5. iOS 는 터치 전용이므로 1800px/s 로 맞춘다(구 1500 은
                //   마우스 값이라 120Hz 기기에서 flick 이 과민 트리거되던 웹 회귀와 동일 방향의 오차).
                let flickFast = abs(velocity) > 1800  // px/s (웹 1.8px/ms 터치)
                let passedAngle = abs(dragDeg) > 90
                let sameDir = (velocity > 0) == (dragDeg > 0)

                if passedAngle || (flickFast && sameDir && abs(dragDeg) > 30) {
                    // P3(c) 과회전("빙글빙글") 수정. 기존엔 `withAnimation{ dragDeg=0; flipped.toggle() }`
                    //   로 base(즉시 +180 점프)와 dragDeg(스프링)를 동시에 바꿔, effectiveRotation
                    //   = base+drag 가 시작 프레임에 +180 얹혀 ~270°까지 과회전 후 복귀했다.
                    //   대신: (1) 비애니 트랜잭션으로 flipped 를 토글하되 dragDeg 를 즉시 보정해
                    //   effectiveRotation 을 연속(=release 각) 유지 → 점프 제거, (2) 그 다음
                    //   dragDeg 를 스프링으로 0 까지 애니 → 목표각까지 단일 연속 회전.
                    let currentEff = effectiveRotation
                    let newBase: Double = flipped ? 0 : 180   // 토글 후의 baseRotation
                    var tx = Transaction()
                    tx.disablesAnimations = true
                    withTransaction(tx) {
                        flipped.toggle()
                        dragDeg = currentEff - newBase   // eff = newBase + dragDeg = currentEff (연속)
                    }
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) {
                        dragDeg = 0
                    }
                } else {
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) {
                        dragDeg = 0
                    }
                }
                dragging = false
            }
    }

    /// 현재 효과적 회전이 90~270° 범위면 뒷면이 보임 (백페이스 컬링 효과).
    private var showFront: Bool {
        let r = ((effectiveRotation.truncatingRemainder(dividingBy: 360)) + 360)
            .truncatingRemainder(dividingBy: 360)
        return r < 90 || r > 270
    }
}
