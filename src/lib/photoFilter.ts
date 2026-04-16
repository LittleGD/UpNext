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
