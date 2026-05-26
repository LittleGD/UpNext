//
//  PhotoTalismanRitual.swift
//  UpNext — 사진→부적 변환 3초 의식.
//
//  웹 globals.css `uphero-ritual-photo` (3000ms forwards) + `uphero-ritual-glow` (3000ms linear) +
//  `uphero-ritual-spark` (2400ms forwards) 의 통합 포팅.
//
//  타임라인 3초:
//   0-1000ms: 사진 fade-in + scale 0.72→1 + subtle rotate
//   1000-2400ms: 사진 wobble (-5°↔5°) + spark 방사
//   2400-3000ms: 중앙 bright flash + fade-out + onDone(부적 생성)
//

import SwiftUI

struct PhotoTalismanRitual: View {
    let photoImage: UIImage?
    let onDone: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var startTime = Date()

    var body: some View {
        ZStack {
            Color.black.opacity(0.92).ignoresSafeArea()

            if reduceMotion {
                // 즉시 결과
                Text("부적 생성 완료").foregroundStyle(Color.accentPrimary)
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { onDone() }
                    }
            } else {
                TimelineView(.animation) { context in
                    let elapsed = context.date.timeIntervalSince(startTime)
                    let p = min(elapsed / 3.0, 1.0)

                    ZStack {
                        // 중앙 글로우 (3s linear)
                        Circle()
                            .fill(RadialGradient(
                                colors: [
                                    Color.accentPrimary.opacity(glowOpacity(p)),
                                    .clear
                                ],
                                center: .center, startRadius: 0, endRadius: 250
                            ))
                            .frame(width: 500, height: 500)

                        // 사진 본체 (3s)
                        photoLayer(progress: p)

                        // 스파크 8 (delay 600ms, duration 2400ms)
                        ForEach(0..<8, id: \.self) { i in
                            let angle = Double(i) * (360.0/8.0)
                            sparkLayer(angle: angle, progress: p)
                        }
                    }
                }
                .onAppear {
                    startTime = Date()
                    SoundPlayer.shared.play(.ambientFloat)
                    Haptics.play(.medium)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                        Haptics.play(.success)
                        SoundPlayer.shared.play(.complete)
                        onDone()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func photoLayer(progress p: Double) -> some View {
        let opacity = photoOpacity(p)
        let scale = photoScale(p)
        let rot = photoRotation(p)
        Group {
            if let img = photoImage {
                Image(uiImage: img)
                    .resizable().scaledToFit()
                    .frame(width: 180, height: 240)
            } else {
                Rectangle().fill(Color.bgSurface).frame(width: 180, height: 240)
                    .overlay(PixelIcon(.image, size: 32, color: Color.textTertiary))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .shadow(color: Color.accentPrimary.opacity(0.5), radius: 16)
        .scaleEffect(scale)
        .rotationEffect(.degrees(rot))
        .opacity(opacity)
    }

    private func photoOpacity(_ p: Double) -> Double {
        if p < 0.18 { return p / 0.18 }
        if p < 0.90 { return 1 }
        return max(0, 1 - (p - 0.90) / 0.10)
    }

    private func photoScale(_ p: Double) -> Double {
        if p < 0.18 { return 0.72 + (1.0 - 0.72) * (p / 0.18) }
        if p < 0.90 {
            // wobble subtle scale 1↔1.04
            let local = (p - 0.18) / 0.72
            return 1.0 + 0.04 * sin(local * .pi * 3)
        }
        return 1.15 - 0.25 * ((p - 0.90) / 0.10)
    }

    private func photoRotation(_ p: Double) -> Double {
        if p < 0.18 { return -3.0 + 3.0 * (p / 0.18) }
        if p < 0.90 {
            let local = (p - 0.18) / 0.72
            // -5° ↔ 5° wobble
            return 5.0 * sin(local * .pi * 2)
        }
        return 0
    }

    private func glowOpacity(_ p: Double) -> Double {
        if p < 0.20 { return 0.3 * (p / 0.20) }
        if p < 0.70 { return 0.3 + 0.2 * ((p - 0.20) / 0.50) }
        if p < 0.90 { return 0.5 + 0.5 * ((p - 0.70) / 0.20) }
        return 1 - (p - 0.90) / 0.10
    }

    @ViewBuilder
    private func sparkLayer(angle: Double, progress p: Double) -> some View {
        // delay 600ms = 0.2 of total. duration = 2400ms = 0.8.
        let local = (p - 0.20) / 0.80
        if local > 0 && local < 1 {
            let rad = angle * .pi / 180
            // 중앙 → 바깥 80px
            let dist = 80.0 * local
            Circle()
                .fill(Color.accentPrimary)
                .frame(width: 4, height: 4)
                .shadow(color: Color.accentPrimary, radius: 6)
                .offset(x: cos(rad) * dist, y: sin(rad) * dist)
                .opacity(local > 0.7 ? (1 - (local - 0.7) / 0.3) : 1)
        }
    }
}
