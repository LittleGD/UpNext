//
//  RecordTabView.swift
//  UpNext — 불꽃(기록) 탭. 일일 습관·소셜 리텐션 허브.
//
//  오늘의 불꽃 체크인 / 지난주 리포트 / 2인 불꽃(듀오)을 한 페이지로 모은다.
//  이전엔 아지트 영웅 탭 하단에 끼어 있어 RPG 동선과 위계가 충돌 → 전용 탭으로 분리.
//  (디자인 결정: 데일리 습관·소셜은 RPG 허브와 성격이 달라 독립 페이지가 더 명확.)
//

import SwiftUI

struct RecordTabView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("오늘의 기록")
                        .typography(.title)
                        .foregroundStyle(Color.textPrimary)
                    Text("매일의 불꽃과 함께 쌓이는 나의 흐름")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                }
                .padding(.top, 8)

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
