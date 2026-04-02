import type { Transition, Variants } from "framer-motion";

// === 스프링 프리셋 ===
export const springSnappy: Transition = { type: "spring", stiffness: 500, damping: 30 };
export const springGentle: Transition = { type: "spring", stiffness: 200, damping: 20 };
export const springBouncy: Transition = { type: "spring", stiffness: 300, damping: 15 };

// === 버튼 프레스 ===
export const buttonPress = { scale: 0.95 };
export const buttonPressTransition: Transition = { duration: 0.1 };

// === 페이드 인 업 ===
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

// === 스태거 컨테이너 ===
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

// === 스탬프 인 (완료 체크) ===
export const stampIn: Variants = {
  hidden: { scale: 2, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring", stiffness: 400, damping: 15 },
  },
};

// === 슬라이드 (온보딩 페이지 전환) ===
export const slideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

// === 글로우 펄스 ===
export const glowPulse: Variants = {
  idle: { scale: 1, opacity: 0.6 },
  active: {
    scale: [1, 1.05, 1],
    opacity: [0.6, 1, 0.6],
    transition: { duration: 2, repeat: Infinity },
  },
};

// === 카드 팬 배치 (CAH 스타일) ===
export function getCardFanStyle(index: number, total: number) {
  const center = (total - 1) / 2;
  const offset = index - center;
  const rotation = offset * 5;
  const translateY = Math.abs(offset) * 8;
  const translateX = offset * 30;

  return {
    rotate: rotation,
    y: translateY,
    x: translateX,
    zIndex: total - Math.abs(offset),
  };
}
