//
//  UpHeroStore.swift
//  UpNext — Up Hero RPG 상태 스토어 (Phase 4 슬라이스 14 · Phase 4.4 시작).
//
//  웹 src/store/useUpHeroStore.ts 의 Zustand 스토어를 SwiftUI 반응형 스토어로 재설계.
//  GameStore 와 마찬가지로 화면 슬라이스가 요구하는 액션을 한 슬라이스씩 덧붙여 키운다
//  (1,750줄 Zustand 액션을 일괄 포팅하지 않는다 — on-demand 포팅).
//
//  ── 슬라이스 14 (현재) ──
//  상태 컨테이너 + 기본 상태 팩토리 + 진입점(아지트 셸).
//   - UpHeroState 를 in-memory 로 보유. 영속화는 슬라이스 15 (Codable + 로컬 파일).
//   - initialize()/resetForSignOut() 골격만. idle accrual·영웅 레벨 동기화·주간 변종
//     seed 등 웹 initialize() 의 본체 로직은 이후 슬라이스에서 채운다.
//
//  ── 다음 슬라이스 ──
//  로컬 영속화(15), 아지트 홈+스탯 패널(15~), 던전 선택·idle 보상(16), 장비(17),
//  버프 드로우(18), 전투(19~), 세션 결과·전직(...), 스킬트리·도감(...).
//
//  영웅 레벨/XP 의 진실의 원천은 GameStore.progress — UpHeroStore 가 소유하지 않는다.
//  (전투 세션 생성 시 그 시점 레벨을 스냅샷할 뿐. 웹 useUpHeroStore 와 동일.)
//

import Foundation
import Combine

@MainActor
final class UpHeroStore: ObservableObject {

    /// Up Hero 전체 상태. 화면은 이걸 구독하고, 변경은 스토어 액션으로만.
    @Published private(set) var state: UpHeroState

    init() {
        state = Self.makeDefaultState()
    }

    // MARK: - 수명주기

    /// 앱/계정 진입 시 1회 — 현재는 로드 플래그만 세운다.
    /// 웹 initialize() 의 idle accrual·영웅 레벨 동기화·주간 변종 seed 는
    /// 해당 기능 슬라이스에서 이 메서드에 덧붙인다.
    func initialize() {
        guard !state.isLoaded else { return }
        state.isLoaded = true
    }

    /// 로그아웃 — Up Hero 상태를 기본값으로 되돌린다. 웹 resetForSignOut.
    func resetForSignOut() {
        state = Self.makeDefaultState()
    }

    // MARK: - 기본 상태 팩토리 (웹 useUpHeroStore 초기 상태 리터럴)

    static func makeDefaultState() -> UpHeroState {
        let now = Int(Date().timeIntervalSince1970 * 1000)  // 웹 Date.now() (ms)
        return UpHeroState(
            hero: UpHeroRules.createDefaultHero(),
            inventory: [],
            coins: 0,
            passes: [:],
            dungeons: [:],
            currentSession: nil,
            pendingDungeon: nil,
            codex: Codex(monsters: [], equipment: [], bosses: []),
            cosmetics: Cosmetics(tentColor: nil, campfire: nil),
            lastIdleAccrualAt: now,
            lastSeenAt: now,
            heroStartLevel: nil,        // initialize 에서 seed (슬라이스 16~)
            shopDaily: nil,
            ngPlusLevel: 0,
            weeklyVariant: nil,
            schemaVersion: nil,
            hasSeenCampTutorial: false,
            idleReward: nil,            // transient
            pendingClassAwaken: nil,    // transient
            pendingClassChoice: nil,    // transient
            isLoaded: false
        )
    }
}
