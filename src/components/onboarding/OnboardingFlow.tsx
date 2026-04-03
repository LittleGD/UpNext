"use client";

import { useState, useCallback } from "react";
import { useGameStore } from "@/store/useGameStore";
import type { GameMode } from "@/types/game";

import SplashScreen from "./SplashScreen";
import AppDescription from "./AppDescription";
import DifficultySelect from "./DifficultySelect";
import StarterPackSelect from "./StarterPackSelect";
import LevelUpScreen from "./LevelUpScreen";

type Step = "splash" | "description" | "difficulty" | "starter-pack" | "level-up";

const INDICATOR_STEPS: Step[] = ["description", "difficulty", "starter-pack", "level-up"];

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export default function OnboardingFlow() {
  // PWA standalone → 스플래시 표시, 브라우저 → 스킵 (LCP 최적화)
  const [step, setStep] = useState<Step>(() => isStandalone() ? "splash" : "description");
  const setMode = useGameStore((s) => s.setMode);
  const selectStarterPack = useGameStore((s) => s.selectStarterPack);
  const completeOnboarding = useGameStore((s) => s.completeOnboarding);

  const goTo = useCallback((next: Step) => {
    setStep(next);
  }, []);

  const handleDifficulty = useCallback((mode: GameMode) => {
    setMode(mode);
    goTo("starter-pack");
  }, [setMode, goTo]);

  const handleStarterPack = useCallback((packId: string) => {
    selectStarterPack(packId);
    goTo("level-up");
  }, [selectStarterPack, goTo]);

  const handleLevelUpDone = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="ambient-bg"><div className="ambient-orb" /></div>
      {/* 스텝 인디케이터 */}
      {step !== "splash" && step !== "description" && (
        <div className="absolute top-4 left-0 right-0 z-10 flex justify-center gap-2">
          {INDICATOR_STEPS.map((s) => (
            <div
              key={s}
              className={`h-1 w-8 rounded-full transition-colors ${
                INDICATOR_STEPS.indexOf(step) >= INDICATOR_STEPS.indexOf(s) ? "bg-accent" : "bg-bg-elevated"
              }`}
            />
          ))}
        </div>
      )}

      {step === "splash" && (
        <SplashScreen onComplete={() => goTo("description")} />
      )}
      {step === "description" && (
        <AppDescription onNext={() => goTo("difficulty")} />
      )}
      {step === "difficulty" && (
        <DifficultySelect onSelect={handleDifficulty} />
      )}
      {step === "starter-pack" && (
        <StarterPackSelect onSelect={handleStarterPack} />
      )}
      {step === "level-up" && (
        <LevelUpScreen onComplete={handleLevelUpDone} />
      )}
    </div>
  );
}
