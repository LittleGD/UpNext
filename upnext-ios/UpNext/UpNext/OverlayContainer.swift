//
//  OverlayContainer.swift
//  UpNext — 중앙 모달 컨테이너 (R6 — 모달·전환·NumberRoll).
//
//  웹 모달의 motion.div 패턴 등가 — backdrop-blur 위에 카드가 cardOverlayEnter
//  스프링으로 "도착". 웹은 native sheet 가 없어 모든 모달이 이 형태(중앙 정렬 +
//  bg-black/blur + scale/y 스프링 진입). iOS 도 confirm/choice 류 모달에 이 primitive
//  를 써 웹과 동일한 모달 감각을 회복.
//
//  ⚠️ 네이티브 .sheet(드래그 dismiss·detents) 가 적합한 drawer 류(로그/리포트)는
//  그대로 둔다 — 플랫폼 관습이 더 나은 곳까지 무리하게 교체하지 않음.
//
//  진입: onAppear 에서 cardOverlayEnter (scale 0.95→1 + y 30→0 + opacity).
//  퇴장: 부모가 `if` 로 제거 → .transition(.opacity) (웹의 비대칭 enter/exit).
//

import SwiftUI

struct OverlayContainer<Content: View>: View {
    /// 배경(backdrop) 탭 시 호출 — 부모가 dismiss 처리 (없으면 탭 무시 = 강제 선택).
    var onBackdropTap: (() -> Void)? = nil
    /// backdrop 블러 강도(material) 사용 여부. false 면 단색 dim 만.
    var blur: Bool = true
    @ViewBuilder var content: () -> Content

    @State private var entered = false

    var body: some View {
        ZStack {
            backdrop
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { onBackdropTap?() }
            content()
                .scaleEffect(entered ? 1 : 0.95)
                .opacity(entered ? 1 : 0)
                .offset(y: entered ? 0 : 30)
        }
        .onAppear { withAnimation(Anim.cardOverlayEnter) { entered = true } }
    }

    @ViewBuilder private var backdrop: some View {
        if blur {
            // bg-black/70 + backdrop-blur-md 등가 (뒤 콘텐츠를 흐리고 어둡게).
            Rectangle().fill(.ultraThinMaterial)
                .overlay(Color.black.opacity(0.45))
        } else {
            Color.black.opacity(0.6)
        }
    }
}

extension View {
    /// 중앙 모달 오버레이 — `isPresented` 가 true 면 OverlayContainer 로 content 표시.
    /// 진입 spring, 퇴장 fade (.transition(.opacity)). backdrop 탭 → isPresented=false.
    func overlayModal<C: View>(
        isPresented: Binding<Bool>,
        dismissOnBackdropTap: Bool = true,
        blur: Bool = true,
        @ViewBuilder content: @escaping () -> C
    ) -> some View {
        ZStack {
            self
            if isPresented.wrappedValue {
                OverlayContainer(
                    onBackdropTap: dismissOnBackdropTap
                        ? { withAnimation(Anim.cardOverlayExit) { isPresented.wrappedValue = false } }
                        : nil,
                    blur: blur,
                    content: content)
                .transition(.opacity)
                .zIndex(100)
            }
        }
    }
}
