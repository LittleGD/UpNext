# UpNext Web ↔ iOS Native 충실도 그리드

> **이 파일은 회복 슬라이스 R0~R7 의 *유일한 머지 게이트*.** PR 은 영향 받는 행의 score 가 *하락하지 않을* 때만 통과. baseline lock 은 main 머지 시 자동 갱신.

## 점수 기준 (Web Fidelity Score)

| 축 | 측정 | 통과 |
|---|---|---|
| **시각** | side-by-side 스크린샷 + pixelmatch % | `10 - (mismatch% ÷ 2)` ≥ 8 |
| **모션** | 60fps 녹화 → ffmpeg frame 추출 → SSIM | ≥ 0.95 = 10점 |
| **사운드** | FFT 피크 / 길이 비교 (`scripts/fidelity/sound-diff.py`) | ±2% / ±5ms |
| **사용자** | 베타 N=20 A/B 정성 폴 | 평균 ≥ 8/10 |

종합 = 측정 가능한 축의 *최저값*. 해당 슬라이스가 도달해야 머지 가능.

## 시드 데이터

모든 캡처는 결정적 시드로 재현 가능해야 함:
- `UITestNow=2026-05-20` 환경변수 (iOS) / Playwright `--mock-date=2026-05-20` (web)
- `seed=fidelity-baseline-001` (RNG 시드)
- `UITestSeedBoard` / `UITestSeedReport` / `UITestSeedChallengeLog` (필요 시드 launch arg)

## 24행 baseline 표

상태 범례 (측정): 🟢 ≥8 · 🟡 5-7 · 🔴 <5 · ⚪ 미측정(캡처 대기)
구현 범례: ✅ 구현 완료 · 🟦 부분 · ⬜ 미구현/기존유지

> **측정 컬럼이 모두 ⚪ 인 이유**: 시각/모션/사운드 pixelmatch 는 web+iOS 동시 캡처
> baseline 이 선행돼야 함 (R0 산출물, 로컬 실행 대기). R1–R6 *구현* 은 아래 "구현"
> 컬럼대로 완료 — structure-guard.sh 가 정적으로 무결성을 차단한다.

| # | 화면/요소 | 시드 | 시각 | 모션 | 사운드 | 사용자 | 종합 | 책임 | 구현 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Splash 모션 (U↗ spring + Next clip + 태그라인 + 로딩바, 2.8s + 0.4s fade) | default | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R6 | 🟦 | SplashView 일부 포팅 — 타이밍 측정 필요 (슬라이스 미할당) |
| 02 | LoginOverlay (Apple + Google + **건너뛰기**) | default | ⚪ | ⚪ | — | ⚪ | ⚪ | R1 | ✅ | 건너뛰기 + 익명 부트 구현 (LoginView/GameStore) |
| 03 | Onboarding 1: AppDescription | default | ⚪ | ⚪ | — | — | ⚪ | R5/R6 | 🟦 | 압축 포팅 (온보딩 전면 회복 미할당) |
| 04 | Onboarding 2: DifficultySelect | default | ⚪ | ⚪ | — | — | ⚪ | R5/R6 | 🟦 | 압축 포팅 |
| 05 | Onboarding 3: StarterPackSelect | default | ⚪ | ⚪ | ⚪ | — | ⚪ | R4/R5 | ✅ | pack open 스태거 reveal (CardPackOpener R4) |
| 06 | Onboarding 4: LevelUpScreen (파티클) | default | ⚪ | ⚪ | ⚪ | — | ⚪ | R6 | ⬜ | 파티클 미이식 (잔여) |
| 07 | BackupReminderBanner (익명 3일+) | anon_d3 | ⚪ | ⚪ | — | ⚪ | ⚪ | R1 | ✅ | 구현 (BackupReminderBannerView, 3일+/7일 트리거) |
| 08 | MergeConflictDialog (익명 → 로그인) | anon_3d + login | ⚪ | ⚪ | — | ⚪ | ⚪ | R1 | ✅ | 구현 (MergeConflictDialogView + GameStore 머지) |
| 09 | DailyHome 미드로우 (덱 홀드) | UITestSeedBoard=false | ⚪ | ⚪ | — | — | ⚪ | R3/R4 | ✅ | PixelIcon + 덱 홀드 드로우 (DeckHoldDraw) |
| 10 | DailyHome 카드 드로우 6장 reveal (staggered spring + 3D drag) | UITestSeedBoard | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R4 | ✅ | 부채꼴 핸드 + springBouncy stagger + 스와이프업 |
| 11 | Card 3D drag rotation (gyro + DragGesture) | UITestSeedBoard + card_id=c1 | ⚪ | ⚪ | — | ⚪ | ⚪ | R4 | ✅ | CardGyro(CMMotionManager) + drag 합성 |
| 12 | RarityBackdrop normal | rarity=normal | ⚪ | ⚪ | — | — | ⚪ | R4 | ✅ | TimelineView backdrop (RarityBackdrop.swift) |
| 13 | RarityBackdrop rare/unique/legend (rb-breath/spin/sparkle) | rarity=legend | ⚪ | ⚪ | — | — | ⚪ | R4 | ✅ | spin/breath/sparkle/legend-sweep 이식 |
| 14 | CardPackOpener pack open + 카드 reveal sequence | pending_pack | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R4 | ✅ | RevealCard 스태거 reveal + cardFlip |
| 15 | CardDetailModal (overlay + 3D + buff badge) | card_id=c1 | ⚪ | ⚪ | — | ⚪ | ⚪ | R4/R6 | ✅ | Card3DView 3D + gyro + RarityBackdrop |
| 16 | CollectionView 카드 그리드 + 카테고리 필터 | unlocked=50 | ⚪ | ⚪ | — | — | ⚪ | R3 | ✅ | PixelIcon 표준화 |
| 17 | AlbumView 챌린지로그 badge + 주간 그룹 | UITestSeedChallengeLog | ⚪ | ⚪ | — | — | ⚪ | R3 | ✅ | category.pixelIcon badge |
| 18 | UpHero Camp Day (hero idle + ambient text + fire flicker) | hero_lv=10, daytime | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R5 | ✅ | HeroSprite + AmbientFlickerText + 빛줄기 (252줄 stub 해소) |
| 19 | UpHero Camp Night (분위기 변화) | hero_lv=10, nighttime | ⚪ | ⚪ | — | ⚪ | ⚪ | R5 | 🟦 | ambient/fire 구현 · 낮/밤 변주는 웹 HomeView 미존재 |
| 20 | DungeonSelectView 8 카테고리 카드 + 입구 atmosphere | dungeons_unlocked=8 | ⚪ | ⚪ | — | — | ⚪ | R5 | ✅ | 카테고리 아이콘 + themeColor 틴트 + 탐험권 배지 |
| 21 | DungeonView 전투 + 보스 등장 배너 + 결과 | combat_active | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R5 | 🟦 | impactShake·meteorWhoosh 사운드 ✅(R2) · 전투 UI 기존유지 |
| 22 | EquipmentInventoryView 슬롯 + rarity glow | inv_n=20 | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R5 | 🟦 | equip 사운드 ✅(R2) · 슬롯 UI 기존유지 |
| 23 | NumberRoll XP 0→1234 (숫자 블록 롤 260ms) | xp_gain=1234 | ⚪ | ⚪ | — | ⚪ | ⚪ | R6 | ✅ | NumberRollView (AppHeader XP/Lv·코인) |
| 24 | Modal 진입/종료 일반 (backdrop-blur + spring) | any_modal | ⚪ | ⚪ | — | ⚪ | ⚪ | R6 | ✅ | OverlayContainer (cardOverlayEnter) — confirm류 적용 |

