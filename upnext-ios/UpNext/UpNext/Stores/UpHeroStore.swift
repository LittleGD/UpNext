//
//  UpHeroStore.swift
//  UpNext — Up Hero RPG 상태 스토어 (Phase 4 슬라이스 14 · Phase 4.4 시작).
//
//  웹 src/store/useUpHeroStore.ts 의 Zustand 스토어를 SwiftUI 반응형 스토어로 재설계.
//  GameStore 와 마찬가지로 화면 슬라이스가 요구하는 액션을 한 슬라이스씩 덧붙여 키운다
//  (1,750줄 Zustand 액션을 일괄 포팅하지 않는다 — on-demand 포팅).
//
//  ── 슬라이스 14~15 (현재) ──
//  상태 컨테이너 + 기본 상태 팩토리 + 진입점(아지트 셸) + 로컬 영속화.
//   - UpHeroState 를 보유하고, 비-세션 부분을 기기 로컬 파일에 JSON 으로 저장한다
//     (PersistedUpHeroState — UpHeroPersistence.swift). 웹 localStorage["uphero"] 대응.
//   - initialize()/resetForSignOut() 골격. idle accrual·영웅 레벨 동기화·주간 변종
//     seed 등 웹 initialize() 의 본체 로직은 이후 슬라이스에서 채운다.
//
//  ── 다음 슬라이스 ──
//  아지트 홈+스탯 패널(16), 던전 선택·idle 보상(17), 장비(...), 버프 드로우,
//  전투(currentSession 영속화 포함), 세션 결과·전직, 스킬트리·도감.
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
        // 디스크에 저장된 상태가 있으면 복원, 없으면(최초 실행) 기본 상태.
        state = Self.loadPersisted() ?? Self.makeDefaultState()
    }

    // MARK: - 수명주기

    /// 앱/계정 진입 시 1회 — 로드 플래그를 세우고 현재 상태를 디스크에 기록한다
    /// (최초 실행이면 기본 상태 파일이 이때 생성됨 — 웹 initialize → saveToStorage).
    /// 웹 initialize() 의 idle accrual·영웅 레벨 동기화·주간 변종 seed 는
    /// 해당 기능 슬라이스에서 이 메서드에 덧붙인다.
    func initialize() {
        guard !state.isLoaded else { return }
        state.isLoaded = true
        persist()
    }

    /// 로그아웃 — 메모리 상태를 디스크 저장본 기준으로 다시 맞춘다.
    /// Up Hero 는 기기 로컬 데이터라 로그아웃해도 저장 파일은 보존한다 (웹 localStorage
    /// 와 동일). 메모리만 저장본으로 되돌려, 이후 영속화가 어긋난 상태를 덮어쓰지
    /// 않게 한다. 다음 로그인 시 저장본이 그대로 복원된다.
    func resetForSignOut() {
        state = Self.loadPersisted() ?? Self.makeDefaultState()
    }

    // MARK: - 로컬 영속화 (웹 localStorage["uphero"])

    /// 현재 상태를 디스크에 저장. 상태를 바꾸는 액션이 호출한다 (best-effort).
    private func persist() {
        Self.savePersisted(state)
    }

    /// 저장 파일 — Application Support/uphero.json.
    private static var persistenceURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory,
                                           in: .userDomainMask)[0]
        return dir.appendingPathComponent("uphero.json")
    }

    /// 디스크에서 상태 복원. 파일이 없거나 손상되면 nil → 호출부가 기본 상태로 폴백.
    private static func loadPersisted() -> UpHeroState? {
        guard let data = try? Data(contentsOf: persistenceURL),
              let persisted = try? JSONDecoder().decode(PersistedUpHeroState.self, from: data)
        else { return nil }
        return persisted.toState()
    }

    /// 상태의 영속 부분(PersistedUpHeroState)을 디스크에 기록. 실패는 무시한다.
    private static func savePersisted(_ state: UpHeroState) {
        let url = persistenceURL
        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard let data = try? JSONEncoder().encode(PersistedUpHeroState(state)) else { return }
        try? data.write(to: url, options: .atomic)
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
