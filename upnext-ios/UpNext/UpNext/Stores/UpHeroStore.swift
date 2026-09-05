//
//  UpHeroStore.swift
//  UpNext — Up Hero RPG 상태 스토어 (Phase 4 슬라이스 14 · Phase 4.4 시작).
//
//  웹 src/store/useUpHeroStore.ts 의 Zustand 스토어를 SwiftUI 반응형 스토어로 재설계.
//  GameStore 와 마찬가지로 화면 슬라이스가 요구하는 액션을 한 슬라이스씩 덧붙여 키운다
//  (1,750줄 Zustand 액션을 일괄 포팅하지 않는다 — on-demand 포팅).
//
//  ── 슬라이스 14~18 (현재) ──
//  상태 컨테이너 + 기본 상태 팩토리 + 로컬 영속화 + initialize(idle accrual).
//   - UpHeroState 를 보유하고, 비-세션 부분을 기기 로컬 파일에 JSON 으로 저장한다
//     (PersistedUpHeroState — UpHeroPersistence.swift). 웹 localStorage["uphero"] 대응.
//   - initialize(gameLevel:) 가 heroStartLevel seed + 오프라인 수련 보상을 적용.
//     영웅 XP 는 GameStore 소관이라 지급량을 반환 → GameStore.enterUpHero 가 반영.
//
//  ── 다음 슬라이스 ──
//  장비 인벤토리, 버프 드로우, 전투(currentSession 영속화 포함),
//  세션 결과·전직, 스킬트리·도감. 주간 변종 seed 도 이후 슬라이스.
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

    /// 영속화 직후 호출되는 훅 — GameStore 가 SyncManager.syncUpHero 로 배선해
    /// 의미 있는 변경마다 클라우드 업로드를 디바운스한다 (웹 saveToStorage →
    /// syncToCloud("uphero") 라우팅 대응). 클라우드 채택(adoptCloudState)은 이 훅을
    /// 타지 않아 echo 업로드가 없다.
    var onPersist: ((UpHeroState) -> Void)?

    /// 지금 살아 있는 스토어 — `GrowthStore.deletePhoto` 의 Up Hero 캐스케이드가 잡는
    /// 참조다. 웹은 `import("./useUpHeroStore")` 로 모듈 싱글턴을 런타임에 잡아 순환
    /// 참조를 피하는데, iOS 에는 그 모듈 싱글턴이 없어 같은 역할을 여기 둔다.
    /// 앱 전체에 인스턴스는 하나(GameStore 소유)뿐이고, weak 라서 테스트가 만든
    /// 스토어가 사라지면 자동으로 비워진다 — 죽은 스토어에 쓰는 사고가 없다.
    private(set) static weak var current: UpHeroStore?

    /// 가방 화면이 열려 있는가 — 풀스크린(하단 탭 숨김) 신호.
    /// **비영속**이라 저장 파일에도 클라우드에도 나가지 않는다 (pendingDungeon 과 같은 성격).
    @Published var isBagOpen = false

    /// 마지막으로 확인한 챌린지 레벨. 격자 가방의 행 수는 영웅 유효 레벨에서 나오는데,
    /// 그 레벨의 진실의 원천은 GameStore.progress 라 스토어가 소유하지 않는다.
    /// gameLevel 을 받는 액션(initialize / confirmDungeon / acknowledgeSessionEnd)이
    /// 지날 때마다 여기 적어 두어, 레벨을 못 받는 호출부(가방 화면·해제·부적 생성)도
    /// 실제 보드와 같은 행 수를 쓴다. 비영속 — 앱을 다시 켜면 다음 진입에서 채워진다.
    private var lastKnownGameLevel: Int?

    init() {
        // 디스크에 저장된 상태가 있으면 복원, 없으면(최초 실행) 기본 상태.
        state = Self.loadPersisted() ?? Self.makeDefaultState()
        Self.current = self
    }

    // MARK: - 격자 가방 (웹 upHeroBag / placeItem / uiBagOpen)

    /// 지금 보드의 행 수. 세션 시작이 쓰는 유효 영웅 레벨(`getEffectiveHeroLevel`)과
    /// **같은 값**을 근거로 삼는다 — 로드 시점이 아니라 매 호출 시점에 계산해야
    /// 레벨업 직후에도 보드와 세션 스냅샷이 어긋나지 않는다. 웹 `currentBagRows`.
    ///
    /// 레벨을 전혀 모르면(부팅 직후 로드·클라우드 채택) 최소 행 수로 접는다.
    /// 작은 보드에 맞춘 배치는 어떤 큰 보드에서도 유효하므로, 모를 때 크게 잡아
    /// 나중에 보드 밖으로 밀려나는 것보다 안전하다.
    func currentBagRows(gameLevel: Int? = nil) -> Int {
        Self.bagRows(
            gameLevel: gameLevel ?? lastKnownGameLevel,
            heroStartLevel: state.heroStartLevel)
    }

    /// `currentBagRows` 의 상태 비의존 판. 클라우드 채택은 아직 커밋되지 않은 스냅샷의
    /// heroStartLevel 로 판정해야 해서 인스턴스 상태에 묶을 수 없다.
    static func bagRows(gameLevel: Int?, heroStartLevel: Int?) -> Int {
        guard let gameLevel else { return UpHeroBag.rowsMin }
        return UpHeroBag.bagRows(
            UpHeroRules.getEffectiveHeroLevel(
                gameLevel: gameLevel, heroStartLevel: heroStartLevel))
    }

    /// 가방 화면 열림/닫힘 신호. 값이 같으면 no-op — 매 프레임 set 이 들어와도
    /// 불필요한 objectWillChange 를 내지 않는다.
    func setBagOpen(_ open: Bool) {
        guard isBagOpen != open else { return }
        isBagOpen = open
    }

    /// 격자 배치 결과. 실패 이유가 UI 문구·햅틱 분기에 그대로 쓰인다.
    /// 웹 `PlaceResult` (`{ok:true} | {ok:false, reason}`) 의 Swift 판.
    enum PlaceResult: String, Equatable {
        case placed
        case notFound
        case outOfBounds
        case overlap
    }

    /// 격자 가방에 아이템을 놓는다 (원점 x,y + 회전 rot).
    /// 실패하면 상태를 전혀 건드리지 않는다 — UI 는 스냅백만 하면 된다.
    /// 판정은 `UpHeroBag.checkPlacement` 하나만 쓴다 (드래그 고스트 미리보기도 같은 함수).
    /// gameLevel 을 넘기면 그 레벨의 보드로 판정한다 — 화면이 8행을 그리는데 판정만
    /// 5행이면 아래 행 드롭이 전부 거절되므로, 보드를 그리는 쪽은 반드시 넘길 것.
    @discardableResult
    func placeItem(itemId: String, x: Int, y: Int, rot: Int, gameLevel: Int? = nil) -> PlaceResult {
        let rows = currentBagRows(gameLevel: gameLevel)
        // 판정 기준은 정규화된 레이아웃이다 — 손상 좌표가 남아 있으면 "빈 칸인데 겹침"
        // 같은 거짓 거절이 난다. 자기 자신의 현재 칸은 무시한다(제자리 회전).
        let normalized = UpHeroBag.normalizeBagLayout(state.inventory, rows: rows)
        guard let item = normalized.inventory.first(where: { $0.id == itemId }) else {
            return .notFound
        }
        let check = UpHeroBag.checkPlacement(
            occ: normalized.layout.occupancy, rows: rows, type: item.type,
            x: x, y: y, rot: rot, ignoreId: itemId)
        switch check {
        case .outOfBounds: return .outOfBounds
        case .overlap: return .overlap
        case .ok: break
        }
        let placed = UpHeroBag.withPlacement(item, BagPlacement(x: x, y: y, rot: rot))
        mutate { s in
            s.inventory = normalized.inventory.map { $0.id == itemId ? placed : $0 }
        }
        return .placed
    }

    /// 사진 삭제 캐스케이드 — 그 사진을 참조하는 부적을 인벤토리에서 빼고 착용 슬롯도
    /// 해제한다. GrowthStore.deletePhoto 가 호출한다 (웹 useGrowthStore.deletePhoto 안의
    /// dynamic import 캐스케이드와 같은 계약). 지우지 않으면 삭제된 이미지를 참조하는
    /// 부적이 썸네일 없이 남고 스킬만 계속 발동한다.
    /// 바뀐 게 없으면 저장하지 않는다 — 앨범 정리 한 번에 불필요한 업로드를 만들지 않는다.
    func removePhotoBindings(photoId: String) {
        let invHits = state.inventory.contains { $0.photoId == photoId }
        let equipHits = state.hero.equipped.contains { $0.value.photoId == photoId }
        guard invHits || equipHits else { return }
        mutate { s in
            s.inventory.removeAll { $0.photoId == photoId }
            for (slot, item) in s.hero.equipped where item.photoId == photoId {
                s.hero.equipped[slot] = nil
            }
        }
    }

    // MARK: - 수명주기

    /// Up Hero 진입 시 1회 — heroStartLevel seed + 오프라인 수련 보상(idle accrual).
    /// 코인은 즉시 반영하고 idleReward 스냅샷을 저장한다 (아지트가 토스트로 표시).
    /// 영웅 XP 의 진실의 원천은 GameStore.progress 라 XP 는 여기서 더하지 않고
    /// 지급할 양을 반환 — 호출부(GameStore.enterUpHero)가 progress 에 반영한다.
    /// 웹 useUpHeroStore.initialize() 대응. 이미 로드됐으면 0 (1회성).
    func initialize(gameLevel: Int) -> Int {
        // 가방 행 수 계산용 — isLoaded 여도 갱신한다 (진입할 때마다 최신 레벨).
        lastKnownGameLevel = gameLevel
        guard !state.isLoaded else { return 0 }

        var s = state
        s.isLoaded = true
        let now = Self.nowMillis()

        // heroStartLevel seed — 최초 1회. 웹은 기존 저장 데이터 마이그레이션
        //   휴리스틱(hasPlayedUpHero)으로 1 또는 curLevel 을 정하지만, 네이티브 앱은
        //   항상 brand-new 진입이라 curLevel 로 seed (영웅 Lv 을 1부터 키운다).
        if s.heroStartLevel == nil {
            s.heroStartLevel = gameLevel
        }

        // 오프라인 수련 보상 — 영웅 effective 레벨 기준 (웹과 동일).
        //   클래스 XP/coin 배율은 전직 슬라이스에서 — 현재 영웅은 무직이라 ×1.
        let heroLevel = UpHeroRules.getEffectiveHeroLevel(
            gameLevel: gameLevel, heroStartLevel: s.heroStartLevel)
        var grantedXP = 0
        let rewound = IdleAccrual.detectClockRewind(
            now: now, lastSeenAt: s.lastSeenAt, lastIdleAt: s.lastIdleAccrualAt)
        if !rewound,
           let reward = IdleAccrual.calculateIdleReward(
               elapsedMs: now - s.lastIdleAccrualAt, level: heroLevel) {
            s.coins += reward.coins
            s.idleReward = IdleRewardSnapshot(
                xp: reward.xp, coins: reward.coins,
                elapsedMin: reward.elapsedMin, rawElapsedMin: reward.rawElapsedMin)
            s.lastIdleAccrualAt = now   // 보상 지급분만큼 누적 기준점 이동
            grantedXP = reward.xp
        }
        s.lastSeenAt = now              // 시계 rewind 감지 기준 — 매 진입 갱신

        // 시작 선물 예약 — 아직 안 받았으면 매 부팅 다시 예약한다(수령 전에 앱을 껐어도
        // 다음 실행에서 연출이 다시 뜬다). 실제 지급은 claimWelcomeGift() 가 한다.
        if s.welcomeGiftClaimed != true {
            s.pendingWelcomeGift = Self.welcomeGiftCoins
        }

        state = s
        persist()
        return grantedXP
    }

    /// idle 보상 토스트 확인 — 스냅샷을 비운다. transient 라 저장은 불필요.
    func acknowledgeIdleReward() {
        state.idleReward = nil
    }

    /// 로그아웃 — 계정 경계 리셋. Up Hero 가 클라우드 동기화 대상이 된 이후로는
    /// 로컬 저장 파일을 보존하면 안 된다: 공유 기기에서 다음 계정이 로그인하면 이전
    /// 계정의 영웅이 "로컬 흔적" 으로 남아 한 방향 병합에서 이기고, 다음 변경 때
    /// 새 계정 문서로 업로드되는 cross-account 오염이 생긴다. 데이터는 Firestore 에
    /// 있으므로 재로그인 시 복원된다 (웹 signOut 의 clearAllAppStorage 와 동일).
    /// 파일 삭제는 savePersisted 와 같은 serial ioQueue 로 넘겨 in-flight write 가
    /// 삭제 뒤에 도착해 파일을 되살리는 race 를 막는다 (resetAllData 와 동일 패턴).
    func resetForSignOut() {
        state = Self.makeDefaultState()
        let url = Self.persistenceURL
        Self.ioQueue.async { try? FileManager.default.removeItem(at: url) }
    }

    /// 클라우드 스냅샷 채택 — 병합 규칙(로컬에 흔적이 없을 때만)은 호출측
    /// (GameStore.adoptCloudUpHero)이 판단한다 (웹 _setFromCloud 와 동일 소유권).
    /// 페이로드에 없는 로컬 전용 필드는 유지한다: currentSession 은 동기화 대상이
    /// 아니므로 진행 중 던전이 있으면 그대로 살아남는다. isLoaded 를 세워 이후
    /// initialize 의 heroStartLevel 재시드/idle 정산을 건너뛴다 (웹과 동일).
    /// 직접 savePersisted — onPersist 훅을 타지 않아 채택 직후 재업로드 echo 가 없다.
    func adoptCloudState(_ cloud: CloudUpHeroState) {
        var s = cloud.toState()
        // 격자 가방 — 들어온 인벤토리도 로컬 로드와 같은 계약으로 접는다. 백필(팩)은
        //   스토어 로드 경로에서만 한다 (CloudUpHeroState 디코드는 웹과 바이트 동일해야
        //   해서 손대지 않는다). 정규화·팩 모두 rowsMax 기준: 지금 레벨의 보드보다 아래 행에
        //   있는 아이템을 "겹침" 으로 오판해 좌표를 벗기지 않고, 팩도 8행에 놓아 보드 밖
        //   아이템은 suspended(보류)로 남긴다 — 미배치(자동 판매 후보)로 보내지 않는다 (웹 동일).
        s.inventory = UpHeroBag.packAllIfNonePlaced(
            UpHeroBag.normalizeBagLayout(s.inventory, rows: UpHeroBag.rowsMax).inventory,
            rows: UpHeroBag.rowsMax)
        s.currentSession = state.currentSession
        s.pendingDungeon = state.pendingDungeon
        // 시작 선물은 계정 단위 1회 — 클라우드가 "이미 받음" 이면 로컬 예약을 거둔다.
        // (그대로 두면 오버레이가 떴다가 claimWelcomeGift 가 빈손으로 닫힌다.)
        s.pendingWelcomeGift = cloud.welcomeGiftClaimed ? nil : state.pendingWelcomeGift
        s.isLoaded = true
        state = s
        Self.savePersisted(state)
    }

    // MARK: - 장비 (웹 equipItem / unequipItem / sellItem / discardItem)

    /// 인벤토리 장비를 해당 슬롯에 장착. 슬롯에 기존 장비가 있으면 인벤토리로 되돌린다.
    /// 슬롯은 item.type 으로 결정 (웹 equipItem 의 slot 인자는 item.type 과 동일).
    func equipItem(_ itemId: String) {
        mutate { s in
            guard let index = s.inventory.firstIndex(where: { $0.id == itemId }) else { return }
            let item = s.inventory[index]
            // 착용 아이템은 앵커 칸에 1칸으로 그려진다 — 좌표를 들고 가면 가방 점유가
            //   유령처럼 남고 클라우드로도 새어 나간다. 그래서 착용 시 좌표를 벗긴다.
            let worn = UpHeroBag.withoutPlacement(item)
            if let existing = s.hero.equipped[item.type] {
                // 교체면 벗겨지는 아이템이 방금 비운 footprint 를 그대로 물려받는다
                //   (같은 슬롯 = 같은 모양이라 항상 성립). 배열 자리도 같은 index 를 쓴다 —
                //   append 하면 시너지 순회와 first-fit 순서가 장착할 때마다 달라져
                //   결정성이 깨진다.
                s.inventory[index] = UpHeroBag.inheritPlacement(from: item, to: existing)
            } else {
                s.inventory.remove(at: index)
            }
            s.hero.equipped[item.type] = worn
        }
        Haptics.play(.selection)
        SoundPlayer.shared.play(.cardSelect)
    }

    /// 슬롯의 장비를 해제해 인벤토리로 되돌린다. 웹 unequipItem.
    /// gameLevel 은 보드 행 수 판정용 — 넘기지 않으면 마지막으로 확인한 레벨을 쓴다.
    func unequipItem(_ slot: EquipSlot, gameLevel: Int? = nil) {
        let rows = currentBagRows(gameLevel: gameLevel)
        mutate { s in
            guard let item = s.hero.equipped[slot] else { return }
            s.hero.equipped[slot] = nil
            // 첫 빈 자리에 놓고, 자리가 없으면 정리 대기 트레이로. 실패하지 않는다.
            s.inventory = UpHeroBag.placeIntoBag(s.inventory, item, rows: rows)
        }
        Haptics.play(.selection)
        SoundPlayer.shared.play(.cardSelect)
    }

    /// 인벤토리 장비 판매 — 등급별 코인 환급. 반환: 환급액(없으면 0). 웹 sellItem.
    @discardableResult
    func sellItem(_ itemId: String) -> Int {
        guard let item = state.inventory.first(where: { $0.id == itemId }) else { return 0 }
        let refund = UpHeroRules.sellPrice[item.rarity] ?? 0
        mutate { s in
            s.inventory.removeAll { $0.id == itemId }
            s.coins += refund
        }
        Haptics.play(.light)
        SoundPlayer.shared.play(.cancel)
        return refund
    }

    /// 인벤토리 장비 버리기 — 환급 없음. 웹 discardItem.
    func discardItem(_ itemId: String) {
        mutate { s in
            s.inventory.removeAll { $0.id == itemId }
        }
        Haptics.play(.light)
        SoundPlayer.shared.play(.cancel)
    }

    /// 상태 변경 + 발행 + 로컬 영속화 — 상태를 바꾸는 Up Hero 액션의 공통 경로.
    /// (GameStore.mutateProgress 의 Up Hero 판.)
    private func mutate(_ change: (inout UpHeroState) -> Void) {
        var s = state
        change(&s)
        state = s
        persist()
    }

    // MARK: - 던전 진입 준비 (웹 prepareBuffDraw / cancelBuffDraw)

    /// 던전 진입 전 버프 카드 6장 드로우 → pendingDungeon 에 저장. 웹 prepareBuffDraw.
    /// ownedCardIds 는 사용자 해금 카드 (GameStore.progress.unlockedCardIds — 호출부 전달).
    /// 웹의 탐험권(passes) 게이팅은 패스 경제(상점·챌린지 보상) 슬라이스에서 — 지금은 생략.
    func prepareBuffDraw(dungeonId: DungeonId, ownedCardIds: [String]) {
        let ownedSet = Set(ownedCardIds)
        let owned = CardCatalog.allCards.filter { ownedSet.contains($0.id) }
        let drawn = BuffDraw.drawBuffCards(owned: owned, dungeonId: dungeonId, drawCount: 6)
        mutate {
            $0.pendingDungeon = PendingDungeonPrep(
                dungeonId: dungeonId, drawnCardIds: drawn.map(\.id))
        }
    }

    /// 버프 드로우 취소 — pendingDungeon 클리어. 웹 cancelBuffDraw.
    func cancelBuffDraw() {
        mutate { $0.pendingDungeon = nil }
    }

    // MARK: - 전투 세션 (웹 confirmDungeon / abandonSession)

    /// 버프 선택 확정 → 전투 세션 생성. 웹 confirmDungeon.
    /// gameLevel 은 영웅 effective 레벨 산출용 (GameStore.progress.level — 호출부 전달).
    /// 탐험권(passes) 소비는 패스 경제 슬라이스에서.
    func confirmDungeon(selectedCardIds: [String], gameLevel: Int) {
        guard let prep = state.pendingDungeon else { return }
        let dungeonId = prep.dungeonId

        // 선택 카드 → 버프 (CardBuffs.getCardBuff)
        let buffs: [CardBuff] = selectedCardIds
            .compactMap { id in CardCatalog.allCards.first { $0.id == id } }
            .map(CardBuffs.getCardBuff)

        // 영웅 레벨 성장 반영 + 시작 층 (재진입 체크포인트 +1)
        lastKnownGameLevel = gameLevel   // 가방 행 수 판정 근거 갱신
        let heroLevel = UpHeroRules.getEffectiveHeroLevel(
            gameLevel: gameLevel, heroStartLevel: state.heroStartLevel)
        // 가방 시너지는 세션 스냅샷에 1회 접힌다 (전투 중 재배치 무효).
        let leveledHero = UpHeroBag.applyBagSynergy(
            UpHeroRules.computeHeroForLevel(state.hero, level: heroLevel),
            inventory: state.inventory,
            rows: UpHeroBag.bagRows(heroLevel))
        let startFloor = (state.dungeons[dungeonId]?.floorReached ?? 0) + 1

        var rng = SystemRandom()
        let session = UpHeroSession.createSession(
            dungeonId: dungeonId, hero: leveledHero, startFloor: startFloor,
            activeBuffs: buffs,
            options: CreateSessionOptions(
                ngPlusLevel: state.ngPlusLevel, isWeeklyVariant: nil,
                weeklyAffixId: nil, heroLevel: heroLevel,
                // 굴림틀 전투 버프는 탐험을 건너 이어진다.
                combatBuff: state.combatBuff),
            rng: &rng)

        mutate {
            $0.currentSession = session
            $0.pendingDungeon = nil
        }
        Haptics.play(.medium)  // 탐험 출발
        SoundPlayer.shared.play(.confirm)
    }

    /// 탐험 포기 — 세션을 .completed(heroAbandoned)로 종료시킨다. 웹 abandonSession.
    /// 즉시 비우지 않고 정상 종료 처리 → 결산 화면을 거쳐 그때까지 모은 보상을
    /// acknowledgeSessionEnd 에서 지급한다 (포기해도 번 건 챙긴다).
    func abandonSession() {
        guard let session = state.currentSession else { return }
        state.currentSession = UpHeroSession.abandonSession(session)
    }

    /// 완료된 세션 결산 — 보상을 반영하고 세션을 비운다. 웹 acknowledgeSessionEnd.
    /// 코인·장비(사망 시 절반)·던전 진행·코덱스·NG+ 는 여기서 반영하고, XP 는
    /// GameStore.progress 소관이라 지급량만 반환한다 (호출부가 progress 에 적용).
    /// 반환: 지급할 XP (세션 없음/미완료면 0).
    @discardableResult
    func acknowledgeSessionEnd(gameLevel: Int? = nil) -> Int {
        guard let session = state.currentSession,
              session.status == .completed else { return 0 }
        if let gameLevel { lastKnownGameLevel = gameLevel }   // 가방 행 수 판정 근거 갱신
        var rng = SystemRandom()

        // 보상 계산 — sessionReward.ts 의 순수 helper (state-in → 값-out).
        let keptDrops = SessionReward.calculateKeptDrops(session, rng: &rng)
        let prevProgress = state.dungeons[session.dungeonId]
        let prevBosses = prevProgress?.bossesDefeated ?? []
        let newBosses = SessionReward.calculateBossesDefeated(
            log: session.log, existing: prevBosses)
        let newDungeonProgress = SessionReward.calculateDungeonProgress(
            session: session, existing: prevProgress, newBossesDefeated: newBosses)
        let newCodex = SessionReward.calculateCodexDelta(
            log: session.log, current: state.codex)
        // NG+ — F30 보스를 이번 세션에 처음 처치 시 +1 (weekly variant 제외).
        let clearedF30Newly = newBosses.contains(30) && !prevBosses.contains(30)

        // 17-leaderboard-dummy — 주간 변종 세션이면 clearedDungeons/bestScore 갱신 +
        //   최고 점수 경신 시 Firestore 업로드(fire-and-forget). 웹 useUpHeroStore.ts:1373-1405.
        //   F30 미도달 실패도 floorsCleared 기반 점수는 산출(웹 R2). 세션 로그의 F30 보스
        //   victory 유무로 클리어 판정(prevBosses 와 무관 — 웹 R3).
        var uploadPayload: (score: Int, floors: Int, heroLevel: Int, clsRaw: String?)?
        if session.isWeeklyVariant == true, let weekly = state.weeklyVariant {
            let bossesThisSession = SessionReward.calculateBossesDefeated(
                log: session.log, existing: [])
            let clearedF30 = bossesThisSession.contains(30)
            let reachedFloors = max(0, session.currentFloor - session.startFloor)
            let floorsCleared = clearedF30 ? reachedFloors + 1 : reachedFloors
            // 웹 파리티: 정산 시점에 gameLevel-heroStartLevel+1 재계산 — 세션 도중
            // 챌린지 XP 로 레벨업하면 시작 스냅샷(session.heroLevel)은 낮은 점수를
            // isNewBest 로 영구 업로드하는 비가역 결함이 있었다(코드리뷰 must-fix).
            // gameLevel 미전달 폴백만 스냅샷 사용.
            let heroLv: Int
            if let gl = gameLevel {
                heroLv = UpHeroRules.getEffectiveHeroLevel(
                    gameLevel: gl, heroStartLevel: state.heroStartLevel)
            } else {
                heroLv = max(1, session.heroLevel ?? 1)
            }
            let score = UpHeroRules.computeWeeklyScore(
                floorsCleared: floorsCleared, remainingTime: session.time, heroLevel: heroLv)
            let isNewBest = score > weekly.bestScore
            if isNewBest {
                uploadPayload = (score, floorsCleared, heroLv, session.hero.classType?.rawValue)
            }
        }

        // 드롭을 격자 가방에 넣고, 정리 대기 트레이가 넘치면 초과분을 자동 판매한다.
        //   결과 모달의 미리보기도 같은 순수 함수를 써야 화면과 실제가 어긋나지 않는다.
        let bagRowsForSettle = currentBagRows(gameLevel: gameLevel)

        mutate { s in
            s.coins += session.rewards.coins
            let settled = SessionReward.settleBagAfterSession(
                inventory: s.inventory, keptDrops: keptDrops, rows: bagRowsForSettle)
            s.inventory = settled.inventory
            s.coins += settled.coins
            // Phase 15 — 이번 탐험에서 번 방지권을 지갑으로 합산 (상한 99).
            // 보스 드롭·보물상자·굴림틀이 전부 session.rewards 에 쌓아둔 것이다.
            if session.rewards.destroyGuards > 0 {
                s.destroyGuards = min(
                    UpHeroRules.enhanceGuardMax,
                    (s.destroyGuards ?? 0) + session.rewards.destroyGuards)
            }
            if session.rewards.downGuards > 0 {
                s.downGuards = min(
                    UpHeroRules.enhanceGuardMax,
                    (s.downGuards ?? 0) + session.rewards.downGuards)
            }
            // 굴림틀 전투 버프 잔여분을 탐험 밖 보관소로 되쓴다. 세션 층위 pct 는
            // 퍼센트 포인트(10), 상태 층위는 비율([0,1] 클램프) — CombatBuff 주석 참고.
            s.combatBuff = session.combatBuff.flatMap {
                CombatBuff.normalized(pct: $0.pct, battlesLeft: $0.battlesLeft)
            }
            s.dungeons[session.dungeonId] = newDungeonProgress
            s.codex = newCodex
            if clearedF30Newly, session.isWeeklyVariant != true {
                s.ngPlusLevel = (s.ngPlusLevel ?? 0) + 1
            }
            // 주간 변종 최고 점수 갱신 + 클리어 던전 기록 (state commit 후 업로드는 아래).
            if session.isWeeklyVariant == true, var weekly = s.weeklyVariant {
                if let payload = uploadPayload {
                    weekly.bestScore = max(weekly.bestScore, payload.score)
                    let bosses = SessionReward.calculateBossesDefeated(log: session.log, existing: [])
                    if bosses.contains(30), !weekly.clearedDungeons.contains(session.dungeonId) {
                        weekly.clearedDungeons.append(session.dungeonId)
                    }
                }
                s.weeklyVariant = weekly
            }
            s.currentSession = nil
        }

        // state commit 뒤 fire-and-forget 업로드(웹 R1 — atomic 순서 고정). 성공 시에만
        //   lastUploadedAt 갱신(웹 R3). 익명/미로그인은 서비스 내부에서 skip.
        if let payload = uploadPayload {
            let week = state.weeklyVariant?.week ?? RetentionEngine.weekId(for: AppClock.todayString())
            let anon = AppConfig.loc("익명 영웅")
            let clearedAt = Self.nowMillis()
            Task { [weak self] in
                let result = await WeeklyLeaderboardService.uploadWeeklyScore(
                    weekId: week, score: payload.score, floorsCleared: payload.floors,
                    heroLevel: payload.heroLevel, classType: payload.clsRaw,
                    clearedAt: clearedAt, anonymousFallback: anon)
                // Task 는 @MainActor UpHeroStore 컨텍스트를 상속 — await 이후 다시 메인.
                guard result == .ok, let self else { return }
                if self.state.weeklyVariant?.week == week {
                    self.mutate { $0.weeklyVariant?.lastUploadedAt = Self.nowMillis() }
                }
            }
        }
        return session.rewards.xp
    }

    // MARK: - 전투 진행 (웹 tickSession / resolveChoice / resolveMinigame)

    /// 전투 한 스텝 진행 — status 에 따라 tick / 선택 자동결정 / 미니게임 자동해결 /
    /// 보스 자동재개. 슬라이스 22 는 자동 진행 — 이벤트 선택지 인터랙션은 다음 슬라이스.
    /// currentSession 은 영속 대상이 아니므로(PersistedUpHeroState 제외) persist 를
    /// 건너뛴다 — 매 tick 파일 쓰기 방지.
    func advanceCombat() {
        guard var session = state.currentSession else { return }
        let wasOngoing = session.status != .completed
        var rng = SystemRandom()
        switch session.status {
        case .active:
            // 굴림틀 이벤트 등장 게이트가 오늘 횟수(shopDaily.slotSpins)를 읽는다 —
            //   상한에 닿은 날은 굴림틀이 후보에서 빠진다.
            session = UpHeroSession.tickSession(
                session, flavor: FlavorPool.bundled,
                slotSpinsToday: Self.slotSpinsToday(state.shopDaily), rng: &rng)
        case .paused:
            // 보스 등장 연출 — 슬라이스 22 는 자동 재개 (인트로 연출은 이후 슬라이스).
            session.status = .active
        case .awaitingChoice:
            // 사용자가 선택지를 고를 때까지 대기 — resolveChoice 가 전투를 재개시킨다.
            return
        case .awaitingMinigame:
            // R8 — 미니게임은 UI 가 resolveMinigameResult(success:) 로 처리.
            // 여기선 자동 진행하지 않고 대기 — DungeonView 가 MinigameRouter 오버레이를 띄움.
            return
        case .completed:
            return
        }
        // 이번 스텝에 탐험이 끝났으면 결산 햅틱·사운드 (매 tick 이 아니라 종료 1회).
        // fullClear — 던전 결산은 데일리 풀클리어급 임팩트.
        if wasOngoing, session.status == .completed {
            Haptics.play(.success)
            SoundPlayer.shared.play(.fullClear)
        }
        state.currentSession = session
    }

    /// 이벤트 선택지 해결 — 사용자가 고른 옵션으로 전투를 재개시킨다. 웹 resolveChoice.
    ///
    /// 굴림틀 pity — 상태 스트릭(`UpHeroState.slotBlankStreak`)이 진실이다. 세션의
    /// `slotBlankStreak` 는 운반용 사본: 해소 직전에 상태 값을 적어 넘기고(세션 배선
    /// `applySpinSlot` 이 롤 입력으로 읽는다), 굴림이 실제로 일어났으면 결과로 상태를
    /// 갱신한다 (보상 0 / 꽝 +1, `UpHeroSlot.nextBlankStreak`). 이 경우엔 persist 해서
    /// 스트릭이 탐험 종료를 기다리지 않고 클라우드로 나간다. 굴림이 없으면(건너가기·
    /// 잔액 부족) 스트릭은 건드리지 않고, currentSession 만 바뀌므로 persist 생략.
    ///
    /// 오늘 굴림 횟수(`shopDaily.slotSpins`)도 같은 seam — 스냅샷을 넘기고, 굴림이
    /// 실제로 일어났으면 +1. 세션은 두 카운터 어느 쪽도 갖지 않는다. `spinSlotAgain`
    /// 도 이 함수로 들어오므로 카운터와 persist 는 한 경로뿐이다.
    func resolveChoice(_ optionIndex: Int) {
        guard var session = state.currentSession,
              session.status == .awaitingChoice else { return }
        let streak = UpHeroSlot.normalizeBlankStreak(state.slotBlankStreak)
        session.slotBlankStreak = streak
        let spinsToday = Self.slotSpinsToday(state.shopDaily)
        var rng = SystemRandom()
        let next = UpHeroSession.resolveChoice(
            session, optionIndex: optionIndex, slotSpinsToday: spinsToday, rng: &rng)
        if let spin = Self.findNewSlotSpin(prev: session, next: next) {
            var daily = Self.currentShopDaily(state.shopDaily)
            daily.slotSpins = spinsToday + 1
            mutate {
                $0.currentSession = next
                $0.slotBlankStreak = UpHeroSlot.nextBlankStreak(prev: streak, outcome: spin.outcome)
                $0.shopDaily = daily
            }
        } else {
            state.currentSession = next
        }
    }

    /// 굴림틀 1회 굴림이 이번 선택 해소로 일어났는지 — 새로 붙은 로그 엔트리 중
    /// `slot` 페이로드를 가진 choiceResult 를 찾는다. 잔액/상한 게이트에 막힌 선택은
    /// slot 페이로드가 없어 nil 이고, 그 경우 스트릭은 건드리지 않는다. 웹 `findNewSlotSpin`.
    static func findNewSlotSpin(prev: CombatSession, next: CombatSession) -> SlotResultPayload? {
        guard next.log.count > prev.log.count else { return nil }
        for i in prev.log.count..<next.log.count {
            if case let .choiceResult(_, _, _, _, _, _, _, slot?, _) = next.log[i] { return slot }
        }
        return nil
    }

    /// "한 번 더" — 결과 모달에서 선택지 패널을 거치지 않고 굴림틀을 다시 돌린다.
    ///
    /// 굴림틀 이벤트를 다시 세팅하고(`.choice` 엔트리 + awaitingChoice) 첫 선택지를
    /// 곧바로 해소한다 — 스핀 로직·비용·상한·pity 가 전부 `resolveChoice` 한 경로를
    /// 타므로 두 번째 구현이 생기지 않는다. 게이트는 모달(남은 스핀·지갑)과 여기
    /// (`canSpinSlot`) 양쪽에 건다: 모달이 뜬 사이 상태가 바뀌어도 코인이 새지 않는다.
    func spinSlotAgain() {
        guard var session = state.currentSession,
              session.status == .active,
              UpHeroSession.canSpinSlot(
                  session, slotSpinsToday: Self.slotSpinsToday(state.shopDaily)) else { return }
        let ev = UpHeroSlotEvent.event
        session.log.append(.choice(
            prompt: ev.prompt, promptKey: ev.promptKey, promptParams: nil,
            options: ev.options, resolvedIndex: nil, variant: nil, timeoutMs: nil,
            defaultOptionIndex: nil, isMystery: nil, timestamp: Self.nowMillis()))
        session.pendingChoiceIndex = session.log.count - 1
        session.status = .awaitingChoice
        state.currentSession = session
        resolveChoice(0)
    }

    /// R8 — 모든 영웅 데이터 리셋. 로컬 캐시 삭제 + 메모리 상태 초기.
    /// 파일 삭제는 savePersisted 와 같은 serial ioQueue 로 넘겨, 리셋 직전 in-flight
    /// write 가 리셋 뒤에 도착해 파일을 되살리는 race 를 막는다(FIFO 순서 보장).
    func resetAllData() {
        state = Self.makeDefaultState()
        let url = Self.persistenceURL
        Self.ioQueue.async { try? FileManager.default.removeItem(at: url) }
    }

    /// 장비 강화 — 웹 `useUpHeroStore.enhanceItem` 1:1.
    ///
    /// 구 iOS 구현은 등급·레벨을 아예 보지 않고 100 코인 고정 / 70·20·10 롤이었다.
    /// 이제 웹과 같은 공식을 쓴다:
    ///   1. inventory → 장착 슬롯 순으로 대상 탐색 (장착 중인 장비도 강화 가능)
    ///   2. +10 이면 maxed, 코인 부족이면 coinShort — 코인은 건드리지 않고 반환
    ///   3. 성공률 = enhanceSuccessRate(등급, 현재레벨, 연속실패) — soft pity 포함
    ///   4. 성공: enhanceLevel +1, 짝수 레벨에서 primary stat +1, 이름 " +N" 재부여,
    ///      failStreak 리셋
    ///   5. 실패: enhanceOutcomeRates 로 소실 / 하락 / 유지 3분기. failStreak +1.
    ///   6. 코인은 성공/실패 무관 차감 (시도 자체의 비용)
    ///
    /// **방지권 계약** — `guards` 는 "쓸 의사" 일 뿐이고, 여기가 그 계약의 유일한
    /// 집행 지점이다:
    ///   1) 판정은 방지권 보유·장착 여부와 무관하게 원래 확률로 굴린다.
    ///   2) 결과가 유지면 막을 것이 없으므로 **아무것도 소모하지 않는다**.
    ///   3) 소실이 났고 소실방지권을 걸었고 보유가 1 이상일 때만 1장 태우고 지킨다.
    ///   4) 하락도 같은 규칙으로 하락방지권이 막는다.
    /// 소실과 하락은 배타적이므로 한 시도에서 두 종류가 같이 소모되지 않는다.
    /// 안전 구간(현재 레벨 0..2)에서는 소실·하락 판정 자체가 나지 않으므로 방지권은
    /// 절대 줄지 않는다 — UI 는 그 구간에서 토글을 아예 그리지 않는다.
    @discardableResult
    func enhanceItem(
        _ itemId: String, guards: EnhanceGuardArm = EnhanceGuardArm()
    ) -> EnhanceResult {
        // 1. 대상 탐색 — inventory 우선, 없으면 장착 슬롯 (웹과 같은 순서).
        var equippedSlot: EquipSlot?
        var found: Equipment?
        if let inv = state.inventory.first(where: { $0.id == itemId }) {
            found = inv
        } else {
            for slot in [EquipSlot.weapon, .armor, .accessory, .talisman] {
                if let e = state.hero.equipped[slot], e.id == itemId {
                    equippedSlot = slot
                    found = e
                    break
                }
            }
        }
        guard let item = found else { return .notFound }

        // 2. 상한 / 비용 검증. 둘 다 코인을 차감하지 않는다.
        let curLevel = item.enhanceLevel ?? 0
        guard curLevel < UpHeroRules.maxEnhanceLevel else { return .maxed }
        let cost = UpHeroRules.enhanceCost(rarity: item.rarity, currentLevel: curLevel)
        guard state.coins >= cost else { return .coinShort(need: cost) }

        // 원래 자리에 새 아이템을 되꽂는/빼는 헬퍼 (웹 replaceItem / removeItem).
        //   호출부의 newItem 은 전부 `var newItem = item` 사본이라 가방 좌표
        //   (bagX/bagY/bagRot)가 그대로 따라온다 — 강화는 자리 이동이 아니다.
        //   소실(remove)은 배열에서 빠지므로 칸도 자동으로 비워진다.
        let slot = equippedSlot
        func replace(_ s: inout UpHeroState, _ newItem: Equipment) {
            if let slot {
                s.hero.equipped[slot] = newItem
            } else if let idx = s.inventory.firstIndex(where: { $0.id == itemId }) {
                s.inventory[idx] = newItem
            }
        }
        func remove(_ s: inout UpHeroState) {
            if let slot {
                s.hero.equipped[slot] = nil
            } else {
                s.inventory.removeAll { $0.id == itemId }
            }
        }

        // 3. 성공 판정 — 누적 실패(pity) 반영.
        let curStreak = item.enhanceFailStreak ?? 0
        let rate = UpHeroRules.enhanceSuccessRate(
            rarity: item.rarity, currentLevel: curLevel, failStreak: curStreak)

        if Double.random(in: 0..<1) < rate {
            // 4. 성공 — 짝수 레벨에서만 primary stat +1 ("스킬이 주 보상" 원칙).
            let newLevel = curLevel + 1
            var newStats = item.stats
            if newLevel % 2 == 0, let primary = UpHeroRules.pickPrimaryStatKey(newStats) {
                newStats[primary] = (newStats[primary] ?? 0) + 1
            }
            var newItem = item
            newItem.name = UpHeroRules.stripEnhanceSuffix(item.name) + " +\(newLevel)"
            newItem.stats = newStats
            newItem.enhanceLevel = newLevel
            newItem.enhanceFailStreak = 0
            mutate { s in
                s.coins -= cost
                replace(&s, newItem)
            }
            return .success(newItem: newItem, prevLevel: curLevel)
        }

        // 5. 실패 — 소실 / 하락 / 유지 3분기. 확률은 enhanceOutcomeRates 단일 출처에서
        //    온다 (UI 표기와 같은 값). 누적 구간 한 번의 롤로 셋을 가른다 — 두 번 굴리면
        //    두 표의 확률이 조건부로 얽혀 UI 에 적어둔 숫자와 실제가 달라진다.
        let rates = UpHeroRules.enhanceOutcomeRates(
            rarity: item.rarity, currentLevel: curLevel)
        let outcomeRoll = Double.random(in: 0..<1)
        let rolled: EnhanceGuardKind? =
            outcomeRoll < rates.destroy ? .destroy
            : outcomeRoll < rates.destroy + rates.down ? .down
            : nil   // nil = 유지

        let heldDestroy = min(UpHeroRules.enhanceGuardMax, max(0, state.destroyGuards ?? 0))
        let heldDown = min(UpHeroRules.enhanceGuardMax, max(0, state.downGuards ?? 0))
        let guardedDestroy = rolled == .destroy && guards.destroy && heldDestroy > 0
        let guardedDown = rolled == .down && guards.down && heldDown > 0

        // 실패 공통 — failStreak +1 (다음 시도에 pity 보너스). 웹과 동일한 100 cap.
        let nextStreak = min(100, curStreak + 1)

        if rolled == nil || guardedDestroy || guardedDown {
            var kept = item
            kept.enhanceFailStreak = nextStreak
            mutate { s in
                s.coins -= cost
                if guardedDestroy { s.destroyGuards = heldDestroy - 1 }
                if guardedDown { s.downGuards = heldDown - 1 }
                replace(&s, kept)
            }
            if guardedDestroy { return .guarded(item: kept, guard: .destroy) }
            if guardedDown { return .guarded(item: kept, guard: .down) }
            return .keep(item: kept)
        }

        if rolled == .down {
            // 하락 — 성공 경로의 정확한 역연산이어야 한다. 성공은 "새 레벨이 짝수일 때
            //   primary stat +1" 이었으므로, 없어지는 레벨(curLevel)이 짝수면 그때 붙은
            //   +1 을 같은 키에서 뺀다. 성공 직후에도 그 키가 여전히 최대값이라
            //   pickPrimaryStatKey 는 같은 키를 돌려준다 — 그래서 왕복이 닫힌다.
            //   성공 규칙을 바꾸면 여기도 같이 바꿀 것.
            let newLevel = max(0, curLevel - 1)
            var newStats = item.stats
            if curLevel % 2 == 0, curLevel > 0,
               let primary = UpHeroRules.pickPrimaryStatKey(item.stats) {
                // 0 미만으로는 내리지 않는다 — 손상된 저장본이 음수 스탯을 만들지 않게.
                newStats[primary] = max(0, (newStats[primary] ?? 0) - 1)
            }
            let baseName = UpHeroRules.stripEnhanceSuffix(item.name)
            var newItem = item
            newItem.name = newLevel >= 1 ? "\(baseName) +\(newLevel)" : baseName
            newItem.stats = newStats
            newItem.enhanceLevel = newLevel
            newItem.enhanceFailStreak = nextStreak
            mutate { s in
                s.coins -= cost
                replace(&s, newItem)
            }
            return .down(item: newItem, prevLevel: curLevel)
        }

        let lostName = item.name
        mutate { s in
            s.coins -= cost
            remove(&s)
        }
        return .destroyed(lostItemName: lostName)
    }

    /// R8 — 미니게임 결과 해소. UI 가 호출 — success/fail 에 따라 successEffects/failEffects 적용.
    func resolveMinigameResult(success: Bool) {
        guard let session = state.currentSession,
              session.status == .awaitingMinigame else { return }
        var rng = SystemRandom()
        state.currentSession = UpHeroSession.resolveMinigame(
            session, success: success, rng: &rng)
        if success {
            Haptics.play(.success)
            SoundPlayer.shared.play(.matchPair)
        } else {
            Haptics.play(.warning)
        }
    }

    // MARK: - 상점 (웹 purchase* 의 코인 차감부)

    /// 코인 차감 — 잔액이 충분하면 차감 후 true, 부족하면 false. 웹 purchase* 공통.
    /// 구매 품목 지급은 호출부(GameStore.buyCardPack 등)가 담당 — 코인만 여기서.
    @discardableResult
    func spendCoins(_ amount: Int) -> Bool {
        guard state.coins >= amount else { return false }
        mutate { $0.coins -= amount }
        return true
    }

    /// 코인 적립 — 컬렉션 완료/팩 환산/미니게임 보상에서 GameStore 가 호출.
    func addCoins(_ amount: Int) {
        guard amount > 0 else { return }
        mutate { $0.coins += amount }
    }

    /// 챌린지 완료 보상 탐험권. 웹 `grantExpeditionPass`.
    func grantExpeditionPass(_ category: Category, _ rarity: Rarity) {
        let gain = UpHeroRules.passGrantByRarity[rarity] ?? 1
        mutate { s in
            let current = s.passes[category] ?? 0
            s.passes[category] = min(UpHeroRules.passCapPerCategory, current + gain)
        }
    }

    // MARK: - 상점 구매 (22-shop-tickets — 웹 purchasePass / claimCoinPouch 1:1 이식)

    // MARK: - 일일 카운터 (웹 currentShopDaily / slotSpinsToday / slotSpinsLeft)

    /// 오늘 기준 `shopDaily`. 날짜(`AppClock.todayString`, 새벽 1시 경계)가 바뀌었으면
    /// 모든 일일 카운터(passesBought / coinPouchClaimed / slotSpins)가 비어 있는 새
    /// 객체다. 탐험권 구매·코인 주머니·굴림틀이 전부 이 하나를 읽어 롤오버 규칙을
    /// 한 곳에 둔다. 웹 `currentShopDaily`.
    static func currentShopDaily(_ shopDaily: ShopDaily?, today: String = AppClock.todayString()) -> ShopDaily {
        if let shopDaily, shopDaily.date == today { return shopDaily }
        return ShopDaily(date: today, passesBought: 0, coinPouchClaimed: nil, slotSpins: nil)
    }

    /// 오늘 굴림틀을 돌린 횟수 (`shopDaily.slotSpins`, 날짜 롤오버·구 저장본 부재 = 0).
    /// 세션 배선(`canSpinSlot`)에 넘기는 스냅샷이자 UI 가 "남은 횟수" 를 셈하는 근거.
    /// 세션이 아니라 여기 두어 하루에 탐험을 몇 번 하든 합산된다. 웹 `slotSpinsToday`.
    static func slotSpinsToday(_ shopDaily: ShopDaily?, today: String = AppClock.todayString()) -> Int {
        UpHeroSlot.normalizeSpins(currentShopDaily(shopDaily, today: today).slotSpins)
    }

    /// 오늘 남은 굴림 횟수. `UpHeroSlot.dailySpinCap - slotSpinsToday`, 0 미만은 0.
    /// 웹 `slotSpinsLeft`.
    static func slotSpinsLeft(_ shopDaily: ShopDaily?, today: String = AppClock.todayString()) -> Int {
        max(0, UpHeroSlot.dailySpinCap - slotSpinsToday(shopDaily, today: today))
    }

    /// 뷰용 — 오늘 남은 굴림 횟수 (선택지 패널·결과 모달 "한 번 더" 게이트가 읽는다).
    var slotSpinsLeft: Int { Self.slotSpinsLeft(state.shopDaily) }

    /// 탐험권 구매 결과. 웹 `purchasePass` 반환값("ok"/"no-coin"/"daily-cap"/"pass-cap") 대응.
    enum PurchasePassResult { case ok, noCoin, dailyCap, passCap }

    /// 탐험권 구매 — 던전별 1장, ShopPrices.expeditionPass(80) 코인. 오늘 날짜가 아니면
    /// shopDaily 를 리셋 후 진행. 일일 총 구매 cap(dailyPassPurchaseCap=8) → 던전별 보유
    /// cap(passCapPerCategory=20) 순으로 검사. 웹 useUpHeroStore.ts:1545-1580 `purchasePass`.
    @discardableResult
    func purchasePass(_ dungeonId: DungeonId) -> PurchasePassResult {
        let price = ShopPrices.expeditionPass                 // 80
        guard state.coins >= price else { return .noCoin }
        var daily = Self.currentShopDaily(state.shopDaily)
        guard daily.passesBought < UpHeroRules.dailyPassPurchaseCap else { return .dailyCap }   // 8
        let current = state.passes[dungeonId] ?? 0
        guard current < UpHeroRules.passCapPerCategory else { return .passCap }                 // 20
        daily.passesBought += 1
        mutate { s in
            s.coins -= price
            s.passes[dungeonId] = current + 1
            s.shopDaily = daily
        }
        return .ok
    }

    /// 방지권 구매 결과. 웹 `purchaseDownGuard` 의 boolean 을 사유까지 나눈 것.
    enum PurchaseGuardResult { case ok, noCoin, atCap }

    /// 하락방지권 1장 구매 — ShopPrices.downGuard(150) 코인. 보유 상한 99.
    /// 탐험권과 달리 일일 구매 제한은 없다 — 어차피 하락 순간에만 닳는 보험이라
    /// 사재기해도 얻는 이득이 "안 내려간다" 뿐이고, 코인 자체가 상한 역할을 한다.
    /// **소실방지권은 상점에서 팔지 않는다** (보스·상자·슬롯 드롭 전용).
    @discardableResult
    func purchaseDownGuard() -> PurchaseGuardResult {
        let price = ShopPrices.downGuard
        let owned = min(UpHeroRules.enhanceGuardMax, max(0, state.downGuards ?? 0))
        guard owned < UpHeroRules.enhanceGuardMax else { return .atCap }
        guard state.coins >= price else { return .noCoin }
        mutate { s in
            s.coins -= price
            s.downGuards = owned + 1
        }
        return .ok
    }

    /// 방지권 지급 — 보스 처치 드롭 · 던전 상자 · 슬롯머신이 쓰는 유일한 입구.
    /// 웹 `grantEnhanceGuards`. 음수는 무시하고 상한을 넘는 만큼은 버린다.
    /// - Returns: 실제로 늘어난 개수 (상한에 걸려 일부만 들어갔을 수 있다).
    ///
    /// 지금 iOS 에는 이 함수를 호출하는 곳이 없다 — 드롭 경로(보스/상자/슬롯)는 웹에서도
    /// 전투·슬롯 슬라이스에 속하고 아직 iOS 로 포팅되지 않았다. 소실방지권은 그때까지
    /// 웹에서 벌어 클라우드 왕복으로 넘어온 분만 iOS 에서 쓸 수 있다.
    @discardableResult
    func grantEnhanceGuards(destroy: Int = 0, down: Int = 0) -> (destroy: Int, down: Int) {
        let wantDestroy = max(0, destroy)
        let wantDown = max(0, down)
        guard wantDestroy > 0 || wantDown > 0 else { return (0, 0) }
        let cap = UpHeroRules.enhanceGuardMax
        let curDestroy = min(cap, max(0, state.destroyGuards ?? 0))
        let curDown = min(cap, max(0, state.downGuards ?? 0))
        let nextDestroy = min(cap, curDestroy + wantDestroy)
        let nextDown = min(cap, curDown + wantDown)
        mutate { s in
            s.destroyGuards = nextDestroy
            s.downGuards = nextDown
        }
        return (nextDestroy - curDestroy, nextDown - curDown)
    }

    /// 데일리 코인 주머니 — 하루 1회 무료, [coinPouchMin, coinPouchMax](20...160) 균등 랜덤
    /// 코인 지급. 오늘 이미 수령했으면 실패. 웹 useUpHeroStore.ts:1582-1608 `claimCoinPouch`.
    ///
    /// multiplier: 지급 배수. 기본 1(무료 수령), 2 는 리워드 광고를 끝까지 본 경우.
    ///   광고 시청 판정은 호출부(ShopView)가 하고 여기는 배수만 받는다 — 스토어가
    ///   광고 SDK 를 알 필요가 없다(GameStore.rerollCards 의 광고 경로와 같은 규약).
    ///   하루 1회 상한은 배수와 무관하게 동일하다.
    /// 반환: (성공 여부, 지급 코인 — 실패 시 0).
    @discardableResult
    func claimCoinPouch(multiplier: Int = 1) -> (ok: Bool, coins: Int) {
        var daily = Self.currentShopDaily(state.shopDaily)
        guard daily.coinPouchClaimed != true else { return (false, 0) }
        let rolled = Int.random(in: UpHeroRules.coinPouchMin...UpHeroRules.coinPouchMax)  // 20...160
        let granted = rolled * max(1, multiplier)
        daily.coinPouchClaimed = true
        mutate { s in
            s.coins += granted
            s.shopDaily = daily
        }
        return (true, granted)
    }

    // MARK: - 시작 선물 (신규 유저 최초 1회 100코인)

    /// 신규 유저 시작 선물 코인. 첫 리롤(ShopPrices.reroll=100) 1회분.
    static let welcomeGiftCoins = 100

    /// 시작 선물 수령 — initialize() 가 예약해 둔 pendingWelcomeGift 를 실제 코인으로
    /// 지급하고 플래그를 확정 persist 한다. 예약이 없으면 no-op.
    /// 오버레이 표시 여부는 호출부(MainShell)가 state.pendingWelcomeGift 로 판단한다.
    /// 웹 useUpHeroStore.claimWelcomeGrant 동치.
    @discardableResult
    func claimWelcomeGift() -> Int {
        guard let amount = state.pendingWelcomeGift, state.welcomeGiftClaimed != true else {
            return 0
        }
        mutate { s in
            s.coins += amount
            s.welcomeGiftClaimed = true
            s.pendingWelcomeGift = nil
        }
        return amount
    }

    func grantSkillPoints(_ points: Int) {
        guard points > 0 else { return }
        mutate { $0.hero.skillPoints = ($0.hero.skillPoints ?? 0) + points }
    }

    enum LearnSkillResult { case ok, already, notFound, noClass, needLevel, noPoints }

    /// Phase 12d — 스킬트리에서 스킬 포인트로 클래스 스킬 해금. 웹 `learnSkill` 동치.
    /// gameLevel 은 호출부(뷰)가 store.progress.level 로 주입(confirmDungeon 패턴).
    @discardableResult
    func learnSkill(_ skillId: String, gameLevel: Int) -> LearnSkillResult {
        guard let cls = state.hero.classType else { return .noClass }
        guard let skill = ClassSkills.findSkillById(skillId) else { return .notFound }
        guard skill.skillClass.rawValue == cls.rawValue else { return .noClass }
        let heroLevel = UpHeroRules.getEffectiveHeroLevel(
            gameLevel: gameLevel, heroStartLevel: state.heroStartLevel)
        guard heroLevel >= skill.requiredLevel else { return .needLevel }
        let learned = state.hero.learnedSkills ?? []
        guard !learned.contains(skillId) else { return .already }
        let points = state.hero.skillPoints ?? 0
        guard points >= skill.pointCost else { return .noPoints }
        mutate { s in
            s.hero.learnedSkills = learned + [skillId]
            s.hero.skillPoints = points - skill.pointCost
        }
        Haptics.play(.celebration)   // 스킬 해금 — 성장 순간
        SoundPlayer.shared.play(.levelUp)
        return .ok
    }

    /// 전직 전 튜토리얼 스킬 자동 해금. 웹 `grantNoviceSkills`.
    func grantNoviceSkills(_ level: Int) {
        let unlocks: [String]
        switch level {
        case 15...:
            unlocks = ClassSkills.noviceSkills.map(\.id)
        case 5...:
            unlocks = Array(ClassSkills.noviceSkills.prefix(2)).map(\.id)
        case 1...:
            unlocks = Array(ClassSkills.noviceSkills.prefix(1)).map(\.id)
        default:
            unlocks = []
        }
        guard !unlocks.isEmpty else { return }
        mutate { s in
            var learned = s.hero.learnedSkills ?? []
            for id in unlocks where !learned.contains(id) {
                learned.append(id)
            }
            s.hero.learnedSkills = learned
        }
    }

    /// Lv30 도달 시 클래스 선택 모달을 준비. 이미 전직했거나 대기 중이면 no-op.
    func proposeClassChoice() {
        guard state.hero.classType == nil, state.pendingClassChoice == nil else { return }
        let recommendedDungeon = state.passes.max(by: { $0.value < $1.value })?.key
        let recommended: ClassType
        if let recommendedDungeon,
           let classType = UpHeroRules.classByDungeon[recommendedDungeon] {
            recommended = classType
        } else {
            recommended = .warrior
        }
        mutate { $0.pendingClassChoice = PendingClassChoice(recommended: recommended) }
    }

    // MARK: - 전직 (웹 assignClass / confirmClassChoice)

    /// 영웅 전직 — classType 을 확정한다. 이미 전직했으면 no-op. 웹 assignClass.
    /// 진행 중 세션이 있으면 그 hero 스냅샷의 classType 도 동기화.
    /// 스킬트리(learnedSkills)는 condensed — 전직 슬라이스에선 classType 만 설정한다
    /// (전투 엔진은 classType 기반 스탯·자원만 적용, 클래스 액티브 스킬은 이후).
    func assignClass(_ classType: ClassType) {
        guard state.hero.classType == nil else { return }
        // Phase 12d / Bug 2026-04 — 전직 시 해당 클래스 T1 스킬 자동 해금 +
        // learnedSkills 를 [T1] 로 완전 초기화(novice 스킬 제거 — 전직 후엔 클래스
        // 스킬트리로 성장). 진행 중 세션 hero snapshot 도 동기화해 회귀 방지.
        let t1 = ClassSkills.classSkillTrees[classType]?.first { $0.tier == 1 }
        let learned = t1.map { [$0.id] } ?? []
        mutate { s in
            s.hero.classType = classType
            s.hero.learnedSkills = learned
            s.currentSession?.hero.classType = classType
            s.currentSession?.hero.learnedSkills = learned
            s.pendingClassChoice = nil   // 전직 확정 → 자동 제안 소비
        }
        Haptics.play(.celebration)  // 전직 — 큰 분기 순간
        SoundPlayer.shared.play(.levelUp)
    }

    /// Lv.30 자동 전직 제안을 사용자가 닫았을 때(전직 안 하고 나감) — 제안 소비.
    /// 다시 보려면 아지트 '전직' CTA(classEligible) 로 진입.
    func acknowledgeClassChoice() {
        guard state.pendingClassChoice != nil else { return }
        mutate { $0.pendingClassChoice = nil }
    }

    // MARK: - 영웅 이름 / 자동 스킬 (웹 renameHero / toggleAutoSkill — HeroStatPanel)

    /// 영웅 이름 변경 — 16자 cap + 공백 trim. 웹 renameHero.
    func renameHero(_ name: String) {
        let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(16))
        guard !trimmed.isEmpty, trimmed != state.hero.name else { return }
        mutate { $0.hero.name = trimmed }
    }

    /// 아지트 첫 진입 튜토리얼을 읽음으로 기록(persist). 재호출은 no-op. 웹 markCampTutorialSeen.
    func markCampTutorialSeen() {
        guard state.hasSeenCampTutorial != true else { return }
        mutate { $0.hasSeenCampTutorial = true }
    }

    #if DEBUG
    /// UITest 전용 — 도감 발견 상태를 *실제 기록 경로*(SessionReward.calculateCodexDelta)로
    /// 시드한다. 전투 로그(.encounter/.drop)를 구성해 acknowledgeSessionEnd 와 동일한
    /// 함수로 codex 를 갱신 → "처치 후 도감 발견" 을 결정론적으로 재현(도감 표시 버그 검증용).
    func seedCodexFromCombatForUITests() {
        let pool = MonsterPool.templates[.fitness]!
        let m1 = MonsterPool.scaleMonster(pool.normal[2], dungeonId: .fitness, floor: 5)   // 산악 늑대
        let m2 = MonsterPool.scaleMonster(pool.normal[3], dungeonId: .fitness, floor: 6)   // 돌산 곰
        let m3 = MonsterPool.scaleMonster(pool.normal[6], dungeonId: .fitness, floor: 8)   // 절벽 독수리
        let boss = MonsterPool.scaleMonster(pool.bosses[0], dungeonId: .fitness, floor: 10) // 알파 늑대
        let log: [LogEntry] = [
            .encounter(monster: m1, timestamp: 0),
            .encounter(monster: m2, timestamp: 1),
            .encounter(monster: m3, timestamp: 2),
            .boss(monster: boss, floor: 10, timestamp: 3),
            .encounter(monster: boss, timestamp: 4),
        ]
        let newCodex = SessionReward.calculateCodexDelta(log: log, current: state.codex)
        mutate { $0.codex = newCodex }
    }
    #endif

    /// 액티브 스킬 자동 발동 on/off 토글. 웹 toggleAutoSkill.
    func toggleAutoSkill() {
        mutate { $0.hero.autoSkillEnabled = !($0.hero.autoSkillEnabled ?? true) }
    }

    /// 전투 중 스킬 수동 발동 (웹 SkillBar 탭). canFireSkill 통과 시 fireSkill 적용 →
    /// 자원 차감·쿨다운·효과. 결과(몬스터 사망 등)는 다음 tick 의 advanceCombat 가 처리.
    func fireSkillManual(_ skillId: String) {
        guard var s = state.currentSession, s.status == .active else { return }
        let idx = UpHeroCombat.findLastEncounterIndex(s.log)
        var monster: Monster?
        if idx >= 0, case let .encounter(m, _) = s.log[idx] { monster = m }
        guard ClassSkills.fireSkill(&s, skillId: skillId, monster: monster) else { return }
        Haptics.play(.heavy)
        SoundPlayer.shared.play(.impactShake)
        mutate { $0.currentSession = s }
    }

    // MARK: - 사진 부적 (웹 PhotoTalisman — 풀 시스템: rarity roll·코인·재의식·스킬)

    struct PhotoTalismanResult { let ok: Bool; let item: Equipment?; let error: String? }
    private func talismanFail(_ msg: String) -> PhotoTalismanResult {
        SoundPlayer.shared.play(.cancel)
        return PhotoTalismanResult(ok: false, item: nil, error: msg)
    }

    /// 사진 → 부적 최초 바인딩. 코인(80) 소모 + 랜덤 rarity roll + category 스탯.
    /// 웹 bindPhotoAsTalisman 동치. 사진 메타는 호출부(뷰)가 GrowthStore 에서 주입.
    @discardableResult
    func bindPhotoAsTalisman(photo: PhotoMeta, gameLevel: Int? = nil) -> PhotoTalismanResult {
        guard !PhotoTalisman.isBound(photo.id, inventory: state.inventory,
                                     equipped: state.hero.equipped) else {
            return talismanFail(AppConfig.loc("이미 부적으로 만든 사진이에요"))
        }
        guard state.coins >= PhotoTalisman.ritualCost else {
            return talismanFail(AppConfig.loc("코인이 부족해요 (\(PhotoTalisman.ritualCost) 필요)"))
        }
        var rng = SystemRandom()
        let rarity = PhotoTalisman.rollRarity(&rng)
        let item = PhotoTalisman.build(photo: photo, rarity: rarity)
        // 새 부적도 다른 삽입 지점과 같은 헬퍼로 들어간다 (자리 없으면 트레이).
        let rows = currentBagRows(gameLevel: gameLevel)
        mutate {
            $0.inventory = UpHeroBag.placeIntoBag($0.inventory, item, rows: rows)
            $0.coins -= PhotoTalisman.ritualCost
        }
        Haptics.play(.success)
        SoundPlayer.shared.play(.complete)
        return PhotoTalismanResult(ok: true, item: item, error: nil)
    }

    /// 재의식 — 바인딩된 부적 enhanceLevel +1 (rarity 유지, 스탯 미미 상승, +5/+10 스킬).
    /// 코인은 현재 레벨 스케일. 웹 rebindPhotoTalisman 동치. 장착 중인 부적도 in-place 교체.
    @discardableResult
    func rebindPhotoTalisman(photoId: String) -> PhotoTalismanResult {
        guard let found = PhotoTalisman.findBound(photoId, inventory: state.inventory,
                                                  equipped: state.hero.equipped) else {
            return talismanFail(AppConfig.loc("바인딩된 부적이 아니에요"))
        }
        let cur = found.item.enhanceLevel ?? 0
        guard cur < PhotoTalisman.maxEnhanceLevel else {
            return talismanFail(AppConfig.loc("이미 최대 강화(+\(PhotoTalisman.maxEnhanceLevel))예요"))
        }
        let cost = PhotoTalisman.rebindCost(currentLevel: cur)
        guard state.coins >= cost else {
            return talismanFail(AppConfig.loc("코인이 부족해요 (\(cost) 필요)"))
        }
        let newItem = PhotoTalisman.rebuild(current: found.item, newLevel: cur + 1)
        mutate { s in
            s.coins -= cost
            switch found.location {
            case .inventory:
                if let idx = s.inventory.firstIndex(where: { $0.id == found.item.id }) {
                    // 재의식은 자리 이동이 아니다 — 새 객체가 원래 칸을 그대로 물려받아야
                    //   유저가 정리해 둔 배치가 유지된다.
                    s.inventory[idx] = UpHeroBag.inheritPlacement(
                        from: s.inventory[idx], to: newItem)
                }
            case .equipped:
                for (slot, eq) in s.hero.equipped where eq.id == found.item.id {
                    s.hero.equipped[slot] = newItem
                }
            }
        }
        Haptics.play(.success)
        SoundPlayer.shared.play(.complete)
        return PhotoTalismanResult(ok: true, item: newItem, error: nil)
    }

    /// 3초 의식 진행 중인 사진. AlbumView 가 구독해 PhotoTalismanRitual 오버레이를 띄운다.
    /// transient — 영속 대상 아님. 부적 생성은 의식 종료 시 completePhotoTalismanRitual().
    @Published var pendingTalismanPhoto: PhotoMeta?
    /// 의식 결과 부적 — 종료 후 reveal 용(있으면 AlbumView/picker 가 표시).
    @Published var lastTalismanReveal: Equipment?

    /// 부적 의식 시작. 코인 부족·이미 바인딩이면 시작하지 않고 실패 반환.
    @discardableResult
    func beginPhotoTalismanRitual(photo: PhotoMeta) -> PhotoTalismanResult {
        guard pendingTalismanPhoto == nil else {
            // error:nil 이면 UI 토스트 분기가 스킵돼 침묵 실패(코드리뷰 F1) — 사유 표면화.
            return talismanFail(AppConfig.loc("이미 의식이 진행 중이에요"))
        }
        if PhotoTalisman.isBound(photo.id, inventory: state.inventory, equipped: state.hero.equipped) {
            return talismanFail(AppConfig.loc("이미 부적으로 만든 사진이에요"))
        }
        if state.coins < PhotoTalisman.ritualCost {
            return talismanFail(AppConfig.loc("코인이 부족해요 (\(PhotoTalisman.ritualCost) 필요)"))
        }
        pendingTalismanPhoto = photo
        return PhotoTalismanResult(ok: true, item: nil, error: nil)
    }

    /// ritual 종료 시 호출. 부적을 실제 생성(bindPhotoAsTalisman)하고 pending 클리어.
    func completePhotoTalismanRitual() {
        guard let photo = pendingTalismanPhoto else { return }
        pendingTalismanPhoto = nil
        let result = bindPhotoAsTalisman(photo: photo)
        lastTalismanReveal = result.item
    }

    // MARK: - 로컬 영속화 (웹 localStorage["uphero"])

    /// 현재 상태를 디스크에 저장. 상태를 바꾸는 액션이 호출한다 (best-effort).
    /// onPersist 훅으로 클라우드 업로드도 함께 디바운스된다 (GameStore 배선).
    private func persist() {
        Self.savePersisted(state)
        onPersist?(state)
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
        var restored = persisted.toState()
        // 방지권 2종 — 필드가 없는 구 저장본은 0, 음수·상한 초과 저장본은 교정한다
        // (웹 useUpHeroStore.clampGuards 와 같은 계약).
        let cap = UpHeroRules.enhanceGuardMax
        restored.destroyGuards = min(cap, max(0, restored.destroyGuards ?? 0))
        restored.downGuards = min(cap, max(0, restored.downGuards ?? 0))
        // 오늘 굴림 횟수 — 구 저장본은 키가 없어 nil(=0), 손상 값은 [0, 100] 으로 접는다
        // (웹 loadFromStorage 의 normalizeSlotSpins 와 같은 계약). 날짜 롤오버는 읽는
        // 쪽(currentShopDaily)이 처리하므로 여기서 날짜를 건드리지 않는다.
        if let daily = restored.shopDaily {
            var fixed = daily
            fixed.slotSpins = UpHeroSlot.normalizeSpins(daily.slotSpins)
            restored.shopDaily = fixed
        }
        // 격자 가방 — 저장본 인벤토리를 보드 계약대로 정리한다. 두 단계 모두 멱등.
        //   1) normalizeBagLayout(rowsMax): 좌표 정규화(무효 삭제) + 겹침 판정.
        //      지금 레벨을 여기서는 알 수 없으므로(gameLevel 은 initialize 가 받는다)
        //      최대 보드로 판정한다 — 작은 보드로 보면 아래 행 아이템이 서로를 밀어내
        //      멀쩡한 좌표가 벗겨진다.
        //   2) packAllIfNonePlaced(rowsMax): 배치가 0개면 배열 순서 first-fit. 8행 기준으로 팩해
        //      지금 보드 밖 아이템은 suspended(보류)로 남긴다 — 미배치(자동 판매 후보)로 보내지 않는다 (웹 동일).
        //      웹은 여기에 `savedVersion < 6` 게이트가 하나 더 있지만, iOS 는 v6 이전에
        //      좌표를 **쓴 적이 없어** 구 저장본은 반드시 "배치 0개" 다 — 즉 이 규칙
        //      하나가 웹의 버전 게이트와 같은 일을 한다. 게다가 버전과 무관하므로
        //      구버전 iOS 가 좌표를 벗겨 올린 문서도 여기서 되살아난다.
        //      레벨을 모르는 시점이라 최소 보드로 팩한다 — 작은 보드에 맞춘 배치는
        //      어떤 큰 보드에서도 유효하다.
        restored.inventory = UpHeroBag.packAllIfNonePlaced(
            UpHeroBag.normalizeBagLayout(restored.inventory, rows: UpHeroBag.rowsMax).inventory,
            rows: UpHeroBag.rowsMax)
        return restored
    }

    /// 디스크 IO 전용 serial 큐 — encode + atomic write 를 메인스레드 밖에서 수행.
    /// 14-completion-delay: grantExpeditionPass(챌린지 완료마다 mutate→persist)가 메인에서
    ///   JSONEncoder.encode + write(.atomic = temp+fsync+rename)를 코얼레싱 없이 돌려 완료
    ///   틱의 메인스레드를 붙잡고 fullScreenCover/후속 입력을 지연시키던 비용을 오프메인.
    ///   serial 이라 write 순서(마지막 상태 우선)가 보장돼 torn write 없음.
    private static let ioQueue = DispatchQueue(
        label: "com.littlegd.upnext.uphero.persist", qos: .utility)

    /// 상태의 영속 부분(PersistedUpHeroState)을 디스크에 기록. 실패는 무시한다.
    private static func savePersisted(_ state: UpHeroState) {
        // 인코딩은 호출 컨텍스트(메인)에서 수행하고, 무거운 atomic 파일쓰기(temp+fsync+
        // rename — 완료 틱 메인을 붙잡던 진짜 blocking IO)만 background serial 큐로 넘긴다.
        // (인코딩을 큐 안에서 하면 @MainActor 격리 Codable 을 nonisolated 컨텍스트에서 쓰는
        //  경고가 나므로 Data 스냅샷을 만들어 넘긴다 — Data 는 Sendable.)
        let url = persistenceURL
        guard let data = try? JSONEncoder().encode(PersistedUpHeroState(state)) else { return }
        ioQueue.async {
            try? FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: url, options: .atomic)
        }
    }

    /// 현재 시각 (epoch ms) — 웹 Date.now() 대응.
    static func nowMillis() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    // MARK: - 기본 상태 팩토리 (웹 useUpHeroStore 초기 상태 리터럴)

    static func makeDefaultState() -> UpHeroState {
        let now = nowMillis()
        // 기본 영웅 이름을 인앱 언어 풀에서 뽑는다 — language 미전달 시 ko 풀로 고정돼
        // 비한국어 사용자도 한국어 이름을 받던 버그 수정(heroNamePools 에 4개국어 존재).
        let appLang = Language(rawValue:
            AppConfig.sharedDefaults?.string(forKey: AppConfig.languageKey) ?? "ko") ?? .ko
        return UpHeroState(
            hero: UpHeroRules.createDefaultHero(language: appLang),
            inventory: [],
            coins: 0,
            passes: [:],
            dungeons: [:],
            currentSession: nil,
            pendingDungeon: nil,
            codex: Codex(monsters: [], equipment: [], bosses: []),
            cosmetics: Cosmetics(tentColor: nil, campfire: nil),
            destroyGuards: 0,
            downGuards: 0,
            lastIdleAccrualAt: now,
            lastSeenAt: now,
            heroStartLevel: nil,        // initialize 에서 seed (슬라이스 16~)
            shopDaily: nil,
            ngPlusLevel: 0,
            weeklyVariant: nil,
            schemaVersion: nil,
            hasSeenCampTutorial: false,
            welcomeGiftClaimed: false,  // 최초 1회 지급 전 — claimWelcomeGift 가 true 로
            pendingWelcomeGift: nil,    // transient — initialize 에서 예약
            idleReward: nil,            // transient
            pendingClassAwaken: nil,    // transient
            pendingClassChoice: nil,    // transient
            isLoaded: false
        )
    }
}
