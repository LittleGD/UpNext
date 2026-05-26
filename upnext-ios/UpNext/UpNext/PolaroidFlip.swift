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
    @ViewBuilder let front: () -> Front
    @ViewBuilder let back: () -> Back

    @State private var dragDeg: Double = 0
    @State private var dragging: Bool = false
    @State private var startTime: Date?

    private var baseRotation: Double { flipped ? 180 : 0 }
    private var effectiveRotation: Double { baseRotation + dragDeg }

    var body: some View {
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
        .gesture(
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
                    let flickFast = abs(velocity) > 1500  // px/s
                    let passedAngle = abs(dragDeg) > 90
                    let sameDir = (velocity > 0) == (dragDeg > 0)

                    if passedAngle || (flickFast && sameDir && abs(dragDeg) > 30) {
                        withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) {
                            dragDeg = 0
                            flipped.toggle()
                        }
                    } else {
                        withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) {
                            dragDeg = 0
                        }
                    }
                    dragging = false
                }
        )
    }

    /// 현재 효과적 회전이 90~270° 범위면 뒷면이 보임 (백페이스 컬링 효과).
    private var showFront: Bool {
        let r = ((effectiveRotation.truncatingRemainder(dividingBy: 360)) + 360)
            .truncatingRemainder(dividingBy: 360)
        return r < 90 || r > 270
    }
}
