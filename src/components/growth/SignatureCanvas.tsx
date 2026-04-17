"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface Props {
  width: number;
  height: number;
  onSignatureChange: (dataUrl: string | null) => void;
  className?: string;
  /** 기존 사인을 다시 로드해서 이어 그리기 (PhotoDetailModal 의 Edit 모드용) */
  initialDataUrl?: string | null;
  /** 잉크 색 (CSS color string) — DecorationToolbar 에서 변경 */
  inkColor?: string;
}

interface Pt {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

/**
 * SignatureCanvas — 만년필 느낌의 폴라로이드 자유 낙서 캔버스.
 *
 * 폴라로이드 프레임 전체 위 absolute 오버레이됨 (사진 + 캡션 영역 모두).
 * 약한 자동 보정 + 만년필 같은 가변 굵기로 손맛 살림.
 *
 * 드로잉 알고리즘:
 *  1. 포인트 버퍼링 — 현재 스트로크의 모든 포인트를 배열로 추적
 *  2. Catmull-Rom 스플라인 보간 — 4개 포인트씩 잡아 베지어 곡선으로 부드럽게.
 *     약한 보정: 사용자 제스처는 살리되 픽셀 단위 jitter 만 매끄럽게.
 *  3. 속도/필압 기반 굵기 변화 — 천천히 그릴수록 잉크 더 많이 (만년필 잉크 풀)
 *     - 펜 입력 (e.pressure > 0): 필압 사용
 *     - 마우스/터치 (pressure ~ 0.5): 속도로 환산
 *  4. 따뜻한 다크 잉크 색 — rgba(22,18,14,0.92) — 순흑보다 자연스러움
 *
 * 향후 스티커 레이어와 공존 — 캔버스는 z-index 5, 스티커는 z-index 10.
 */
export default function SignatureCanvas({
  width,
  height,
  onSignatureChange,
  className,
  initialDataUrl,
  inkColor = "rgba(22,18,14,0.92)",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const points = useRef<Pt[]>([]);
  const [hasStrokes, setHasStrokes] = useState(false);
  // ink color 를 ref 로도 보관 — useCallback closure 안에서 최신 값 참조
  const inkColorRef = useRef(inkColor);
  useEffect(() => { inkColorRef.current = inkColor; }, [inkColor]);

  const getPos = useCallback((e: PointerEvent | React.PointerEvent): Pt => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      // pressure 0 = unsupported (mouse) → 0.5 으로 fallback (속도 기반 width 사용)
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      time: performance.now(),
    };
  }, []);

  // 속도/필압 → 굵기. 만년필 느낌의 가변 두께.
  const computeWidth = useCallback((p1: Pt, p2: Pt): number => {
    // 펜 입력이 진짜 필압을 줬으면 (0.5 가 아닌 값) 필압 우선
    const usingPen = p2.pressure > 0 && p2.pressure !== 0.5;
    if (usingPen) {
      // 필압 0~1 → 1.2~3.6px
      return 1.2 + p2.pressure * 2.4;
    }
    // 속도 기반: dt 시간 동안 dist 만큼 이동 → px/ms
    const dt = Math.max(1, p2.time - p1.time);
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const speed = dist / dt;
    // 속도 0.1 px/ms (느림) → 3.2px / 속도 4 px/ms (빠름) → 1.2px
    return Math.max(1.2, Math.min(3.2, 3.2 - speed * 0.5));
  }, []);

  // Catmull-Rom 보간으로 부드러운 베지어 곡선 그리기.
  // p0, p3 는 control 용. 실제 그려지는 구간은 p1 → p2.
  const drawCatmullRom = useCallback(
    (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

      // Catmull-Rom 을 bezier control point 로 변환 (tension 0.5)
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      ctx.strokeStyle = inkColorRef.current;
      ctx.lineWidth = computeWidth(p1, p2);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    },
    [computeWidth],
  );

  // 짧은 스트로크 (포인트 1~3개) — 단순 직선
  const drawSimpleSegment = useCallback(
    (p1: Pt, p2: Pt) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = "rgba(22, 18, 14, 0.92)";
      ctx.lineWidth = computeWidth(p1, p2);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    },
    [computeWidth],
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    points.current = [getPos(e)];
  }, [getPos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    e.stopPropagation();

    const pt = getPos(e);
    const arr = points.current;
    arr.push(pt);

    // 보간 그리기 — 4개 포인트가 모이면 Catmull-Rom 으로 p1→p2 구간 부드러운 곡선
    if (arr.length >= 4) {
      const n = arr.length;
      drawCatmullRom(arr[n - 4], arr[n - 3], arr[n - 2], arr[n - 1]);
    } else if (arr.length === 2) {
      // 첫 번째 점들 — 단순 직선으로 (보간 데이터 부족)
      drawSimpleSegment(arr[0], arr[1]);
    }
  }, [getPos, drawCatmullRom, drawSimpleSegment]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    // 마지막 1~2개 포인트의 tail 마무리 (4개 미만이라 그려지지 않은 경우)
    const arr = points.current;
    const n = arr.length;
    if (n >= 3) {
      // 마지막 두 점도 단순 segment 로 마무리 (보간이 가능한 마지막 구간 누락 방지)
      drawSimpleSegment(arr[n - 2], arr[n - 1]);
    }
    points.current = [];
    setHasStrokes(true);
    const canvas = canvasRef.current;
    if (canvas) {
      onSignatureChange(canvas.toDataURL("image/png"));
    }
  }, [drawSimpleSegment, onSignatureChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    points.current = [];
    onSignatureChange(null);
  }, [onSignatureChange]);

  // DPR 설정 + initialDataUrl 로드 (Edit 모드)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // initialDataUrl 로드 — Edit 모드에서 기존 사인 위에 이어 그리기
    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        setHasStrokes(true);
      };
      img.src = initialDataUrl;
    }
  }, [width, height, initialDataUrl]);

  return (
    <div className={`relative ${className || ""}`}>
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      {/* Clear chip — 캔버스 우상단 absolute, 폴라로이드 프레임 안에 머무름 */}
      {hasStrokes && (
        <button
          onClick={clear}
          type="button"
          aria-label="Clear signature"
          className="absolute top-1.5 right-1.5 typo-micro text-text-tertiary/90 px-2 py-1 rounded bg-white/60 backdrop-blur-sm active:opacity-60 transition-opacity z-10"
        >
          Clear
        </button>
      )}
    </div>
  );
}
