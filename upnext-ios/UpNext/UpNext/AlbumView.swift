//
//  AlbumView.swift
//  UpNext — 인증 사진 앨범 (Phase 4 슬라이스 28 · Phase 4.5).
//
//  웹 collection 의 앨범 탭 포팅. 컬렉션 화면의 "앨범" 탭에서 보이며, 성장의
//  순간을 사진으로 남긴다. 사진은 GrowthStore 가 기기 로컬 파일로 보관.
//
//  슬라이스 28 — PhotosPicker 로 자유 추가 + 그리드 + 삭제. 웹의 카메라 캡처·
//  폴라로이드 편집·메모·챌린지 완료 연동은 이후 슬라이스 (condensed).
//

import SwiftUI
import PhotosUI

struct AlbumView: View {
    @EnvironmentObject private var growth: GrowthStore
    @EnvironmentObject private var upHero: UpHeroStore
    /// PhotosPicker 선택 항목 — 선택되면 onChange 가 GrowthStore 에 추가.
    @State private var pickerItem: PhotosPickerItem?
    /// 항목 액션(부적 만들기/삭제) 대상.
    @State private var actionTarget: PhotoMeta?

    private let columns = Array(
        repeating: GridItem(.flexible(), spacing: 8), count: 3)

    private struct PhotoSection: Identifiable {
        var id: String
        var title: String
        var items: [PhotoMeta]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                addButton
                if growth.photoMetas.isEmpty {
                    emptyState
                } else {
                    ForEach(photoSections) { section in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(section.title)
                                .typography(.caption)
                                .foregroundStyle(Color.textTertiary)
                            LazyVGrid(columns: columns, spacing: 8) {
                                ForEach(section.items) { meta in
                                    photoCell(meta)
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
            .padding(.bottom, 88)  // 하단 플로팅 네비 여유
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onChange(of: pickerItem) { item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    growth.addPhoto(imageData: data)
                }
                pickerItem = nil
            }
        }
        .confirmationDialog(
            "사진",
            isPresented: Binding(
                get: { actionTarget != nil },
                set: { if !$0 { actionTarget = nil } }),
            presenting: actionTarget
        ) { meta in
            Button("부적으로 만들기") { upHero.createPhotoTalisman(photoId: meta.id) }
            Button("삭제", role: .destructive) { growth.deletePhoto(meta.id) }
            Button("취소", role: .cancel) {}
        }
    }

    private var addButton: some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            HStack(spacing: 8) {
                PixelIcon(.plus, size: 14, color: Color.bgPrimary)
                Text("사진 추가")
                    .typography(.caption)
                    .foregroundStyle(Color.bgPrimary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.accentPrimary, in: Capsule())
        }
    }

    private var emptyState: some View {
        Text("아직 사진이 없어요.\n챌린지 완료 후 2초 로그를 남기면 카드와 함께 모여요.")
            .typography(.caption)
            .foregroundStyle(Color.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 20)
    }

    private var photoSections: [PhotoSection] {
        // 모든 사진을 주 단위로 그룹 — 챌린지로그(weekId 존재)는 그대로, 자유 사진은
        // date 에서 주 시작일을 계산해 같은 주 안에 합친다. 이전 구현은 weekId vs date
        // 둘 다 10자라 sectionTitle 휴리스틱이 깨져 자유 사진의 date 가 "주간" 레이블로
        // 잘못 표시됐었다.
        let grouped = Dictionary(grouping: growth.photoMetas) { meta in
            meta.weekId ?? RetentionEngine.weekId(for: meta.date)
        }
        return grouped.keys.sorted(by: >).compactMap { key in
            guard let items = grouped[key]?.sorted(by: { $0.timestamp > $1.timestamp }) else { return nil }
            return PhotoSection(id: key, title: "\(key) 주간", items: items)
        }
    }

    /// 사진 셀 — 정사각 썸네일. 탭하면 부적 만들기/삭제 시트.
    private func photoCell(_ meta: PhotoMeta) -> some View {
        Button { actionTarget = meta } label: {
            Group {
                if let img = growth.image(for: meta.id) {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                } else {
                    PixelIcon(.image, size: 22, color: Color.textTertiary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
            .background(Color.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(alignment: .topLeading) {
                if meta.kind == .challengeLog {
                    HStack(spacing: 4) {
                        PixelIcon(meta.category?.pixelIcon ?? .check, size: 9, color: Color.bgPrimary)
                        Text(meta.category?.label ?? "챌린지")
                            .typography(.micro)
                            .lineLimit(1)
                    }
                    .foregroundStyle(Color.bgPrimary)
                    .padding(.horizontal, 6)
                    .frame(height: 20)
                    .background(Color.accentPrimary, in: Capsule())
                    .padding(6)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("challengeLogBadge")
                }
            }
            .overlay(alignment: .bottomLeading) {
                if meta.kind == .challengeLog, let title = meta.challengeTitle {
                    Text(title)
                        .typography(.micro)
                        .foregroundStyle(Color.bgPrimary)
                        .lineLimit(2)
                        .padding(6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            LinearGradient(
                                colors: [.black.opacity(0.0), .black.opacity(0.58)],
                                startPoint: .top,
                                endPoint: .bottom)
                        )
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(meta.kind == .challengeLog ? "challengeLogBadge" : "photoCard")
    }
}
