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
    /// PhotosPicker 선택 항목 — 선택되면 onChange 가 GrowthStore 에 추가.
    @State private var pickerItem: PhotosPickerItem?
    /// 삭제 확인 대상.
    @State private var deleteTarget: PhotoMeta?

    private let columns = Array(
        repeating: GridItem(.flexible(), spacing: 8), count: 3)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                addButton
                if growth.photoMetas.isEmpty {
                    emptyState
                } else {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(growth.photoMetas) { meta in
                            photoCell(meta)
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
            "이 사진을 삭제할까요?",
            isPresented: Binding(
                get: { deleteTarget != nil },
                set: { if !$0 { deleteTarget = nil } }),
            presenting: deleteTarget
        ) { meta in
            Button("삭제", role: .destructive) { growth.deletePhoto(meta.id) }
            Button("취소", role: .cancel) {}
        }
    }

    private var addButton: some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            HStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .semibold))
                Text("사진 추가")
                    .typography(.caption)
            }
            .foregroundStyle(Color.bgPrimary)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.accentPrimary, in: Capsule())
        }
    }

    private var emptyState: some View {
        Text("아직 사진이 없어요.\n성장의 순간을 사진으로 남겨 보세요.")
            .typography(.caption)
            .foregroundStyle(Color.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 20)
    }

    /// 사진 셀 — 정사각 썸네일. 탭하면 삭제 확인.
    private func photoCell(_ meta: PhotoMeta) -> some View {
        Button { deleteTarget = meta } label: {
            Group {
                if let img = growth.image(for: meta.id) {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                } else {
                    Image(systemName: "photo")
                        .font(.system(size: 22))
                        .foregroundStyle(Color.textTertiary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
            .background(Color.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }
}
