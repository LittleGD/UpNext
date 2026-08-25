"use client";

/**
 * Up Hero — Phase 11c: 주간 악몽 던전 리더보드 모달.
 *
 * Firestore `weekly-leaderboard/{weekId}/entries` 에서 top 100 + 본인 순위 fetch.
 * 익명 유저 / Firebase 미구성 환경은 "로그인 필요" 안내.
 *
 * UI:
 *   - header: "이번 주 악몽 순위" + 현재 week id + affix 이름
 *   - body: rank / displayName / score / floor 테이블 (top 100, 모바일 친화)
 *   - 본인이 top 100 밖이면 "당신 #N" 별도 표기 하단
 *   - 로딩 중엔 skeleton
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GB, EASE_OUT, GB_LEGEND } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import {
  fetchWeeklyTop,
  fetchMyRank,
  type WeeklyLeaderboardEntry,
} from "@/lib/weeklyLeaderboard";
import { isFirebaseConfigured } from "@/lib/firebase";
import { className as classNameI18n } from "@/lib/upHeroI18n";
import PixelIcon from "@/components/icons/PixelIcon";

// Phase 13 final review — sentinel 을 안정 identifier 로 (한국어 literal 제거).
//   유저 노출은 `t("uphero.leaderboard.loginRequired")` 로 이미 i18n 됨.
const FIREBASE_UNCONFIGURED = "firebase-unconfigured";

interface WeeklyLeaderboardProps {
  weekId: string;
  affixName: string;
  onClose: () => void;
}

export default function WeeklyLeaderboard({
  weekId,
  affixName,
  onClose,
}: WeeklyLeaderboardProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose);

  const [entries, setEntries] = useState<WeeklyLeaderboardEntry[] | null>(null);
  const [myData, setMyData] = useState<
    { rank: number; entry: WeeklyLeaderboardEntry } | null
  >(null);
  // isFirebaseConfigured 는 모듈 상수 — 미설정 에러는 초기 상태로 직접 표현
  // (기존 useEffect 내 동기 setState 를 규칙 준수 형태로 대체)
  const [error, setError] = useState<string | null>(
    isFirebaseConfigured ? null : FIREBASE_UNCONFIGURED,
  );

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const [top, mine] = await Promise.all([
          fetchWeeklyTop(weekId, 100),
          fetchMyRank(weekId),
        ]);
        if (cancelled) return;
        setEntries(top);
        setMyData(mine);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message ?? t("uphero.leaderboard.fetchFail"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekId]);

  const myInTop = myData
    ? entries?.some((e) => e.uid === myData.entry.uid)
    : false;

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: `${GB.darkest}e6` }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wl-title"
        className="w-full max-w-md rounded-md flex flex-col"
        style={{
          background: GB.darkest,
          border: `1px solid ${GB.lightest}`,
          outline: "none",
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <div
          className="px-4 pt-4 pb-3"
          style={{ borderBottom: `1px solid ${GB.dark}` }}
        >
          <div className="flex items-center gap-2 mb-1">
            <PixelIcon name="Trophy" size={18} color={GB_LEGEND} />
            <div id="wl-title" className="typo-body" style={{ color: GB.lightest, fontWeight: 600 }}>
              {t("uphero.leaderboard.title")}
            </div>
          </div>
          <div className="typo-caption tabular-nums" style={{ color: GB.light }}>
            {weekId} · {affixName}
          </div>
        </div>

        {/* Body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-3 py-3"
          style={{ color: GB.light }}
        >
          {error && (
            <div className="typo-caption text-center py-8" style={{ color: GB.light }}>
              {error === FIREBASE_UNCONFIGURED
                ? t("uphero.leaderboard.loginRequired")
                : `${t("uphero.leaderboard.fetchFail")}: ${error}`}
            </div>
          )}
          {!error && entries === null && (
            <div className="flex flex-col gap-1.5 pt-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 32,
                    background: `${GB.dark}66`,
                    borderRadius: 4,
                  }}
                />
              ))}
            </div>
          )}
          {!error && entries && entries.length === 0 && (
            <div
              className="typo-caption text-center py-10"
              style={{ color: GB.light, opacity: 0.7 }}
            >
              {t("uphero.leaderboard.empty")}
            </div>
          )}
          {!error && entries && entries.length > 0 && (
            <div className="flex flex-col gap-0.5" role="list">
              {entries.map((e, i) => (
                <LeaderboardRow
                  key={e.uid}
                  rank={i + 1}
                  entry={e}
                  isMe={myData?.entry.uid === e.uid}
                />
              ))}
            </div>
          )}
        </div>

        {/* 본인이 top 100 밖이면 하단 */}
        {myData && !myInTop && (
          <div
            className="px-3 py-2.5"
            style={{
              borderTop: `1px solid ${GB.dark}`,
              background: `${GB.dark}33`,
            }}
          >
            <div className="typo-micro mb-1" style={{ color: GB.light, opacity: 0.7 }}>
              {t("uphero.leaderboard.myRankHeading")}
            </div>
            {/* Phase 11c R3 — 독립 row 도 list semantics 부여 (role="listitem" parent 필수). */}
            <div role="list">
              <LeaderboardRow
                rank={myData.rank}
                entry={myData.entry}
                isMe
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="px-3 py-3 flex items-center justify-end"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <button
            type="button"
            onClick={onClose}
            className="wl-close typo-caption rounded"
            style={{
              minHeight: 44,
              padding: "10px 18px",
              background: GB.lightest,
              color: GB.darkest,
              border: `1px solid ${GB.lightest}`,
              fontWeight: 600,
            }}
            autoFocus
          >
            {t("uphero.leaderboard.close")}
          </button>
          <style jsx>{`
            .wl-close {
              transition: transform 120ms ${EASE_OUT};
            }
            .wl-close:active {
              transform: scale(0.97);
            }
          `}</style>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function LeaderboardRow({
  rank,
  entry,
  isMe = false,
}: {
  rank: number;
  entry: WeeklyLeaderboardEntry;
  isMe?: boolean;
}) {
  const { t, language } = useTranslation();
  const top3Color = rank === 1 ? GB_LEGEND : rank === 2 ? "#cdb887" : rank === 3 ? "#bca88b" : GB.light;
  const className = entry.classType
    ? classNameI18n(entry.classType, language)
    : "";
  // Phase 11c R3 — screen reader 용 합쳐진 label. 시각 렌더 변화 없음.
  const levelLabel = t("common.levelShort", { level: entry.heroLevel });
  const srLabel = [
    `#${rank}`,
    isMe ? t("uphero.leaderboard.mineLabel") : entry.displayName,
    `${entry.score.toLocaleString()}`,
    className && `${className} ${levelLabel}`,
    `F${entry.floorsCleared}`,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded"
      role="listitem"
      aria-label={srLabel}
      style={{
        background: isMe ? `${GB.lightest}22` : "transparent",
        border: isMe ? `1px solid ${GB.lightest}66` : "1px solid transparent",
      }}
    >
      <div
        className="typo-caption tabular-nums"
        style={{
          color: top3Color,
          fontWeight: rank <= 3 ? 700 : 500,
          minWidth: 36,
          textAlign: "right",
        }}
      >
        #{rank}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="typo-caption truncate"
          style={{ color: isMe ? GB.lightest : GB.light }}
        >
          {entry.displayName}
        </div>
        {className && (
          <div
            className="typo-micro"
            style={{ color: GB.light, opacity: 0.6, fontSize: 9 }}
          >
            {className} · {levelLabel} · F{entry.floorsCleared}
          </div>
        )}
      </div>
      <div
        className="typo-caption tabular-nums"
        style={{ color: GB.lightest, fontWeight: 600 }}
      >
        {entry.score.toLocaleString()}
      </div>
    </div>
  );
}
