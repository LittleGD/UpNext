"use client";

import { KODAK_FILM_FILTER, FILM_GRAIN_URL, VINTAGE_VIGNETTE } from "@/lib/photoFilter";

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode; // 서명/캡션 캔버스 슬롯 — 폴라로이드 하단
}

// Figma p-frame3 원본 좌표계 (184 x 223)
// - 이미지 슬롯(Frame 39): 154 x 157 @ (15, 14)
// - 하단 캡션 영역: (15, 171) ~ (169, 223) — 52px 높이
// - Polygon 3: 32.26 x 32.26 @ (176.14, 207) mix-blend-multiply rotate 18.66deg
// - Vector 20: 140 x 18.344 @ (-18, 189) — 좌측 밖으로 삐져나온 라인
// - Vector 21: flex wrapper 187.25 x 170.607 @ (100, 98), 내부 235.072 x 18.344 strip rotate -41.89deg
//
// 렌더 시 ~300px 폭으로 확대 (300 / 184 ≈ 1.6304) — 좌표/크기를 모두 동일 배율로 스케일.
const S = 300 / 184; // ≈ 1.6304
const FRAME_W = 184 * S; // 300
const FRAME_H = 223 * S; // ≈ 363.59

// 이미지 슬롯
const IMG_LEFT = 15 * S;
const IMG_TOP = 14 * S;
const IMG_W = 154 * S;
const IMG_H = 157 * S;

// 하단 캡션 영역
const CAP_LEFT = 15 * S;
const CAP_TOP = (14 + 157) * S; // 171 * S
const CAP_W = 154 * S;
const CAP_H = (223 - 171) * S; // 52 * S

// Polygon 3 (우하단 장식, mix-blend-multiply)
const POLY_LEFT = 168 * S;
const POLY_TOP = 207 * S;
const POLY_BOX = 32.261 * S;
const POLY_INNER = 25.456 * S;

// Vector 20 (좌측 밖으로 나간 라인)
const V20_LEFT = -18 * S;
const V20_TOP = 189 * S;
const V20_W = 140 * S;
const V20_H = 18.344 * S;

// Vector 21 (대각선 strip — 회전된 flex wrapper)
const V21_LEFT = 100 * S;
const V21_TOP = 98 * S;
const V21_WRAP_W = 187.25 * S;
const V21_WRAP_H = 170.607 * S;
const V21_STRIP_W = 235.072 * S;
const V21_STRIP_H = 18.344 * S;

export default function PolaroidFrame3({ imageSrc, timestamp, children }: Props) {
  // 필름 카메라 날짜 스탬프 (기존 PolaroidFrame.tsx 포맷 그대로)
  const d = new Date(timestamp);
  const dateStr = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      className="mx-auto relative overflow-hidden"
      style={{
        width: FRAME_W,
        height: FRAME_H,
        backgroundColor: "#e8e7e3",
        borderBottom: "1px solid #e8e7e3",
        borderRadius: 4,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
      }}
      data-node-id="346:2616"
      data-name="p-frame3"
    >
      {/* 이미지 슬롯 (Frame 39) */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: IMG_LEFT,
          top: IMG_TOP,
          width: IMG_W,
          height: IMG_H,
          backgroundColor: "#010101",
        }}
        data-node-id="346:2617"
      >
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          className="block w-full h-full object-cover"
          style={{ filter: KODAK_FILM_FILTER }}
        />
        {/* 필름 그레인 — SVG 터뷸런스 노이즈 overlay 블렌드 */}
        <div
          className="absolute inset-0 pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: FILM_GRAIN_URL,
            backgroundSize: "160px 160px",
            opacity: 0.32,
          }}
        />
        {/* 빈티지 비네팅 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: VINTAGE_VIGNETTE }}
        />
        {/* 미묘한 인셋 섀도우 — 프레임 밀착감 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: "inset 0 0 10px rgba(0,0,0,0.15)" }}
        />
        {/* 날짜 스탬프 — 필름 카메라 스타일 (우하단 오렌지) */}
        <div
          className="absolute bottom-2 right-2 tabular-nums"
          style={{
            fontSize: 11,
            color: "#ff6b35",
            textShadow: "0 0 4px rgba(255,107,53,0.5)",
            fontFamily: "'Courier New', monospace",
            letterSpacing: "0.08em",
          }}
        >
          {dateStr} {timeStr}
        </div>
      </div>

      {/* Vector 20 — 좌측 하단에서 밖으로 뻗는 얇은 라인 */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: V20_LEFT,
          top: V20_TOP,
          width: V20_W,
          height: V20_H,
        }}
        data-node-id="346:2620"
      >
        {/* Figma 스펙: inset-[-8.75% -0.26% -5.4% -0.18%] — 이미지가 경계 밖까지 살짝 넘어감 */}
        <div
          className="absolute"
          style={{
            top: "-8.75%",
            right: "-0.26%",
            bottom: "-5.4%",
            left: "-0.18%",
          }}
        >
          <img
            src="/polaroid/frame3/vector20.png"
            alt=""
            draggable={false}
            className="block w-full h-full"
            style={{ maxWidth: "none" }}
          />
        </div>
      </div>

      {/* Vector 21 — 대각선 strip (flex wrapper, 내부 회전) */}
      <div
        className="absolute flex items-center justify-center pointer-events-none"
        style={{
          left: V21_LEFT,
          top: V21_TOP,
          width: V21_WRAP_W,
          height: V21_WRAP_H,
        }}
      >
        <div
          className="flex-none"
          style={{ transform: "rotate(-41.89deg)" }}
        >
          <div
            className="relative"
            style={{ width: V21_STRIP_W, height: V21_STRIP_H }}
            data-node-id="346:2621"
          >
            {/* Figma 스펙: inset-[-8.8% -0.21% -7.1% -0.11%] */}
            <div
              className="absolute"
              style={{
                top: "-8.8%",
                right: "-0.21%",
                bottom: "-7.1%",
                left: "-0.11%",
              }}
            >
              <img
                src="/polaroid/frame3/vector21.png"
                alt=""
                draggable={false}
                className="block w-full h-full"
                style={{ maxWidth: "none" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Polygon 3 — 우하단 삼각형 장식 (mix-blend-multiply, rotate 18.66deg) */}
      <div
        className="absolute flex items-center justify-center pointer-events-none"
        style={{
          left: POLY_LEFT,
          top: POLY_TOP,
          width: POLY_BOX,
          height: POLY_BOX,
          mixBlendMode: "multiply",
        }}
      >
        <div
          className="flex-none"
          style={{ transform: "rotate(18.66deg)" }}
        >
          <div
            className="relative"
            style={{ width: POLY_INNER, height: POLY_INNER }}
            data-node-id="346:2618"
          >
            {/* Figma 스펙: 삼각형은 상단 기준 높이 75% 차지 (bottom-1/4), 좌우 6.7% 인셋 */}
            <div
              className="absolute"
              style={{
                top: 0,
                bottom: "25%",
                left: "6.7%",
                right: "6.7%",
              }}
            >
              <img
                src="/polaroid/frame3/polygon3.png"
                alt=""
                draggable={false}
                className="block w-full h-full"
                style={{ maxWidth: "none" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 서명/캡션 슬롯 — 폴라로이드 하단 흰 여백 */}
      <div
        className="absolute"
        style={{
          left: CAP_LEFT,
          top: CAP_TOP,
          width: CAP_W,
          height: CAP_H,
        }}
      >
        {children}
      </div>
    </div>
  );
}