## 베이스라인 캡처 방법

```bash
# 1. 환경 준비
cd /Users/jmlee/Documents/UpNext
brew install ffmpeg                    # SSIM diff
python3 -m pip install librosa pixelmatch playwright  # sound + 시각 diff
playwright install chromium

# 2. iOS 시뮬레이터 부팅 + 앱 설치
xcrun simctl boot "iPhone 17"
xcodebuild -project upnext-ios/UpNext/UpNext.xcodeproj -scheme UpNext \
  -destination 'platform=iOS Simulator,name=iPhone 17' build
xcrun simctl install booted /tmp/upnext-build/.../UpNext.app

# 3. 모든 24행 캡처
for row in 01 02 03 ... 24; do
  ./scripts/fidelity/snapshot-pair.sh "$row"
done

# 4. 결과 보기
open docs/fidelity/$(date +%Y%m%d)/
```

## 머지 게이트 동작

1. PR 이 `upnext-ios/` 또는 `src/` 의 *시각/모션/사운드* 영향 파일 변경
2. CI (`fidelity-gate.yml`) 가 영향 받는 행을 자동 식별
3. 해당 행만 재캡처 → diff → score 갱신
4. *하나라도 score 하락* 시 PR fail
5. main 머지 시 grid 의 새 score 가 baseline 으로 lock

## 머지 게이트 — 실제 작동 (R7)

CI (`fidelity-gate.yml`) 는 **두 tier**:

- **BLOCKING (오늘 작동)**:
  - `guard` — `icon-audit.sh`(SF Symbol 화이트리스트) + `structure-guard.sh`(회복 산출물
    정적 무결성: 파일 존재·핵심 심볼·27 사운드·다파형·PixelIcon floor). 의도적 회귀
    (모달 컨테이너 삭제·사운드 축소·아이콘 SF 회귀) 가 여기서 fail.
  - `build-test` — iOS 빌드 + 단위/UI 테스트 (RetentionFlowUITests 가 리텐션 UI 회귀 잡음).
- **INFORMATIONAL (baseline 캡처 후 차단 전환)**: `fidelity-capture`/`nightly` — 시각
  pixelmatch + 사운드 FFT. 현재 `continue-on-error` (baseline 미캡처) — PR 코멘트·아티팩트만.

baseline 캡처(위 "베이스라인 캡처 방법") 가 로컬에서 1회 실행되면 시각/모션/사운드 축이
🟢 로 채워지고, INFORMATIONAL tier 를 BLOCKING 으로 승격한다.

## 변경 이력

| 날짜 | 슬라이스 | 행 갱신 | 비고 |
|---|---|---|---|
| 2026-05-20 | R0 (skeleton) | 24/24 행 작성, baseline 미캡처 | — |
| 2026-05-21 | R1–R6 구현 마감 | 구현 컬럼 갱신 (✅ 18 / 🟦 5 / ⬜ 1) | 측정 컬럼은 baseline 캡처 대기 |
| 2026-05-21 | R7 게이트 | structure-guard + build-test BLOCKING tier 작동 | 의도적 회귀 차단 검증됨 |
