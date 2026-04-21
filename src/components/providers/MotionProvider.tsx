"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Phase 14 design review — 앱 루트에서 framer-motion 의 reducedMotion 정책을
 * "user" 로 묶는다.
 *
 * 효과:
 * - `prefers-reduced-motion: reduce` 를 켠 사용자에게 framer-motion 의 모든
 *   transform/animate 가 자동 비활성 (opacity 만 남음).
 * - 각 컴포넌트에서 `useReducedMotion()` 으로 개별 분기하지 않아도 3D 플립,
 *   scale/rotate, 스프링 오버슈트, 무한 glow pulse 가 안전하게 정적 상태로
 *   snap.
 * - 전정기능 민감 사용자 대응 + App Store 접근성 심사 리스크 제거.
 *
 * 주의: CSS `@media (prefers-reduced-motion)` 와 이중으로 작동해도 서로
 * 모순되지 않음 (둘 다 snap to final state). Framer 의 `reducedMotion="user"`
 * 는 OS 설정을 존중하되 앱에서 강제 override 하지 않음.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
