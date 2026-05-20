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

상태 범례: 🟢 ≥8 · 🟡 5-7 · 🔴 <5 · ⚪ 미측정

| # | 화면/요소 | 시드 | 시각 | 모션 | 사운드 | 사용자 | 종합 | 책임 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Splash 모션 (U↗ spring + Next clip + 태그라인 + 로딩바, 2.8s + 0.4s fade) | default | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R6 | 현재 일부 포팅됨 (SplashView.swift) — 타이밍 비교 필요 |
| 02 | LoginOverlay (Apple + Google + **건너뛰기**) | default | ⚪ | ⚪ | — | ⚪ | ⚪ | R1 | **건너뛰기 누락** — 핵심 회귀 |
| 03 | Onboarding 1: AppDescription | default | ⚪ | ⚪ | — | — | ⚪ | R5/R6 | 압축 포팅됨 |
| 04 | Onboarding 2: DifficultySelect | default | ⚪ | ⚪ | — | — | ⚪ | R5/R6 | |
| 05 | Onboarding 3: StarterPackSelect | default | ⚪ | ⚪ | ⚪ | — | ⚪ | R4/R5 | pack open 모션 |
| 06 | Onboarding 4: LevelUpScreen (파티클) | default | ⚪ | ⚪ | ⚪ | — | ⚪ | R6 | 파티클 누락 |
| 07 | BackupReminderBanner (익명 3일+) | anon_d3 | ⚪ | ⚪ | — | ⚪ | ⚪ | R1 | **미구현** |
| 08 | MergeConflictDialog (익명 → 로그인) | anon_3d + login | ⚪ | ⚪ | — | ⚪ | ⚪ | R1 | **미구현** |
| 09 | DailyHome 미드로우 | UITestSeedBoard=false | ⚪ | ⚪ | — | — | ⚪ | R3/R4 | PixelIcon 비율 회귀 |
| 10 | DailyHome 카드 드로우 6장 reveal (staggered spring + 3D drag) | UITestSeedBoard | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R4 | **stagger 없음** |
| 11 | Card 3D drag rotation (gyro + DragGesture) | UITestSeedBoard + card_id=c1 | ⚪ | ⚪ | — | ⚪ | ⚪ | R4 | gyro 미구현 |
| 12 | RarityBackdrop normal | rarity=normal | ⚪ | ⚪ | — | — | ⚪ | R4 | 색만 |
| 13 | RarityBackdrop rare/unique/legend (rb-breath/spin/sparkle) | rarity=legend | ⚪ | ⚪ | — | — | ⚪ | R4 | **keyframe 0 이식** |
| 14 | CardPackOpener pack open + 카드 reveal sequence | pending_pack | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R4 | flat reveal 회귀 |
| 15 | CardDetailModal (overlay + 3D + buff badge) | card_id=c1 | ⚪ | ⚪ | — | ⚪ | ⚪ | R4/R6 | |
| 16 | CollectionView 카드 그리드 + 카테고리 필터 | unlocked=50 | ⚪ | ⚪ | — | — | ⚪ | R3 | 아이콘 회귀 |
| 17 | AlbumView 챌린지로그 badge + 주간 그룹 | UITestSeedChallengeLog | ⚪ | ⚪ | — | — | ⚪ | R3 | |
| 18 | UpHero Camp Day (hero idle + ambient text + fire flicker) | hero_lv=10, daytime | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R5 | **252줄 stub** |
| 19 | UpHero Camp Night (분위기 변화) | hero_lv=10, nighttime | ⚪ | ⚪ | — | ⚪ | ⚪ | R5 | |
| 20 | DungeonSelectView 8 카테고리 카드 + 입구 atmosphere | dungeons_unlocked=8 | ⚪ | ⚪ | — | — | ⚪ | R5 | |
| 21 | DungeonView 전투 + 보스 등장 배너 + 결과 | combat_active | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R5 | impactShake·meteorWhoosh 누락 |
| 22 | EquipmentInventoryView 슬롯 + rarity glow | inv_n=20 | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | R5 | equip 사운드 누락 |
| 23 | NumberRoll XP 0→1234 (자릿수 슬라이드 260ms) | xp_gain=1234 | ⚪ | ⚪ | — | ⚪ | ⚪ | R6 | **미구현** |
| 24 | Modal 진입/종료 일반 (backdrop-blur + spring) | any_modal | ⚪ | ⚪ | — | ⚪ | ⚪ | R6 | `.sheet()` 단순 회귀 |

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

## 변경 이력

| 날짜 | 슬라이스 | 행 갱신 | 종합 평균 |
|---|---|---|---|
| 2026-05-20 | R0 (skeleton) | 24/24 행 작성, baseline 미캡처 | — |
