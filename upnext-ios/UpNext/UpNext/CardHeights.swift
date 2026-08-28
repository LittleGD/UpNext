//
//  CardHeights.swift
//  UpNext — 카드 높이 통일 규약 (그룹별 바닥 높이 + 등고 스트레치).
//
//  원칙: **같은 페이지·같은 그룹 안에서만** 높이를 맞춘다(전역 통일 아님). 기준은 그
//  그룹에서 가장 큰 카드 — 짧은 카드가 늘어나고, 긴 카드는 절대 잘리지 않는다.
//
//  ⚠️ 측정(PreferenceKey) 방식 금지. RetentionSectionView.GuardStatsRow 주석 참고 —
//  minHeight+패딩 이후를 재는 방식은 레이아웃 패스마다 높이가 +28pt 씩 자라 불꽃 탭이
//  통째로 백화됐다(재발 금지). 대신 상태 없는 표준 패턴 두 가지만 쓴다.
//
//   A) 그리드 행 · 가로 행(HStack) → 셀에 `unCardCell(minHeight:)`.
//      = `frame(maxWidth: .infinity, minHeight: _, maxHeight: .infinity)`.
//      행 높이가 "가장 큰 셀의 이상 높이"로 먼저 정해지고, 유연한 셀이 그 높이를 채운다.
//      HStack 으로 직접 묶은 행은 스택에 `.fixedSize(horizontal: false, vertical: true)`
//      를 더해 바깥 제안이 아니라 이상 높이로 확정시킨다(GuardStatsRow 와 동일).
//
//   B) 세로로 쌓인 리스트 → 그룹 공통 minHeight 상수(바닥값)만.
//      세로 스택은 형제의 높이를 서로 모르기 때문에 A 로는 맞출 수 없다. 상수는 바닥일
//      뿐이라 더 긴 카드(3줄 설명·긴 번역)는 그대로 자란다 — 잘리지 않는다.
//
//  ⚠️ 고정 `frame(height:)` 금지. typography(_:) 는 `.custom(size:)` 라 Dynamic Type
//  으로 커지고, iPad(regular size class) 에선 padSize 로 한 단계 더 커진다. 고정 높이는
//  두 경우 모두 글자를 자른다. 아래 값은 전부 *바닥값(minHeight)* 이다.
//
//  값의 근거: 각 그룹에서 가장 큰 카드의 ko/en/ja/zh 이상 높이. 값은 *교체 전 프레임이
//  있던 자리* 를 그대로 물려받는다 — 셀 안쪽 padding 이 프레임 안쪽인 그룹(도감·장비)도
//  바깥인 그룹(컬렉션·버프)도 있으므로, 바닥값은 그 그룹 안에서만 비교한다. 이렇게 해야
//  이미 출시된 카드 크기가 1pt 도 변하지 않는다.
//

import SwiftUI

enum CardHeights {
    // MARK: 그리드 그룹 (패턴 A — 바닥값 + 행 등고)

    /// 컬렉션 카드 도감 셀 2열 (등급 배지 + 제목 2줄 + 카테고리 / 잠금 셀).
    static let collectionCell: CGFloat = 84
    /// 버프 카드 드로우 셀 2열 (등급 배지 + 제목 2줄).
    static let buffCell: CGFloat = 84
    /// 도감(몬스터·보스·장비) 셀 3열 (스프라이트/아이콘 + 이름 + 보조 라인).
    static let codexCell: CGFloat = 100
    /// 장비 슬롯/인벤토리 셀 (등급 배지 + 아이콘 + 이름 2줄 + 스탯 요약).
    static let equipmentCell: CGFloat = 120
    /// 던전 선택 셀 2열 (아이콘 + 이름 + 최고 층).
    static let dungeonCell: CGFloat = 92
    /// 아지트 보조 액션 타일 2열 (아이콘 + 라벨 한 줄).
    static let campTile: CGFloat = 52
    /// 상점 탐험권 셀 4열 (던전 아이콘 + 보유/cap).
    static let shopPassCell: CGFloat = 56
    /// 카드팩 개봉 리빌 셀 3열 (등급 배지 + 아이콘 + 제목 2줄).
    static let packRevealCell: CGFloat = 84
    /// 온보딩 스타터팩 리빌 셀 3열 (등급 배지 + 제목 2줄).
    static let onboardingRevealCell: CGFloat = 58

    // MARK: 가로 행 그룹 (패턴 A + fixedSize)

    /// 카드매치 통계 카드 2칸 (라벨 + 숫자).
    static let statCard: CGFloat = 52
    /// 미니게임 라운드 결과 지표 타일 2칸 (라벨 + 카운트업 숫자).
    static let minigameStatTile: CGFloat = 52
    /// 오늘의 기운 — 재물·관계·건강 고르기 칩 3칸 (아이콘 + 이름 + 등급/자물쇠).
    /// 이름이 2줄로 접히는 언어에서도 셋이 함께 늘어난다.
    static let auraPickChip: CGFloat = 74

    // MARK: 세로 리스트 그룹 (패턴 B — 바닥값만)

    /// 오늘의 챌린지 보드 카드. 미완료(등급 배지 + 제목 + 설명 + "탭하여 완료" 버튼)가
    /// 이 그룹의 최대치라 완료 카드(버튼이 빠져 약 −45pt)가 여기에 맞춰 늘어난다.
    /// 설명이 2~3줄로 늘어나는 카드는 이 바닥값을 넘겨 그대로 자란다(잘림 없음).
    ///
    /// 보드에 카드가 2장 이상일 때만 적용한다 — 노멀 난이도(1장)에선 맞출 상대가 없어
    /// 완료 카드에 빈 공간만 생긴다(DailyHomeView.boardView 의 `floor` 참조).
    static let dailyBoardCard: CGFloat = 136
    /// 온보딩 스타터팩 선택지 3장 (이름 + 설명 2줄). 웹 StarterPackSelect 의
    /// `auto-rows-fr` 대응 — 설명이 대부분 2줄이라 바닥값이 곧 최대치이고, 짧은 번역
    /// 하나만 1줄이 될 때 그 카드가 나머지에 맞춰 올라온다.
    static let onboardingPackRow: CGFloat = 68
}

extension View {
    /// 패턴 A — 그리드/가로 행 셀의 등고 스트레치.
    ///
    /// 바닥값(minHeight)을 깔고 `maxHeight: .infinity` 로 같은 행에서 가장 큰 셀 높이까지
    /// 늘어나게 한다. 셀 안쪽 padding 은 이 뒤에 붙여 기존 여백을 그대로 유지한다.
    ///
    /// - Parameters:
    ///   - minHeight: 그룹 공통 바닥값 (`CardHeights` 상수).
    ///   - alignment: 늘어난 여백에서 콘텐츠가 붙을 방향. 기본 `.center` — 교체 대상이던
    ///     `frame(minHeight:)`/`frame(height:)` 의 기본 정렬과 같아 기존 배치가 그대로 남는다.
    func unCardCell(minHeight: CGFloat, alignment: Alignment = .center) -> some View {
        frame(maxWidth: .infinity, minHeight: minHeight,
              maxHeight: .infinity, alignment: alignment)
    }
}
