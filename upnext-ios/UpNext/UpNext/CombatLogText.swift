//
//  CombatLogText.swift
//  UpNext — 전투 로그 typewriter 텍스트.
//
//  웹 components/uphero/CombatLog.tsx + globals.css `uphero-typewriter-caret`
//  포팅. 새로 마운트된 로그 한 줄은 글자 단위로 타이핑되고, 끝에서 caret 깜빡임.
//
//  - 18ms 글자 — 너무 빠르지 않게 (속도 2× 면 9ms).
//  - reduce-motion: 전체 텍스트 즉시 표시 + caret 정지.
//  - mount 시점에 자동 시작. 한 번만 — 이후엔 정적.
//

import SwiftUI

struct CombatLogText: View {
    let fullText: String
    var color: Color = Color.textSecondary
    var showCaret: Bool = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealed: String = ""
    @State private var caretOn: Bool = true
    @State private var doneTyping: Bool = false
    // Timer 참조 보관 — 뷰가 사라질 때 invalidate 해 좀비 timer 누수 차단(V4 리뷰).
    @State private var typeTimer: Timer?
    @State private var caretTimer: Timer?

    /// 웹 useTypewriter — 긴 문장(≥40자)은 12ms 로 빠르게(scan 가능), 그 외 18ms.
    private var charDelay: Double { fullText.count >= 40 ? 0.012 : 0.018 }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(revealed)
                .typography(.caption)
                .foregroundStyle(color)
            if showCaret && !doneTyping {
                Text("▌")
                    .typography(.caption)
                    .foregroundStyle(color)
                    .opacity(caretOn ? 1 : 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear {
            if reduceMotion {
                revealed = fullText
                doneTyping = true
            } else {
                startTyping()
                startCaret()
            }
        }
        .onDisappear {
            typeTimer?.invalidate(); typeTimer = nil
            caretTimer?.invalidate(); caretTimer = nil
        }
    }

    private func startTyping() {
        let chars = Array(fullText)
        var i = 0
        typeTimer?.invalidate()
        typeTimer = Timer.scheduledTimer(withTimeInterval: charDelay, repeats: true) { timer in
            guard i < chars.count else {
                timer.invalidate()
                typeTimer = nil
                doneTyping = true
                // 타이핑 끝 → caret 정지 + timer 해제 (기존엔 doneTyping 만 보고 계속 돌아 누수).
                caretTimer?.invalidate(); caretTimer = nil
                return
            }
            revealed.append(chars[i])
            i += 1
        }
    }

    private func startCaret() {
        caretTimer?.invalidate()
        caretTimer = Timer.scheduledTimer(withTimeInterval: 0.41, repeats: true) { _ in
            if doneTyping {
                caretTimer?.invalidate(); caretTimer = nil
                return
            }
            caretOn.toggle()
        }
    }
}
