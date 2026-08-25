//
//  GrowthThumbImage.swift
//  UpNext — 인증 사진 그리드/썸네일 셀 공용 이미지 뷰.
//
//  앨범 그리드·부적 픽커·스탯 패널처럼 수십 pt 로 그리는 자리는 풀사이즈
//  (1200×1454 ≈ 7MB, 구버전 1800×2181 ≈ 15MB) 디코드가 순수 낭비다 — S6-1 에서
//  imageCache 가 96MB 상한을 금방 넘겨 스크롤마다 재디코드가 돌았다. 이 뷰는
//  GrowthStore.loadThumbnail(≤300px, 별도 캐시 키) 경로만 사용한다.
//  크게 보는 화면(PhotoDetailModal·부적 의식)은 기존 image(for:) 를 그대로 쓸 것.
//

import SwiftUI

@MainActor
struct GrowthThumbImage<Placeholder: View>: View {
    private let id: String
    private let growth: GrowthStore
    private let placeholder: Placeholder
    /// 캐시 히트면 init 에서 바로 채워 첫 프레임 placeholder 깜빡임이 없다.
    @State private var thumb: UIImage?

    /// growth 를 파라미터로 받는 이유 — @EnvironmentObject 는 init 시점에 접근할 수
    /// 없어 캐시 히트를 @State 초기값으로 넣을 수 없다 (스크롤 복귀 시 깜빡임).
    init(id: String, growth: GrowthStore, @ViewBuilder placeholder: () -> Placeholder) {
        self.id = id
        self.growth = growth
        self.placeholder = placeholder()
        _thumb = State(initialValue: growth.cachedThumbnail(for: id))
    }

    var body: some View {
        Group {
            if let img = thumb {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
            } else {
                placeholder
            }
        }
        .task(id: id) {
            if thumb == nil {
                thumb = await growth.loadThumbnail(for: id)
            }
        }
    }
}
