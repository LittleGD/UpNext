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
    /// 드래그 플립 제스처 활성 여부. 웹 PolaroidFlip 의 onPointerDown 은 `textarea/input/
    /// button` 위 터치면 드래그 진입을 아예 안 한다(target.closest passthrough). iOS 는
    /// 그 예외를 외부 플래그로 근사 이식 — 뒷면 메모 편집 중(enabled == false)엔 제스처를
    /// 통째로 떼어, 메모 영역 터치가 의도치 않은 플립/포커스 탈취를 일으키지 않게 한다.
    var enabled: Bool = true
    let front: () -> Front
    let back: () -> Back

    init(
        flipped: Binding<Bool>,
        enabled: Bool = true,
        @ViewBuilder front: @escaping () -> Front,
        @ViewBuilder back: @escaping () -> Back
    ) {
        self._flipped = flipped
        self.enabled = enabled
        self.front = front
        self.back = back
    }

    @State private var dragDeg: Double = 0
    @State private var dragging: Bool = false
    @State private var startTime: Date?

    private var baseRotation: Double { flipped ? 180 : 0 }
    private var effectiveRotation: Double { baseRotation + dragDeg }

    var body: some View {
        // 웹 PolaroidFlip 의 onPointerDown target.closest("textarea,input,button,…") passthrough
        // 근사 이식. iOS 는 per-target bailout 이 없으므로, "메모(뒷면)가 보이거나(flipped)
        // 편집 중(enabled==false)"이면 드래그 플립을 하위뷰(TextEditor)로 양보한다.
        //   핵심: `.gesture` 는 항상 부착하고 GestureMask 로만 게이트한다. if/else 로 제스처를
        //   붙였다 뗐다 하면 뷰 정체성이 바뀌어 하위 TextEditor 가 재생성 → 편집 진입 순간
        //   포커스가 소실되는 SwiftUI 함정에 빠진다(실측 확인). mask 만 바꾸면 정체성이 유지돼
        //   포커스가 살아있고, `.subviews` 는 이 제스처를 무력화하고 하위뷰 이벤트를 통과시킨다.
        //   - 뒷면(flipped): 텍스트 탭이 TextEditor 로 전달돼 편집 진입 + 의도치 않은 플립 방지.
        //     (뒷면→앞면 복귀는 "View Photo" 버튼. 웹도 textarea 위 드래그는 플립 안 됨.)
        //   - 앞면(!flipped, !editing): 정상 드래그 플립.
        faces.gesture(flipGesture, including: (enabled && !flipped) ? .all : .subviews)
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
                    dragging = true
                    startTime = Date()
                }
                dragDeg = (g.translation.width / 150) * 90
            }
            .onEnded { g in
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
