"use client";

import { useState, useRef } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { springSnappy } from "@/lib/motion";
import PixelIcon from "@/components/icons/PixelIcon";

interface Props {
  front: React.ReactNode;
  back: React.ReactNode;
  flipped?: boolean;
  onFlip?: (isFlipped: boolean) => void;
  /** 외부에 플립 버튼 표시 — 폴라로이드와 분리된 별도 버튼 */
  showFlipHint?: boolean;
}

/**
 * PolaroidFlip — 사진 앞면 ↔ 메모 뒷면 플립.
 *
 * 인터랙션:
 *   1. 가로 드래그 (pan) — 손가락으로 폴라로이드를 직접 돌림. 실물 카드 같은 느낌.
 *      release 시 임계값(±90°) 또는 velocity (>0.3) 로 스냅.
 *   2. 플립 버튼 — 폴라로이드와 분리된 외부 버튼 (showFlipHint=true 시).
 *
 * 메모 뒷면은 프레임과 동일 사이즈/aspect ratio (184/223) — "사진 뒷면" 느낌.
 *
 * 스티커 추후 확장: front 의 children 에 sticker 레이어 추가하면 z-index 로 자유 배치.
 */
export default function PolaroidFlip({
  front,
  back,
  flipped: controlledFlipped,
  onFlip,
  showFlipHint = true,
}: Props) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isFlipped = controlledFlipped ?? internalFlipped;

  // 드래그 진행 회전 — 0 (front) 또는 180 (back) 사이를 이동
  const baseRotation = isFlipped ? 180 : 0;
  const dragRotation = useMotionValue(0);
  // 실제 적용 회전 = base + drag delta
  const rotateY = useTransform(dragRotation, (d) => baseRotation + d);

  const handleFlip = () => {
    const next = !isFlipped;
    if (onFlip) onFlip(next);
    else setInternalFlipped(next);
  };

  // 드래그 종료: 임계값 또는 velocity 로 스냅 결정
  const handleDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const dragDistance = info.offset.x;
    const dragVelocity = info.velocity.x;
    // 진행 정도: ±150px = 90° (드래그 중 회전량)
    const flipThreshold = 90; // degrees
    const velocityThreshold = 400; // px/s

    const passedDistance = Math.abs(dragRotation.get()) > flipThreshold;
    const flickFast = Math.abs(dragVelocity) > velocityThreshold;
    // 방향 일관성 체크 — flick 은 거리가 작아도 같은 방향이면 플립
    const flickDirection = dragDistance > 0 ? 1 : -1;
    const dragDirection = dragRotation.get() > 0 ? 1 : -1;
    const consistentFlick = flickFast && flickDirection === dragDirection;

    if (passedDistance || consistentFlick) {
      // 플립 — drag 누적분 리셋 후 isFlipped 토글
      dragRotation.set(0);
      handleFlip();
    } else {
      // 원위치 — spring 으로 0 으로 복귀
      animateBack();
    }
  };

  // animateBack — drag 종료 시 0 으로 부드럽게 복귀
  const isAnimatingBack = useRef(false);
  const animateBack = () => {
    isAnimatingBack.current = true;
    const start = dragRotation.get();
    const startTime = performance.now();
    const duration = 280;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // ease-out (Emil 추천 강한 ease-out)
      const eased = 1 - Math.pow(1 - t, 3);
      dragRotation.set(start * (1 - eased));
      if (t < 1 && isAnimatingBack.current) {
        requestAnimationFrame(tick);
      } else {
        isAnimatingBack.current = false;
        dragRotation.set(0);
      }
    };
    requestAnimationFrame(tick);
  };

  return (
    <div className="relative">
      <div style={{ perspective: 1000 }}>
        <motion.div
          style={{
            rotateY,
            transformStyle: "preserve-3d",
            cursor: "grab",
            touchAction: "pan-y", // 세로 스크롤은 허용, 가로만 캐치
          }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={1}
          dragMomentum={false}
          onDrag={(_e, info) => {
            // drag X → rotation 매핑 (150px = 90°)
            isAnimatingBack.current = false; // 드래그 시작 시 복귀 애니 중단
            dragRotation.set((info.offset.x / 150) * 90);
          }}
          onDragEnd={handleDragEnd}
          // springSnappy 트랜지션 — 플립 토글 시 부드럽게 (drag 가 아닌 isFlipped 변화시)
          transition={springSnappy}
        >
          {/* Front face */}
          <div style={{ backfaceVisibility: "hidden" }}>{front}</div>
          {/* Back face */}
          <div
            className="absolute inset-0"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            {back}
          </div>
        </motion.div>
      </div>

      {/* 플립 버튼 — 폴라로이드 아래 별도 영역. 폴라로이드와 분리. */}
      {showFlipHint && (
        <div className="flex justify-center mt-4">
          <button
            onClick={handleFlip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-95 transition-transform"
            aria-label={isFlipped ? "Show photo" : "Show memo"}
          >
            <PixelIcon name="Redo" size={12} color="currentColor" />
            <span>{isFlipped ? "Photo" : "Memo"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
