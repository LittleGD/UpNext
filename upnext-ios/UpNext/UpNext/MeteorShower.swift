//
//  MeteorShower.swift
//  UpNext — 우상→좌하 메테오 샤워 캔버스 이펙트.
//
//  웹 src/components/effects/MeteorShower.tsx 포팅.
//  - 화면 ≤16개 동시 표시, 300-500ms 간격으로 스폰
//  - 각도 135-160° (우상에서 좌하), 속도 2-4 px/frame
//  - life 1-2s (60-120 frames), fade-in 8 step / fade-out 마지막 30%
//  - 4색 (accent/cyan/secondary/white) 순환
//  - 4-segment 꼬리 + 2×2 머리 픽셀
//
//  렌더: `Canvas` + `TimelineView`. active=false 면 즉시 정리.
//

import SwiftUI

struct MeteorShower: View {
    var active: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var meteors: [Meteor] = []
    @State private var lastSpawn: TimeInterval = 0
    @State private var startTime = Date()
    @State private var nextColor: Int = 0

    private static let colors: [Color] = [
        Color(red: 205/255, green: 245/255, blue: 100/255),  // accent
        Color(red: 155/255, green: 240/255, blue: 225/255),  // cyan
        Color(red: 255/255, green: 70/255,  blue: 50/255),   // secondary
        Color(red: 240/255, green: 240/255, blue: 240/255),  // white
    ]
    private static let trailLength = 4

    var body: some View {
        if !active || reduceMotion {
            // active off 또는 reduce-motion: 렌더 안 함.
            Color.clear.allowsHitTesting(false)
        } else {
            GeometryReader { geo in
                TimelineView(.animation) { context in
                    let elapsed = context.date.timeIntervalSince(startTime)
                    Canvas { ctx, size in
                        // 매 프레임 메테오 갱신을 그리기와 동시에. 외부 @State 갱신은
                        // 의도적으로 onChange/onReceive 가 아닌 onAppear 의 Timer 로 통제.
                        for m in meteors {
                            let lifeRatio = m.life / m.maxLife
                            let fadeIn = min(m.life / 8, 1)
                            let fadeOut = lifeRatio > 0.7 ? 1 - (lifeRatio - 0.7) / 0.3 : 1
                            let alpha = fadeIn * fadeOut
                            if alpha <= 0.01 { continue }

                            let color = Self.colors[m.colorIdx]

                            // trail
                            for t in stride(from: Self.trailLength, through: 1, by: -1) {
                                let tx = m.x - cos(m.angle) * m.speed * Double(t)
                                let ty = m.y - sin(m.angle) * m.speed * Double(t)
                                let trailAlpha = alpha * (1 - Double(t) / Double(Self.trailLength + 1)) * 0.6
                                let rect = CGRect(x: tx, y: ty, width: 1, height: 1)
                                ctx.fill(Path(rect), with: .color(color.opacity(trailAlpha)))
                            }

                            // head 2x2
                            let head = CGRect(x: m.x, y: m.y, width: 2, height: 2)
                            ctx.fill(Path(head), with: .color(color.opacity(alpha)))
                        }
                        _ = elapsed  // touch elapsed so TimelineView re-evaluates
                        _ = size
                    }
                }
                .onAppear {
                    startTime = Date()
                    // 60fps 시뮬레이션 — 별도 Timer 로 데이터 갱신.
                    Timer.scheduledTimer(withTimeInterval: 1.0/60, repeats: true) { timer in
                        if !active {
                            timer.invalidate()
                            meteors = []
                            return
                        }
                        let now = Date().timeIntervalSince(startTime) * 1000
                        // 스폰
                        let spawnInterval = 300.0 + Double.random(in: 0..<200)
                        if meteors.count < 16 && now - lastSpawn > spawnInterval {
                            spawnMeteor(canvasSize: geo.size)
                            lastSpawn = now
                        }
                        // 갱신
                        var alive: [Meteor] = []
                        for var m in meteors {
                            m.life += 1
                            m.x += cos(m.angle) * m.speed
                            m.y += sin(m.angle) * m.speed
                            if m.life >= m.maxLife || m.x < -20 || m.y > geo.size.height + 20 { continue }
                            alive.append(m)
                        }
                        meteors = alive
                    }
                }
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
        }
    }

    private func spawnMeteor(canvasSize: CGSize) {
        let angleDeg = 135 + Double.random(in: 0..<25)
        let angle = angleDeg * .pi / 180
        let speed = 2 + Double.random(in: 0..<2)
        let maxLife = 60.0 + Double(Int.random(in: 0..<60))
        meteors.append(Meteor(
            x: canvasSize.width * (0.3 + Double.random(in: 0..<0.8)),
            y: -10 - Double.random(in: 0..<40),
            angle: angle,
            speed: speed,
            life: 0,
            maxLife: maxLife,
            colorIdx: nextColor % Self.colors.count
        ))
        nextColor += 1
    }

    private struct Meteor {
        var x: Double
        var y: Double
        let angle: Double
        let speed: Double
        var life: Double
        let maxLife: Double
        let colorIdx: Int
    }
}
