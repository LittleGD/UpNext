# UpNext 애니메이션 매핑 — CSS @keyframes → SwiftUI

웹 `src/app/globals.css`의 47개 `@keyframes`를 SwiftUI로 옮길 때 참조하는 문서.
Phase 4 (UI 화면 native 구현)에서 각 컴포넌트 작업 시 해당 행을 펼쳐 본다.

> 원칙: 애니메이션 *코드*는 Phase 4에서 컴포넌트와 함께 작성. 이 문서는 *번역 규칙*과
> *인벤토리*만 — 미리 47개를 다 구현하지 않는다 (컴포넌트 맥락 없이는 speculative).

---

## 1. 번역 패턴 (CSS → SwiftUI 공식)

| CSS 패턴 | SwiftUI 대응 | 비고 |
|---|---|---|
| `@keyframes` from/to (단순 fade·scale·slide) | `.transition(.opacity.combined(with: .scale))` + `withAnimation` | 진입/퇴장 |
| `cubic-bezier(0.23, 1, 0.32, 1)` (= `--ease-gb-out`) | `.timingCurve(0.23, 1, 0.32, 1, duration:)` | UpNext 표준 ease-out. 거의 모든 전환에 쓰임 |
| `linear` | `.linear(duration:)` | |
| `ease-in-out` | `.easeInOut(duration:)` | |
| `animation: ... infinite` | `.repeatForever(autoreverses:)` | autoreverses는 keyframe 방향에 따라 |
| `steps(N, end)` | `keyframeAnimator`의 discrete keyframe N개 | SwiftUI에 steps() 직접 대응 없음 |
| 다단계 `0% / 50% / 100%` | `keyframeAnimator` (iOS 17+) 또는 `phaseAnimator` | iOS 16.2 fallback: 중첩 `withAnimation` |
| `forwards` (fill-mode) | SwiftUI 애니메이션은 기본적으로 끝 상태 유지 | 별도 처리 불필요 |
| float-up + fade (데미지 숫자) | `.offset(y:)` + `.opacity()` 동시 애니메이션 | 가장 흔한 게임 이펙트 패턴 |
| `prefers-reduced-motion` | `@Environment(\.accessibilityReducedMotion)` | 모든 애니메이션에 가드 |

**iOS 16.2 제약**: `keyframeAnimator`·`phaseAnimator`는 iOS 17+. 16.2 타깃이므로 다단계
애니메이션은 `@available(iOS 17, *)` 분기 또는 중첩 `withAnimation` + `DispatchQueue.asyncAfter`로
fallback. 대부분의 단순 전환은 16.2에서 `withAnimation`으로 충분.

---

## 2. 키프레임 인벤토리 (47개)

### 2.1 진입/전환 (4) — `.transition` + `withAnimation`
| keyframe | duration | 용도 | SwiftUI 접근 |
|---|---|---|---|
| `mg-shell-in` | 220ms gb-out | 미니게임 셸 진입 | `.transition(.scale + .opacity)` |
| `uphero-tab-enter` | 200ms gb-out | 탭 전환 진입 | `.transition(.opacity)` + slide |
| `uphero-ambience-in` | 520ms gb-out | 캠프 ambience fade-in | `.opacity` + `withAnimation` |
| `gb-card-in` | 220ms gb-out | 공용 카드 진입 | `.transition(.scale(0.95) + .opacity)` |

### 2.2 게임 이펙트 — float/pulse/shake (14) — `.offset`·`.scale`·`.opacity`
| keyframe | duration | 용도 |
|---|---|---|
| `uphero-crit-shake` | 260ms steps(5) | 크리티컬 피격 흔들림 |
| `uphero-card-select` | 280ms gb-out | 카드 선택 |
| `uphero-hp-regen-float` | 800ms | HP 회복 숫자 떠오름 |
| `uphero-xp-float` | 900ms | XP 획득 숫자 |
| `uphero-heal-float` | 900ms | 힐 숫자 |
| `uphero-coin-float` | 1000ms | 코인 숫자 |
| `uphero-time-tag` | 700ms | 시간 태그 |
| `uphero-start-bonus` | 1100ms | 시작 보너스 |
| `uphero-dodge-pulse` | 450ms | 회피 펄스 |
| `uphero-crit-pulse` | 500ms | 크리티컬 펄스 |
| `uphero-time-flash` | 320ms | 시간 플래시 |
| `uphero-attack-flash` | 320ms | 공격 플래시 |
| `uphero-floor-sweep` | 900ms | 층 전환 sweep |
| `uphero-num-roll-out/in` | — | 숫자 롤링 (2개) |

