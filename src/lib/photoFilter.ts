/**
 * 코닥 골드/포트라 스타일 필름 룩 — 컬러 그레이딩 부분
 *
 * 특징:
 *  - sepia  0.28 : 노란-오렌지 색조 (하이라이트 따뜻하게)
 *  - saturate 1.35 : 코닥 특유의 풍부한 채도
 *  - contrast 1.08 : 필름 대비 살짝 증가
 *  - brightness 1.03 : 블랙 레벨 살짝 들어올림 (완전한 검정 방지)
 *  - hue-rotate -8deg : 블루/시안을 틸 쪽으로, 옐로우를 오렌지 쪽으로 이동
 *
 * 이 필터만으로는 컬러 톤만 변환 — 그레인/비네팅은 별도 오버레이 레이어에서 처리.
 */
export const KODAK_FILM_FILTER =
  "sepia(0.28) saturate(1.35) contrast(1.08) brightness(1.03) hue-rotate(-8deg)";

/**
 * 필름 그레인 — SVG feTurbulence 로 생성한 프랙탈 노이즈.
 *
 * 컬러 매트릭스로 노이즈 RGB 를 luminance 그레이스케일로 변환 → 풀 알파.
 * mix-blend-mode: overlay 로 합성하면 밝은 영역은 밝은 그레인, 어두운 영역은
 * 어두운 그레인이 보이는 실제 필름 그레인에 가까운 느낌이 된다.
 *
 *   <div className="absolute inset-0 mix-blend-overlay pointer-events-none"
 *        style={{ backgroundImage: FILM_GRAIN_URL, backgroundSize: "160px 160px", opacity: 0.28 }} />
 */
const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='5' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`;
export const FILM_GRAIN_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(GRAIN_SVG)}")`;

/**
 * 빈티지 비네팅 — 사진 가장자리를 살짝 어둡게 해서 렌즈 빛 손실 재현.
 * 중앙은 투명, 가장자리로 갈수록 어두워진다.
 */
export const VINTAGE_VIGNETTE =
  "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.22) 100%)";

/**
 * 빈티지 에이징 — 사진이 시간이 지나면서 누렇게 바래는 효과의 강도 계산.
 *
 * 규칙:
 *  - 3일 간격으로 한 단계(0~7)씩 진행 — "조금씩" 변화
 *  - 21일(=7단계)에서 최대, 그 이후는 더 진행하지 않음
 *  - 같은 단계 안에서도 사진별 ±15% 편차 — 알고리즘 티 나지 않게 자연스럽게
 *
 * 반환값: 빈티지 오버레이 layer 의 opacity (0 ~ 0.25)
 *   0 이면 오버레이 자체를 렌더하지 않아도 됨 (조건부 렌더로 DOM 가볍게).
 *
 * SSR 주의:
 *   함수 자체는 pure 하지만 기본 `now = Date.now()` 를 쓰면 서버 렌더 시점과
 *   클라이언트 hydrate 시점 값이 달라 하이드레이션 미스매치가 발생한다
 *   ("use client" 컴포넌트도 여전히 SSR 이 도는 점이 함정). 호출부는 반드시
 *   useEffect 로 mount 후에 호출해 결과를 state 로 두거나, 외부에서 안정적인
 *   now 값을 주입해야 한다 — 프레임 5개 모두 useState + useEffect 패턴 사용.
 */
export function computeVintageOpacity(timestamp: number, now: number = Date.now()): number {
  const DAY = 86_400_000;
  const daysPassed = Math.max(0, Math.floor((now - timestamp) / DAY));
  const ageStep = Math.min(7, Math.floor(daysPassed / 3)); // 0~7
  const ageRatio = ageStep / 7; // 0~1
  // 사진별 ±15% 편차 (LCG) — 같은 age 라도 완전히 동일 톤이 아니게
  const jitter = (((timestamp * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.3;
  const finalRatio = Math.max(0, Math.min(1, ageRatio + jitter * ageRatio));
  return finalRatio * 0.25;
}

/**
 * 빈티지 오버레이 베이스 컬러 — 바랜 앰버 톤.
 * multiply 블렌드로 얹으면 흰/베이지 여백이 누래지고 검은 사진은 거의 영향 없음
 * → 실제 폴라로이드 bleaching 패턴에 가깝다 (종이는 황변, 이미지는 Kodak 필터가
 *   이미 빈티지를 담당하므로 추가 변화 최소화).
 */
export const VINTAGE_AMBER = "rgba(200, 165, 114, 1)";
