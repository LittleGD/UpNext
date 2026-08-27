//
//  RecordTabView.swift
//  UpNext — 불꽃(기록) 탭. 일일 습관·소셜 리텐션 허브.
//
//  오늘의 불꽃(스트릭 히어로) / 마일스톤 / 방패·최고기록 / 28일 히트맵 / 2인 불꽃 /
//  지난주 리포트를 한 페이지로. 이전엔 작은 카드 3개의 평면 나열 → 위계·게이미피케이션·
//  감성·소셜을 강화한 재설계(다관점 디자인 패널 합성).
//

import SwiftUI

struct RecordTabView: View {
    /// 오늘의 기운 공개 → 폴라로이드 오버레이 (오늘의 카드·색·문구·명언 한 벌)
    @State private var revealedFortune: DailyFortune?

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    RitualGreetingHeader()
                    // 오늘의 기운 카드는 RetentionSectionView 안(불꽃 히어로 바로 아래)에 있다.
                    //   여기서는 공개 이벤트만 받아 오버레이를 띄운다 — 오버레이는 ScrollView
                    //   밖에 있어야 화면 전체를 덮는다(스크롤을 따라 움직이면 안 된다).
                    RetentionSectionView { fortune in
                        withAnimation(.easeOut(duration: 0.2)) { revealedFortune = fortune }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 96)   // 하단 플로팅 네비 여유
            }

            if let fortune = revealedFortune {
                FortuneRevealOverlay(fortune: fortune) {
                    withAnimation(.easeOut(duration: 0.2)) { revealedFortune = nil }
                }
                .transition(.opacity)
                .zIndex(10)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // 앰비언트 노출(요인1) — 화면 루트 투명화. MainShell 바닥의 오로라·별이 관통(웹 main z-[1] 패리티).
        // 불꽃 히어로/카드는 bgSurface 위라 대비/가독성 유지.
    }
}

// MARK: - 시간대 인사 헤더 (압박 없는 진입 — 매 방문 신선함)

/// 정적 "오늘의 기록" 타이틀을 시각대별 인사로 교체. 데이터 의존 0이라 항상 안전.
/// .sun 아이콘 부재 → 아침/낮은 .flame(라임), 저녁/밤은 .moon.
struct RitualGreetingHeader: View {
    private var phase: (icon: PixelIconName, hi: String, sub: String) {
        let h = Calendar.current.component(.hour, from: Date())
        switch h {
        case 5..<11:  return (.flame, AppConfig.loc("좋은 아침이에요"), AppConfig.loc("오늘의 불꽃을 천천히 켜볼까요"))
        case 11..<17: return (.flame, AppConfig.loc("한낮이에요"), AppConfig.loc("잠깐 멈춰 오늘을 챙겨봐요"))
        case 17..<22: return (.moon, AppConfig.loc("저녁이에요"), AppConfig.loc("오늘 하루, 어땠어요?"))
        default:      return (.moon, AppConfig.loc("늦은 밤이에요"), AppConfig.loc("오늘도 여기 있어줘서 고마워요"))
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                PixelIcon(phase.icon, size: 18, color: .accentPrimary)
                Text(phase.hi).typography(.title).foregroundStyle(Color.textPrimary)
            }
            Text(phase.sub).typography(.caption).foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 8)
    }
}
