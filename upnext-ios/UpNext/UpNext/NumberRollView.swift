//
//  NumberRollView.swift
//  UpNext — slot-machine 숫자 롤 (R6 — 모달·전환·NumberRoll).
//
//  웹 components/uphero/NumberRoll.tsx 충실 포팅.
//  값이 바뀌면 옛 값은 위로 빠지고(translateY -100% + fade out), 새 값은 아래서
//  올라온다(+100% → 0 + fade in). 260ms EASE_OUT (Anim.numberRoll).
//  delta>0 → gainColor flash, delta<0 → lossColor flash (180ms 후 baseColor 복귀).
//
//  ⚠️ 웹 NumberRoll 은 *숫자 전체 블록* 을 굴린다 (자릿수별 X). 여기도 동일.
//  monospacedDigit 으로 자릿수 바뀌어도 layout shift 없음.
//
//  사용처: AppHeader XP/Lv, 캠프·상점 코인 등 "획득 감" 이 필요한 숫자.
//

import SwiftUI

struct NumberRollView: View {
    let value: Int
    var format: (Int) -> String
    /// 평상시 색 (flash 아닐 때).
    var baseColor: Color
    var gainColor: Color
    var lossColor: Color?

    @State private var prev: Int
    @State private var flash: Color? = nil

    init(value: Int,
         format: @escaping (Int) -> String = { String($0) },
         baseColor: Color = .textPrimary,
         gainColor: Color = .accentPrimary,
         lossColor: Color? = nil) {
        self.value = value
        self.format = format
        self.baseColor = baseColor
        self.gainColor = gainColor
        self.lossColor = lossColor
        _prev = State(initialValue: value)
    }

    var body: some View {
        ZStack {
            Text(format(value))
                .monospacedDigit()
                .id(value)
                .transition(.asymmetric(
                    insertion: .move(edge: .bottom).combined(with: .opacity),
                    removal: .move(edge: .top).combined(with: .opacity)))
        }
        .clipped()
        .foregroundStyle(flash ?? baseColor)
        .animation(Anim.numberRoll, value: value)
        .onChange(of: value) { newValue in
            let delta = newValue - prev
            prev = newValue
            let target: Color? = delta > 0 ? gainColor : (delta < 0 ? lossColor : nil)
            guard let target else { return }
            withAnimation(Anim.easeOut(0.18)) { flash = target }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                withAnimation(Anim.easeOut(0.18)) { flash = nil }
            }
        }
    }
}
