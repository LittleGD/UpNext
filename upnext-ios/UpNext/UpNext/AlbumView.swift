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
    /// 사진 상세(PhotoDetailModal) 대상 — 셀 탭 시 set.
    @State private var detailTarget: PhotoMeta?

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
        // 사진 탭 → 상세 모달(폴라로이드 크게 보기 + 메모/공유/부적/삭제).
        .overlay {
            if let meta = detailTarget {
                PhotoDetailModal(meta: meta, onClose: { detailTarget = nil })
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: detailTarget?.id)
        // P0-3 — 의식 오버레이. 의식 중인 사진이 있을 때만 마운트, 종료 시 자동 dismiss.
        .overlay {
            if let pending = upHero.pendingTalismanPhoto {
                PhotoTalismanRitual(
                    photoImage: growth.image(for: pending.id),
                    onDone: { upHero.completePhotoTalismanRitual() }
                )
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: upHero.pendingTalismanPhoto?.id)
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
            return PhotoSection(id: key, title: AppConfig.loc("\(key) 주간"), items: items)
        }
    }

    /// 사진 셀 — 웹 앨범의 mini-polaroid 정체성을 유지한다. 탭하면 사진 상세 모달.
    ///
    /// 챌린지 로그 저장본은 이미 완성된 폴라로이드 합성 이미지(프레임·날짜 스탬프·서명
    /// 포함, 600×727)라 통째로 표시한다 — 이전엔 정방 크롭 뒤 셀 프레임을 또 씌워
    /// "폴라로이드 속 폴라로이드"로 잘려 보였다. 자유 사진(원본)만 miniPolaroid 로 감싼다.
    /// 캡션은 친(chin) 영역 한 곳에만 — 구 하단 그라디언트 제목 오버레이가 친 캡션과
    /// 같은 자리에 이중 렌더되어 글자가 겹치던 결함을 오버레이 삭제로 해소.
    private func photoCell(_ meta: PhotoMeta) -> some View {
        Button { detailTarget = meta } label: {
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                // 폴라로이드 공통 지오메트리(Figma 184×223) — PolaroidFrame/합성과 동일 비례.
                let sideM = w * (15.0 / 184.0)
                let topM = h * (14.0 / 223.0)
                let photoW = w - sideM * 2
                let photoH = h * (157.0 / 223.0)
                let chinTop = topM + photoH

                ZStack(alignment: .topLeading) {
                    if meta.kind == .challengeLog {
                        // 합성 저장본 전체가 폴라로이드 — 그대로. 로드 전엔 스캐폴드 표시.
                        GrowthThumbImage(id: meta.id, growth: growth) {
                            miniPolaroid(w: w, h: h) {
                                PixelIcon(.image, size: 22, color: Color.paperPlaceholder)
                            }
                        }
                        .frame(width: w, height: h)
                        .clipped()
                    } else {
                        miniPolaroid(w: w, h: h) {
                            GrowthThumbImage(id: meta.id, growth: growth) {
                                PixelIcon(.image, size: 22, color: Color.paperPlaceholder)
                            }
                        }
                    }

                    // 캡션 — 친 좌상단 한 곳에만 (메모 > 제목 > 날짜).
                    //   서명/낙서가 있는 챌린지 로그엔 얹지 않는다: 저장본 친 영역에 이미
                    //   사용자의 손글씨가 구워져 있어, 그 위에 캡션을 인쇄하면 두 글자가
                    //   겹쳐 둘 다 읽히지 않는다(꾸민 것과 앨범이 달라 보이던 원인 중 하나).
                    if !hasBakedSignature(meta) {
                        Text(polaroidCaption(meta))
                            .typography(.micro)
                            .foregroundStyle(Color.inkWarmText.opacity(0.85))
                            .lineLimit(2)
                            .minimumScaleFactor(0.85)
                            .multilineTextAlignment(.leading)
                            .frame(width: photoW, height: max(0, h - chinTop - h * 0.035),
                                   alignment: .topLeading)
                            .offset(x: sideM, y: chinTop + h * 0.02)
                    }

                    // 아날로그 종이 그레인 — 큰 PolaroidFrame 표시와 같은 캐시 텍스처.
                    Image(uiImage: PolaroidFilters.paperTexture())
                        .resizable()
                        .frame(width: w, height: h)
                        .opacity(0.12)
                        .blendMode(.multiply)
                        .allowsHitTesting(false)

                    // 챌린지 배지 — 사진 좌상단 코너.
                    if meta.kind == .challengeLog {
                        HStack(spacing: 4) {
                            PixelIcon(meta.category?.pixelIcon ?? .check, size: 9, color: Color.bgPrimary)
                            Text(meta.category?.label ?? AppConfig.loc("챌린지"))
                                .typography(.micro)
                                .lineLimit(1)
                        }
                        .foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 6)
                        .frame(height: 20)
                        .background(Color.accentPrimary, in: Capsule())
                        .padding(sideM + 3)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("challengeLogBadge")
                    }
                }
            }
            .aspectRatio(184.0 / 223.0, contentMode: .fit)
            .background(Color.paperCream)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .overlay {
                RoundedRectangle(cornerRadius: 3)
                    .stroke(Color.black.opacity(0.06), lineWidth: 1)
            }
            // 샘플 프레임의 부드러운 이중 그림자(근접 접지 + 넓은 확산).
            .shadow(color: .black.opacity(0.14), radius: 2, y: 1)
            .shadow(color: .black.opacity(0.10), radius: 7, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(meta.kind == .challengeLog ? "challengeLogBadge" : "photoCard")
    }

    /// 자유 사진용 미니 폴라로이드 스캐폴드 — 샘플 프레임 기준: 아이보리 바탕 위
    /// 비례 여백의 사진 영역(인화지 단차 그림자), 친의 현상액 주름(크리스) 자국.
    @ViewBuilder
    private func miniPolaroid<Photo: View>(
        w: CGFloat, h: CGFloat, @ViewBuilder photo: () -> Photo
    ) -> some View {
        let sideM = w * (15.0 / 184.0)
        let topM = h * (14.0 / 223.0)
        let photoW = w - sideM * 2
        let photoH = h * (157.0 / 223.0)
        let chinTop = topM + photoH

        ZStack(alignment: .topLeading) {
            Color.paperCream
            ZStack {
                Color(hex: 0x010101)
                photo()
            }
            .frame(width: photoW, height: photoH)
            .clipped()
            .offset(x: sideM, y: topM)
            .shadow(color: .black.opacity(0.12), radius: 1.5, y: 0.5)

            // 친 현상액 주름 — 샘플의 "\ /" 크리스 한 쌍. 음각선 + 우측 하이라이트로 엠보스.
            Canvas { ctx, size in
                let cw = size.width, ch = size.height
                func crease(from x0: CGFloat, to x1: CGFloat) {
                    var p = Path()
                    p.move(to: CGPoint(x: x0, y: ch * 0.22))
                    p.addLine(to: CGPoint(x: x1, y: ch * 0.78))
                    ctx.stroke(p, with: .color(.black.opacity(0.05)), lineWidth: 0.7)
                    ctx.stroke(p.offsetBy(dx: 0.7, dy: 0),
                               with: .color(.white.opacity(0.5)), lineWidth: 0.5)
                }
                crease(from: cw * 0.36, to: cw * 0.44)   // "\"
                crease(from: cw * 0.64, to: cw * 0.56)   // "/"
            }
            .frame(width: photoW, height: max(0, h - chinTop))
            .offset(x: sideM, y: chinTop)
            .allowsHitTesting(false)
        }
        .frame(width: w, height: h)
    }

    /// 저장본 친 영역에 이미 서명/낙서가 구워져 있는가 — 챌린지 로그(합성본)만 해당.
    private func hasBakedSignature(_ meta: PhotoMeta) -> Bool {
        meta.kind == .challengeLog && meta.signatureData != nil
    }

    private func polaroidCaption(_ meta: PhotoMeta) -> String {
        if let memo = meta.memo.nonEmpty { return memo }
        if let title = localizedChallengeTitle(meta) { return title }
        return meta.date
    }

    /// challengeTitle 은 저장 시점 한국어 원문(card.title) — 렌더 시점에 카드 다국어
    /// 필드로 재현지화 (PhotoDetailModal.displayTitle 과 동일 패턴).
    private func localizedChallengeTitle(_ meta: PhotoMeta) -> String? {
        if let id = meta.challengeCardId,
           let card = CardCatalog.allCards.first(where: { $0.id == id }) {
            return card.localizedTitle(.current)
        }
        return meta.challengeTitle
    }
}

private extension String {
    var nonEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