→ 공통 패턴: float 계열은 `.offset(y:)` -40pt + `.opacity` 1→0. 재사용 가능한
`FloatingNumberView` 컴포넌트 1개로 묶을 것 (Phase 4.4).

### 2.3 Ritual — 3초 장편 (3) — `keyframeAnimator` 권장
| keyframe | duration | 용도 |
|---|---|---|
| `uphero-ritual-photo` | 3000ms forwards | 의식 사진 등장 |
| `uphero-ritual-glow` | 3000ms linear | 의식 글로우 |
| `uphero-ritual-spark` | 2400ms forwards | 의식 스파크 |

→ 다단계 → iOS 17 `keyframeAnimator`. 16.2 fallback은 `withAnimation` 체이닝.

### 2.4 무한 루프 ambient (7) — `.repeatForever`
| keyframe | duration | 용도 |
|---|---|---|
| `shimmer` | 1.5s infinite | 스켈레톤 로딩 |
| `uphero-fire-flicker` | 4.2s infinite | 모닥불 깜빡임 |
| `uphero-typewriter-caret` | 820ms steps(2) infinite | 타이프라이터 커서 |
| `aurora-drift` | 20s infinite | 오로라 배경 드리프트 |
| `aurora-drift-alt` | 25s infinite | 오로라 변종 |
| `aurora-breathe` | 8s infinite | 오로라 호흡 |
| `minigame-curse-breath` | 2.4s infinite | 저주 호흡 |

→ `.animation(.linear(duration:).repeatForever(autoreverses: true), value:)`.
배경 ambient는 reduced-motion에서 정지.

### 2.5 Rarity backdrop — 카드 등급 연출 (16) — 가장 복잡
| keyframe | 용도 |
|---|---|
| `rb-spin-cw` / `rb-spin-ccw` | 시계/반시계 회전 |
| `rb-breath-98-106` / `-100-108` / `-97-105` / `-100-107` | 4종 호흡 스케일 |
| `rb-halo-pulse` | 헤일로 펄스 |
| `rb-aurora-op-a` / `rb-aurora-op-b` | 오로라 불투명도 2종 |
| `rb-rare-curtain` | rare 커튼 |
| `rb-unique-core` | unique 코어 |
| `rb-frag-emanate` | 파편 방출 |
| `rb-legend-core` | legend 코어 |
| `rb-sparkle` | 반짝임 |
| `rb-legend-sweep` | legend sweep |

→ Phase 4.3 (카드 시스템)에서 등급별 backdrop 컴포넌트로. `TimelineView` +
`Canvas`로 GPU 효율 렌더 검토. 가장 학습 곡선 큰 부분.

### 2.6 폴라로이드 (1)
| keyframe | duration | 용도 |
|---|---|---|
| `stickerlayer-longpress-ring-fill` | 500ms linear forwards | 롱프레스 진행 링 |

→ `Circle().trim(from:to:)` + `.animation` — SwiftUI에 천연 대응.

---

## 3. Phase 4 작업 순서 권장

1. **2.1 진입/전환** — 가장 단순, SwiftUI `.transition` 학습 입문
2. **2.6 폴라로이드 링** — `trim` 패턴 1개
3. **2.4 무한 루프** — `.repeatForever` 패턴
4. **2.2 게임 이펙트** — `FloatingNumberView` 공용 컴포넌트로 14개 흡수
5. **2.3 Ritual** — `keyframeAnimator` 첫 도입
6. **2.5 Rarity backdrop** — 마지막. 가장 복잡, `Canvas`/`TimelineView` 학습 후

---

## 4. 검증

각 애니메이션은 구현 후 실기기에서:
- 60fps 유지 (Instruments → Core Animation)
- `prefers-reduced-motion` ON 시 정지/대체
- 웹 버전과 나란히 놓고 duration·easing 체감 비교
