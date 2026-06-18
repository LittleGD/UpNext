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
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                RitualGreetingHeader()
                RetentionSectionView()
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 96)   // 하단 플로팅 네비 여유
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }
}

// MARK: - 시간대 인사 헤더 (압박 없는 진입 — 매 방문 신선함)

/// 정적 "오늘의 기록" 타이틀을 시각대별 인사로 교체. 데이터 의존 0이라 항상 안전.
/// .sun 아이콘 부재 → 아침/낮은 .flame(라임), 저녁/밤은 .moon.
struct RitualGreetingHeader: View {
    private var phase: (icon: PixelIconName, hi: String, sub: String) {
        let h = Calendar.current.component(.hour, from: Date())
        switch h {
        case 5..<11:  return (.flame, "좋은 아침이에요", "오늘의 불꽃을 천천히 켜볼까요")
        case 11..<17: return (.flame, "한낮이에요", "잠깐 멈춰 오늘을 챙겨봐요")
        case 17..<22: return (.moon, "저녁이에요", "오늘 하루, 어땠어요?")
        default:      return (.moon, "늦은 밤이에요", "오늘도 여기 있어줘서 고마워요")
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
