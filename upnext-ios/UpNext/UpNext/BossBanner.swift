//
//  BossBanner.swift
//  UpNext — 보스 등장 연출 오버레이 (2.4s).
//
//  웹 src/components/uphero/BossBanner.tsx 포팅.
//  타임라인:
//   0~200ms   : 빨간 flash (accentSecondary alpha 0→0.7→0)
//   200~600ms : 다크 배경 fade-in + content scale 0.92→1 + opacity 0→1
//   600~1800ms: hold (사용자가 읽음)
//   1800~2400ms: 전체 opacity 1→0
//
//  탭하면 즉시 onDone 호출 (skip).
//  reduce-motion: 600ms 단순 fade 로 축소.
//

import SwiftUI

struct BossBanner: View {
    let monster: Monster
    let floor: Int
    let onDone: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var flashOpacity: Double = 0
    @State private var bgOpacity: Double = 0
    @State private var contentOpacity: Double = 0
    @State private var contentScale: Double = 0.92
    @State private var rootOpacity: Double = 1
    @State private var tremor: CGSize = .zero

    var body: some View {
        ZStack {
            // 빨간 flash 레이어
            Color.accentSecondary.opacity(flashOpacity)

            // 다크 배경
            Color.black.opacity(0.93 * bgOpacity)

            // 콘텐츠
            VStack(spacing: 14) {
                Text("BOSS APPEARED")
                    .typography(.micro)
                    .tracking(4)
                    .foregroundStyle(Color.accentSecondary)

                MonsterSprite(kind: monster.kind, size: 96,
                              color: Color.accentSecondary, glow: true)
                    .offset(tremor)

                Text(LocalizedStringKey(monster.name))
                    .typography(.title)
                    .tracking(1.5)
                    .foregroundStyle(GBPalette.lightest)
                    .shadow(color: Color.accentSecondary.opacity(0.5), radius: 12)

                HStack(spacing: 8) {
                    Text("F\(floor)")
                        .foregroundStyle(Color.accentSecondary)
                    Text("·").opacity(0.5)
                    Text("HP \(monster.hp)")
                    Text("·").opacity(0.5)
                    Text("ATK \(monster.atk)")
                }
                .typography(.caption)
                .monospacedDigit()
                .foregroundStyle(GBPalette.light)
            }
            .padding(.horizontal, 32)
            .opacity(contentOpacity)
            .scaleEffect(contentScale)
        }
        .ignoresSafeArea()
        .opacity(rootOpacity)
        .contentShape(Rectangle())
        .onTapGesture { onDone() }
        .onAppear { runSequence() }
    }

    private func runSequence() {
        if reduceMotion {
            // 단순화: 0→1 fade-in 후 600ms 뒤 onDone.
            contentOpacity = 1
            bgOpacity = 0.7
            contentScale = 1
            withAnimation(.easeOut(duration: 0.6).delay(0.6)) {
                rootOpacity = 0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { onDone() }
            return
        }

        // 0-200ms: 플래시 0→0.7→0
        withAnimation(.easeOut(duration: 0.13)) { flashOpacity = 0.7 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.13) {
            withAnimation(.easeIn(duration: 0.39)) { flashOpacity = 0 }
        }

        // 180-700ms: 다크 배경 fade-in
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            withAnimation(.easeOut(duration: 0.52)) { bgOpacity = 1 }
        }

        // 320-920ms: 콘텐츠 enter (scale + opacity)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) {
            withAnimation(Anim.easeOut(0.60)) {
                contentOpacity = 1
                contentScale = 1
            }
        }

        // tremor: 320ms 시점부터 180ms × 6회 (1080ms) — sprite 미세 떨림
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) {
            runTremor(iterations: 6)
        }

        // 2040-2400ms: 전체 fade out
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.04) {
            withAnimation(.easeOut(duration: 0.36)) { rootOpacity = 0 }
        }

        // 2400ms: onDone
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
            onDone()
        }
    }

    private func runTremor(iterations: Int) {
        guard iterations > 0 else { tremor = .zero; return }
        let steps: [CGSize] = [
            CGSize(width: -1, height: -1),
            CGSize(width: 1, height: 0),
            CGSize(width: -1, height: 1),
            CGSize(width: 0, height: 0),
        ]
        for (i, s) in steps.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.045) {
                tremor = s
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            runTremor(iterations: iterations - 1)
        }
    }
}
