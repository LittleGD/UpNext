"use client";

/**
 * WelcomeCoinsOverlay — 신규(및 플래그 없는 기존) 유저에게 시작 선물 코인을
 * 1회 전달하는 축하 오버레이.
 *
 *  트리거: useUpHeroStore.pendingWelcomeGrant !== null
 *          (initialize 에서 welcomeGrantClaimed 가 false 면 예약된다)
 *  닫힘:   유저가 "받기" → claimWelcomeGrant() → 코인 지급 + 플래그 persist
 *
 *  "예약 → 수령" 2단계인 이유: 오버레이를 보기 전에 플래그만 소모되면 유저는
 *  코인이 들어온 사실을 모른 채 연출을 놓친다. 실제 지급을 버튼에 묶어 둔다.
 *
 *  카드 뽑기 같은 코어 루프를 가리지 않도록, 팩 오프너가 열려 있는 동안에는
 *  마운트를 보류한다 (CollectionCelebration 과 동일한 관례).
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/hooks/useSound";
import { springBouncy, springSnappy } from "@/lib/motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { GB } from "@/lib/upHeroPalette";

/** 쏟아지는 코인 개수 — 너무 많으면 저사양 기기에서 프레임이 떨어진다. */
const COIN_COUNT = 14;

export default function WelcomeCoinsOverlay() {
  const pendingGrant = useUpHeroStore((s) => s.pendingWelcomeGrant);
  const heroLoaded = useUpHeroStore((s) => s.isLoaded);
  const initUpHero = useUpHeroStore((s) => s.initialize);
  const claimWelcomeGrant = useUpHeroStore((s) => s.claimWelcomeGrant);

  const gameLoaded = useGameStore((s) => s.isLoaded);
  const hasCompletedOnboarding = useGameStore((s) => s.hasCompletedOnboarding);
  // 팩 오프너가 떠 있는 동안엔 카드 reveal 이 주인공 — 닫힌 다음 프레임에 등장.
  const isOpeningPack = useGameStore((s) => s.isOpeningPack);

  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const { play } = useSound();

  // 갓생 코인은 Up Hero store 소유. 아지트를 거치지 않은 유저도 선물을 받을 수
  // 있도록 여기서 idempotent 하게 hydrate 한다 (initialize 에 isLoaded 가드 있음).
  useEffect(() => {
    if (!heroLoaded) initUpHero();
  }, [heroLoaded, initUpHero]);

  const visible =
    gameLoaded &&
    hasCompletedOnboarding &&
    heroLoaded &&
    !isOpeningPack &&
    pendingGrant !== null;

  useEffect(() => {
    if (!visible) return;
    play("collect");
  }, [visible, play]);

  const amount = pendingGrant ?? 0;
  const accent = GB.lightest;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="welcome-coins"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[85] flex items-center justify-center p-6"
          style={{ background: "rgba(0, 0, 0, 0.85)" }}
        >
          {/* 쏟아지는 코인 — 위에서 떨어져 바닥 근처에서 한 번 튀어오른다.
              reduced-motion 이면 통째로 생략. */}
          {!reducedMotion && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {Array.from({ length: COIN_COUNT }).map((_, i) => {
                // 좌우로 고르게 흩뿌리되 결정적 배치 — 리렌더마다 위치가 튀지 않게.
                const left = ((i * 37) % 100) + (i % 2 === 0 ? 1 : -1) * 3;
                const delay = 0.06 * i;
                const size = 14 + (i % 3) * 6;
                return (
                  <motion.div
                    key={i}
                    className="absolute"
                    style={{ left: `${left}%`, top: "-8%", color: accent }}
                    initial={{ y: 0, opacity: 0, rotate: 0 }}
                    animate={{
                      // 낙하 → 살짝 튐 → 정지. keyframes 로 바운스를 흉내낸다.
                      y: ["0vh", "78vh", "66vh", "74vh"],
                      opacity: [0, 1, 1, 0],
                      rotate: [0, 180, 200, 210],
                    }}
                    transition={{
                      duration: 1.6,
                      delay,
                      times: [0, 0.6, 0.78, 1],
                      ease: "easeIn",
                    }}
                  >
                    <PixelIcon name="Coins" size={size} color={accent} />
                  </motion.div>
                );
              })}
            </div>
          )}

          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ ...springBouncy, delay: 0.1 }}
            className="relative max-w-sm w-full rounded-2xl p-6 flex flex-col items-center gap-4"
            style={{ background: "rgba(10, 31, 10, 0.96)" }}
          >
            {/* 선물 코인 더미 — 천천히 오르내리며 시선을 잡는다. */}
            <motion.div
              animate={reducedMotion ? {} : { y: [0, -6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              style={{ color: accent }}
            >
              <PixelIcon name="Coins" size={72} />
            </motion.div>

            <h2 className="typo-display text-center" style={{ color: accent }}>
              {t("welcome.coins.title")}
            </h2>

            <p className="typo-body text-text-primary text-center leading-snug">
              {t("welcome.coins.body", { coins: amount })}
            </p>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springSnappy, delay: 0.45 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                play("collect");
                claimWelcomeGrant();
              }}
              className="w-full px-6 min-h-[48px] py-3 bg-accent text-bg-primary rounded-md typo-body font-semibold"
            >
              {t("welcome.coins.confirm")}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
