#!/usr/bin/env bash
# scripts/fidelity/affected-rows.sh
#
# 변경 파일 → 영향 받는 fidelity-grid 행 ID 매핑 (R7 PR-scope 캡처용).
# PR 이 건드린 파일에서 재캡처할 행만 골라 풀 24행 캡처를 피한다.
#
# 사용:
#   ./scripts/fidelity/affected-rows.sh [base_ref]    # 기본 origin/main
# 출력:
#   공백 구분 행 ID (예: "09 10 11 12"). 매칭 없으면 빈 문자열.
#
# 행 번호는 docs/fidelity-grid.md 의 24행 기준 (근사 매핑 — grid 확정 시 정밀화).

set -uo pipefail

BASE="${1:-origin/main}"
CHANGED="$(git diff --name-only "${BASE}...HEAD" 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true)"

ROWS=""
add() { case " ${ROWS} " in *" $1 "*) ;; *) ROWS="${ROWS} $1" ;; esac; }

while IFS= read -r f; do
    [ -z "${f}" ] && continue
    case "${f}" in
        *Login*|*Auth*|*Merge*|*Backup*|*Stores/GameStore*)  add 02; add 07; add 08 ;;  # R1 인증/머지/백업
        *Onboarding*|*StarterPack*|*Splash*)                  add 01; add 03; add 04; add 05; add 06 ;;  # 온보딩
        *SoundPlayer*)                                         add 05; add 10 ;;          # 사운드 동반 행
        *PixelIcon*|*Icons/*|*CategoryStyle*)                 add 09 ;;                   # 아이콘
        *CardDrawScreen*|*DailyHomeView*)                     add 09; add 10 ;;          # R4 드로우/선택
        *CardDetailModal*|*RarityBackdrop*|*CardPackOpener*)  add 11; add 12 ;;          # R4 3D/backdrop
        *UpHeroGameView*|*HeroSprite*|*HeroStatPanel*)        add 19; add 20 ;;          # R5 캠프 홈
        *DungeonSelect*|*ShopView*|*BuffDraw*)                add 21 ;;                   # R5 던전/상점
        *Animations*|*OverlayContainer*)                      add 22; add 24 ;;          # R6 모달/전환
        *NumberRoll*)                                          add 23 ;;                   # R6 NumberRoll
    esac
done <<EOF
${CHANGED}
EOF

echo "${ROWS# }"
