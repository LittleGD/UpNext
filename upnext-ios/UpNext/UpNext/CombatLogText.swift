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
    var charDelay: Double = 0.018
    var showCaret: Bool = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealed: String = ""
    @State private var caretOn: Bool = true
    @State private var doneTyping: Bool = false

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
    }

    private func startTyping() {
        let chars = Array(fullText)
        var i = 0
        Timer.scheduledTimer(withTimeInterval: charDelay, repeats: true) { timer in
            guard i < chars.count else {
                timer.invalidate()
                doneTyping = true
                return
            }
            revealed.append(chars[i])
            i += 1
        }
    }

    private func startCaret() {
        Timer.scheduledTimer(withTimeInterval: 0.41, repeats: true) { _ in
            if doneTyping { return }
            caretOn.toggle()
        }
    }
}
