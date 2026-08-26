"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useModalA11y } from "@/hooks/useModalA11y";
import {
  FEEDBACK_REASONS,
  submitFeedback,
  type FeedbackReason,
} from "@/lib/feedback";
import { reviewUrlForPlatform } from "@/lib/reviewPrompt";

/**
 * 앱 평가 요청 모달 — 챌린지를 완료한 지 이틀째 되는 날 1회만 뜬다.
 *
 * 3단계: 물어보기 → (좋아요) 스토어 리뷰 / (아쉬워요) 객관식 피드백 → 감사 인사.
 * 만족한 사용자만 스토어로 보내고, 아쉬운 쪽은 공개 별점 대신 우리에게 직접 말하게 한다.
 *
 * onClose 는 어느 경로로 닫히든 정확히 한 번 호출된다 — 호출측이 "이미 띄웠음"을
 * 기록하므로, 여기서 빠지면 모달이 매번 다시 뜬다.
 */
type Step = "ask" | "feedback" | "thanks";

export default function ReviewPromptModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("ask");
  const [selected, setSelected] = useState<FeedbackReason[]>([]);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useModalA11y(containerRef, onClose);

  const toggleReason = (reason: FeedbackReason) => {
    setSelected((prev) =>
      prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason],
    );
  };

  const handleLoveIt = () => {
    // 새 탭/시스템 브라우저로 — Capacitor 안드로이드에서도 외부 링크는 이렇게 열린다.
    window.open(reviewUrlForPlatform(), "_blank", "noopener,noreferrer");
    onClose();
  };

  const handleSend = async () => {
    setSending(true);
    setSendError(null);
    const result = await submitFeedback({
      reasons: selected,
      comment,
      locale: document.documentElement.lang || "ko",
    });
    setSending(false);
    if (result.ok) {
      setStep("thanks");
      return;
    }
    setSendError(
      result.reason === "signed-out"
        ? t("review.error.signedOut")
        : t("review.error.failed"),
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        key="review-prompt"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[95] flex items-center justify-center p-6"
        style={{ background: "rgba(0, 0, 0, 0.85)" }}
        onClick={onClose}
      >
        <motion.div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-prompt-title"
          initial={{ scale: 0.92, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="relative max-w-sm w-full rounded-2xl p-6 flex flex-col gap-4"
          style={{ background: "var(--bg-elevated)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {step === "ask" && (
            <>
              <h2
                id="review-prompt-title"
                className="typo-heading text-text-primary"
              >
                {t("review.ask.title")}
              </h2>
              <p className="typo-body text-text-secondary leading-snug">
                {t("review.ask.body")}
              </p>
              <div className="flex flex-col gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleLoveIt}
                  className="w-full px-6 py-3 bg-accent text-bg-primary rounded-md typo-body font-semibold"
                >
                  {t("review.ask.love")}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("feedback")}
                  className="w-full px-6 py-3 rounded-md typo-body text-text-primary"
                  style={{ background: "var(--bg-surface)" }}
                >
                  {t("review.ask.meh")}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full px-6 py-2 text-text-tertiary typo-caption"
                >
                  {t("review.ask.later")}
                </button>
              </div>
            </>
          )}

          {step === "feedback" && (
            <>
              <h2
                id="review-prompt-title"
                className="typo-heading text-text-primary"
              >
                {t("review.feedback.title")}
              </h2>
              <p className="typo-caption text-text-secondary leading-snug">
                {t("review.feedback.body")}
              </p>

              <div className="flex flex-wrap gap-2">
                {FEEDBACK_REASONS.map((reason) => {
                  const on = selected.includes(reason);
                  return (
                    <button
                      key={reason}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleReason(reason)}
                      className="px-3 py-2 rounded-full typo-caption"
                      style={{
                        background: on
                          ? "var(--accent-primary)"
                          : "var(--bg-surface)",
                        color: on ? "var(--bg-primary)" : "var(--text-primary)",
                      }}
                    >
                      {t(`review.reason.${reason}`)}
                    </button>
                  );
                })}
              </div>

              <label className="sr-only" htmlFor="review-comment">
                {t("review.feedback.placeholder")}
              </label>
              <textarea
                id="review-comment"
                value={comment}
                maxLength={500}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("review.feedback.placeholder")}
                rows={3}
                className="w-full rounded-md p-3 typo-caption text-text-primary resize-none"
                style={{ background: "var(--bg-surface)" }}
              />

              {sendError && (
                <p className="typo-caption" style={{ color: "#FF4632" }}>
                  {sendError}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || (selected.length === 0 && !comment.trim())}
                  className="w-full px-6 py-3 bg-accent text-bg-primary rounded-md typo-body font-semibold disabled:opacity-50"
                >
                  {sending ? t("review.feedback.sending") : t("review.feedback.send")}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full px-6 py-2 text-text-tertiary typo-caption"
                >
                  {t("review.ask.later")}
                </button>
              </div>
            </>
          )}

          {step === "thanks" && (
            <>
              <h2
                id="review-prompt-title"
                className="typo-heading text-text-primary"
              >
                {t("review.thanks.title")}
              </h2>
              <p className="typo-body text-text-secondary leading-snug">
                {t("review.thanks.body")}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full px-6 py-3 bg-accent text-bg-primary rounded-md typo-body font-semibold mt-2"
              >
                {t("review.thanks.close")}
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
