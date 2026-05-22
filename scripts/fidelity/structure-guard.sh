#!/usr/bin/env bash
# scripts/fidelity/structure-guard.sh
#
# R7 — "condensed regression 차단" 게이트. 시뮬레이터·웹 캡처 없이 빠르게(<1s) 작동.
#
# 회복 plan 원칙 #4 "No condensed regression" 의 CI 강제. 무거운 시각/모션/사운드
# pixelmatch (baseline 캡처 필요) 와 별개로, 회복 산출물이 *조용히 삭제·축소되는*
# 회귀를 정적으로 잡는다. 의도적 회귀 PR (모달 컨테이너 삭제, 사운드 축소, 아이콘
# SF 회귀 등) 이 이 게이트에서 fail 하도록 설계.
#
# 검사:
#   1. icon-audit (SF Symbol 화이트리스트) 위임
#   2. R1–R6 회복 산출물 파일 존재
#   3. 핵심 식별 심볼 존재 (부채꼴 핸드·덱 홀드·모션 프리셋·HeroSprite 등)
#   4. 27 사운드 정체성 (신규 이식 사운드 토큰 + 다파형)
#   5. PixelIcon enum 케이스 floor
#
# bash 3.2 (macOS 기본) 호환 — 연관배열 미사용.
# 사용: ./scripts/fidelity/structure-guard.sh   (exit 0 clean / exit 1 회귀)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS="${REPO_ROOT}/upnext-ios/UpNext/UpNext"
FAIL=0

fail() { echo "  ✗ $1"; FAIL=1; }
ok()   { echo "  ✓ $1"; }

echo "=== structure guard (condensed regression) ==="

# ── 1. icon-audit ──
echo "[1] SF Symbol 화이트리스트"
if "${REPO_ROOT}/scripts/fidelity/icon-audit.sh" >/dev/null 2>&1; then
    ok "icon-audit clean"
else
    fail "icon-audit 위반 — SF Symbol 회귀 (PixelIcon 으로 교체 필요)"
fi

# ── 2. 회복 산출물 파일 존재 (file|설명) ──
echo "[2] 회복 산출물 파일"
while IFS='|' read -r f desc; do
    [ -z "${f}" ] && continue
    if [ -f "${IOS}/${f}" ]; then ok "${f} (${desc})"; else fail "${f} 삭제됨 — ${desc} 회귀"; fi
done <<'EOF'
CardDrawScreen.swift|R4 부채꼴 드로우/선택
HeroSprite.swift|R5 픽셀 영웅
RarityBackdrop.swift|R4 등급 backdrop
Animations.swift|R6 모션 어휘
NumberRollView.swift|R6 슬롯 숫자 롤
OverlayContainer.swift|R6 중앙 모달
LocalProgressCache.swift|R1 익명 캐시
MergeConflictDialogView.swift|R1 머지 다이얼로그
BackupReminderBannerView.swift|R1 백업 배너
AuthFunnel.swift|R1 분석 퍼널
EOF

# ── 3. 핵심 식별 심볼 (file|패턴|설명) ──
echo "[3] 핵심 식별 심볼"
while IFS='|' read -r file pat desc; do
    [ -z "${file}" ] && continue
    if grep -q "${pat}" "${IOS}/${file}" 2>/dev/null; then ok "${file} → ${desc}"; else fail "${file} → '${desc}' 누락 (condensed regression)"; fi
done <<'EOF'
CardDrawScreen.swift|struct DeckHoldDraw|덱 홀드 드로우
CardDrawScreen.swift|struct HandCard|부채꼴 핸드 카드
CardDrawScreen.swift|struct CardPreviewOverlay|3D 프리뷰 오버레이
CardDrawScreen.swift|struct ReviewCarousel|리뷰 캐러셀
HeroSprite.swift|classVariants|8 클래스 픽셀 variant
Animations.swift|springBouncy|springBouncy 프리셋
Animations.swift|cardOverlayEnter|cardOverlayEnter 프리셋
Animations.swift|numberRoll|numberRoll 프리셋
EOF

# GameStore 는 Stores/ 하위라 별도 처리 — 익명 모드 분기 (강제 로그인 회귀 차단)
if grep -q "isAnonymous" "${IOS}/Stores/GameStore.swift" 2>/dev/null; then
    ok "GameStore.swift → 익명 모드 분기"
else
    fail "GameStore.swift → 'isAnonymous' 누락 (강제 로그인 회귀)"
fi

# ── 4. 27 사운드 정체성 ──
echo "[4] 27 사운드 정체성 (R2 신규 이식음 + 다파형)"
SND="${IOS}/SoundPlayer.swift"
MISSING_SND=0
for s in chargeUp ambientFloat pulseWave collect fireIgnite impactShake superIgnite meteorWhoosh matchPair curseTrigger rewardChoose cameraShutter polaroidSlide treeGrow; do
    grep -q "${s}" "${SND}" 2>/dev/null || { MISSING_SND=$((MISSING_SND+1)); fail "사운드 '${s}' 누락 (사운드 축소 회귀)"; }
done
[ "${MISSING_SND}" -eq 0 ] && ok "신규 14음 모두 존재 (총 27음 정체성 유지)"
# 다파형 합성 (square 단독 회귀 차단) — WaveformType enum 의 triangle/sine 토큰
if grep -qw "triangle" "${SND}" 2>/dev/null && grep -qw "sine" "${SND}" 2>/dev/null; then
    ok "다파형 합성 (square+triangle+sine)"
else
    fail "triangle/sine 파형 누락 — '거슬리는 사각파 단독' 회귀"
fi

# ── 5. PixelIcon enum 케이스 floor ──
echo "[5] PixelIcon 케이스 수"
N=$(grep -cE '^    case [a-z][A-Za-z]* *= *"' "${IOS}/PixelIcon.swift" 2>/dev/null || echo 0)
if [ "${N}" -ge 45 ]; then ok "PixelIcon ${N} cases (≥45)"; else fail "PixelIcon ${N} cases < 45 (아이콘 축소 회귀)"; fi

echo ""
if [ "${FAIL}" -eq 0 ]; then
    echo "✓ structure guard PASS — 회복 산출물 무결"
    exit 0
else
    echo "✗ structure guard FAIL — 위 항목이 R1–R6 회복을 되돌림. 머지 차단."
    exit 1
fi
