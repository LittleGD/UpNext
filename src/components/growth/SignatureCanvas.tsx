"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface Props {
  width: number;
  height: number;
  onSignatureChange: (dataUrl: string | null) => void;
  className?: string;
  /** 기존 사인을 다시 로드해서 이어 그리기 (PhotoDetailModal 의 Edit 모드용) */
  initialDataUrl?: string | null;
}

/**
 * SignatureCanvas — 폴라로이드 전체 위 자유 낙서 캔버스.
 *
 * 폴라로이드 프레임 전체 위에 absolute 로 오버레이됨 (사진 + 캡션 영역 모두).
 * 검정 잉크 (#1a1a1a) 로 사진 위에 그려도 잘 보임 — 마커 펜으로 사진 위에
 * 낙서하는 빈티지 폴라로이드 느낌.
 *
 * 향후 스티커 레이어와 공존 — 캔버스는 z-index 5, 스티커는 z-index 10 정도.
 */
export default function SignatureCanvas({
  width,
  height,
  onSignatureChange,
  className,
  initialDataUrl,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [hasStrokes, setHasStrokes] = useState(false);

  const getPos = useCallback((e: PointerEvent | React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    lastPos.current = getPos(e);
  }, [getPos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    e.stopPropagation();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const pos = getPos(e);

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    lastPos.current = pos;
  }, [getPos]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    setHasStrokes(true);
    const canvas = canvasRef.current;
    if (canvas) {
      onSignatureChange(canvas.toDataURL("image/png"));
    }
  }, [onSignatureChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onSignatureChange(null);
  }, [onSignatureChange]);

  // DPR 설정 + initialDataUrl 로드 (Edit 모드)
  // 캔버스 drawing buffer 는 width×dpr 로 고해상도, CSS 사이즈는 className 의 w-full h-full 이 결정 (반응형).
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
