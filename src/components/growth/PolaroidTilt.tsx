"use client";

import { useRef, useEffect, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
} from "framer-motion";

interface Props {
  children: React.ReactNode;
  /** false 면 틸트/자이로 비활성 — children 만 그대로 렌더 */
  enabled?: boolean;
}

/**
 * PolaroidTilt — 포인터 추적 + 자이로스코프 3D 회전 래퍼.
 *
 * 핵심 구조:
 *   wrapper div (포인터 이벤트 수신)
 *     └ motion.div — transform: perspective(800px) rotateX() rotateY()
 *         ├ children (PolaroidFlip 등)
 *         └ 동적 반사광 오버레이
 *
 * ⚠ perspective(800px) 를 부모 CSS 속성이 아닌 transform 함수에 포함.
 *   이유: 조상 motion.div 에 scale/opacity/translate 애니메이션이 있으면
 *   CSS `perspective` 속성은 3D context 가 flat 으로 꺾여 무효화된다.
 *   transform 함수 안에 자체 포함(self-contained)하면 조상 영향을 받지 않는다.
 *
 * 포인터 이탈 시 스프링이 자연스럽게 중앙(0,0)으로 복귀.
 * iOS 자이로: 첫 pointerdown 에서 DeviceOrientationEvent.requestPermission() 호출.
 *
 * Emil 원칙: 마우스 트래킹에 useSpring — 직접 값 바인딩은 인위적이다.
 * 스프링 보간이 모멘텀을 만들어 자연스러운 물리 느낌을 준다.
 */
export default function PolaroidTilt({ children, enabled = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const neutralBetaRef = useRef<number | null>(null);
  const isPointerActiveRef = useRef(false);

  /* ── 모션 값 ── */
  // 포인터/자이로가 직접 설정하는 "목표" 회전각 (°, 최대 ±15)
  const targetRotateX = useMotionValue(0);
  const targetRotateY = useMotionValue(0);

  // useSpring 으로 부드럽게 따라오는 실�� 회전각
  // stiffness 150 / damping 15 / mass 0.5 — 반응 빠르되 약간의 오버슈트로 생동감
  const springCfg = { stiffness: 150, damping: 15, mass: 0.5 };
  const rotateX = useSpring(targetRotateX, springCfg);
  const rotateY = useSpring(targetRotateY, springCfg);

  // ── self-contained perspective transform ──
  // 부모에 perspective 속성을 두지 않고, transform 함수에 직접 포함.
  // 조상의 scale/opacity 등이 3D context 를 flat 으로 만들어도 영향 없음.
  const tiltTransform = useMotionTemplate`perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

  // 반사광 위치 — 기울기 반대 방향으로 이동 (실물 스펙큘러 물리)
  // 카드를 오른쪽으로 기울이면(rotateY+) 하이라이트는 왼쪽으로 이동
  const reflectX = useTransform(rotateY, [-15, 15], [65, 35]);
  const reflectY = useTransform(rotateX, [-15, 15], [65, 35]);

  // 반사광 그라디언트 — useMotionTemplate 로 반응형 배경 생성
  const reflectGradient = useMotionTemplate`radial-gradient(ellipse at ${reflectX}% ${reflectY}%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 40%, transparent 65%)`;

  /* ���─ 포인터 추적 ── */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // -1..1 정규화
      const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));
      targetRotateY.set(nx * 15);
      targetRotateX.set(-ny * 15); // 위로 올리면 뒤로 젖히기
      isPointerActiveRef.current = true;
    },
    [enabled, targetRotateX, targetRotateY],
  );

  const handlePointerLeave = useCallback(() => {
    targetRotateX.set(0);
    targetRotateY.set(0);
    isPointerActiveRef.current = false;
  }, [targetRotateX, targetRotateY]);

  /* ── 자이로스코프 ── */
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (typeof DeviceOrientationEvent === "undefined") return;

    const container = containerRef.current;

    const handler = (e: DeviceOrientationEvent) => {
      // 포인터 활성 시 자이로 무시 — 데스크톱에서 마우스와 충돌 방지
      if (isPointerActiveRef.current) return;
      const beta = e.beta ?? 0; // 앞뒤 기울기 (세로, -180~180)
      const gamma = e.gamma ?? 0; // 좌우 기울기 (가로, -90~90)
      // 첫 읽기를 "중립" 자세로 기록 — 이후 기울기는 상대값
      if (neutralBetaRef.current === null) neutralBetaRef.current = beta;
      const dBeta = beta - neutralBetaRef.current;
      targetRotateX.set(Math.max(-15, Math.min(15, -dBeta * 0.4)));
      targetRotateY.set(Math.max(-15, Math.min(15, gamma * 0.4)));
    };

    // iOS 13+: 첫 사용자 제스처에서 권한 요청 필수
    if ("requestPermission" in DeviceOrientationEvent) {
      const onGesture = async () => {
        try {
          const perm = await (
            DeviceOrientationEvent as unknown as {
              requestPermission(): Promise<string>;
            }
          ).requestPermission();
          if (perm === "granted") {
            window.addEventListener("deviceorientation", handler);
          }
        } catch {
          /* 권한 거부 — 자이로 없이 포인터 트래킹만 사용 */
        }
        container?.removeEventListener("pointerdown", onGesture);
      };
      container?.addEventListener("pointerdown", onGesture);
      return () => {
        container?.removeEventListener("pointerdown", onGesture);
        window.removeEventListener("deviceorientation", handler);
      };
    }

    // 비-iOS — 권한 불필요, 바로 리스너 등록
    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, [enabled, targetRotateX, targetRotateY]);

  /* ── 비활성 시 passthrough ── */
  if (!enabled) return <>{children}</>;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <motion.div
        className="relative"
        style={{
          transform: tiltTransform,
          transformStyle: "preserve-3d",
        }}
      >
        {children}
        {/* 동적 반사광 — 기울기에 따라 이동하는 스펙큘러 하이라이트 */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none rounded-sm"
          style={{
            background: reflectGradient,
            mixBlendMode: "overlay",
            zIndex: 10,
          }}
        />
      </motion.div>
    </div>
  );
}
