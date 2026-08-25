"use client";

import { useEffect, useRef, useState } from "react";
import PixelIcon from "@/components/icons/PixelIcon";
import GbConfirm from "@/components/uphero/GbConfirm";
import PixelConfetti from "@/components/effects/PixelConfetti";
import { useDuoStore } from "@/store/useDuoStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { triggerHaptic } from "@/lib/sounds";
import { checkedIn, poked, jointStreak, addDays, type DuoSnapshot } from "@/lib/duo";

/**
 * 2인 불꽃 카드 (iOS RetentionSectionView.DuoFlameCard 포팅), 3상태.
 *
 *  - 비활성: 빈 파티 자리 + 초대코드 입력/참여 + 초대코드 만들기.
 *    익명 사용자는 조용한 무반응 대신 로그인 게이트(onRequestLogin → LoginOverlay).
 *  - 대기: 나 + 빈 자리, 초대코드 표시, 나가기.
 *  - 활성: 둘 다 켜지면 융합 불꽃(시안) + 함께 N일째. 내가 켰고 친구가 아직이면
 *    콕 찌르기 CTA (당일 1회, 서버 nudges 기준 쿨다운). 최근 7일 듀오 도트.
 *
 * 색 규칙: 솔로 = accent(라임), 듀오/함께 = accent-cyan. 나가기는 GbConfirm 으로
 * 확인 (파트너 쪽 기록에서 내 데이터가 제거되는 되돌리기 어려운 동작).
 * 스토어 message 는 t(key, params) 로 렌더 후 일정 시간 뒤 clearMessage().
 */

interface DuoFlameCardProps {
  /** 익명 사용자가 듀오 기능을 시도할 때, 페이지가 LoginOverlay 를 띄운다. */
  onRequestLogin: () => void;
}

export default function DuoFlameCard({ onRequestLogin }: DuoFlameCardProps) {
  const { t } = useTranslation();
  const { play } = useSound();
  const reducedMotion = useReducedMotion();

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const hapticEnabled = useGameStore((s) => s.progress.hapticEnabled ?? true);

  const activeDuo = useDuoStore((s) => s.activeDuo);
  const inviteCode = useDuoStore((s) => s.inviteCode);
  const isWorking = useDuoStore((s) => s.isWorking);
  const message = useDuoStore((s) => s.message);
  const friendNudgedMe = useDuoStore((s) => s.friendNudgedMe);
  const createInvite = useDuoStore((s) => s.createInvite);
  const joinInvite = useDuoStore((s) => s.joinInvite);
  const leaveDuo = useDuoStore((s) => s.leaveDuo);
  const nudge = useDuoStore((s) => s.nudge);
  const acknowledgeNudge = useDuoStore((s) => s.acknowledgeNudge);
  const clearMessage = useDuoStore((s) => s.clearMessage);

  const [joinCode, setJoinCode] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  // 데이 롤오버 재렌더 트리거 — 렌더 시점 getTodayString() 은 경계를 넘겨도 재렌더가
  // 없어 열어둔 탭에서 어제 날짜로 굳는다 (FlamePage 와 동일 패턴). checkDailyReset
  // 이 60초 틱에서 daily.date 를 갱신하므로 이를 구독한다.
  const today = useGameStore((s) => s.daily.date);
  const isActive = activeDuo !== null && activeDuo.memberIds.length === 2 && uid !== null;
  const isWaiting = activeDuo !== null && !isActive;

  const friendId = isActive
    ? activeDuo.memberIds.find((id) => id !== uid) ?? null
    : null;
  const friendName =
    (friendId ? activeDuo?.memberNames[friendId] : undefined) ?? t("flame.duo.friend");
  const mine = isActive && uid ? checkedIn(activeDuo, uid, today) : false;
  const theirs = isActive && friendId ? checkedIn(activeDuo, friendId, today) : false;
  const fused = mine && theirs;

  // 스토어 message, 렌더 후 6초 뒤 자동 클리어 (탭하면 즉시 닫힘)
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => clearMessage(), 6000);
    return () => clearTimeout(timer);
  }, [message, clearMessage]);

  // 콕 배너 수신 순간 햅틱 1회 (iOS Haptics.play(.medium) 대응, 소리 없이)
  const prevNudgedRef = useRef(false);
  useEffect(() => {
    if (friendNudgedMe && !prevNudgedRef.current && hapticEnabled) {
      triggerHaptic("confirm");
    }
    prevNudgedRef.current = friendNudgedMe;
  }, [friendNudgedMe, hapticEnabled]);

  // 융합(둘 다 켜짐) 전이 순간에만 축하, 첫 관찰(마운트)은 스킵 (iOS onChange 동일)
  const prevFusedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = prevFusedRef.current;
    prevFusedRef.current = fused;
    if (prev === null || prev === fused || !fused) return;
    if (hapticEnabled) triggerHaptic("levelUp");
    if (reducedMotion) return;
    // rAF 로 감싸 effect 본문 직접 setState 를 피한다 (set-state-in-effect 규칙)
    const raf = requestAnimationFrame(() => setCelebrate(true));
    const timer = setTimeout(() => setCelebrate(false), 1600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [fused, hapticEnabled, reducedMotion]);

  const handleJoin = () => {
    play("select");
    void joinInvite(joinCode);
  };

  const handleLeaveConfirmed = () => {
    setLeaveConfirmOpen(false);
    void leaveDuo();
  };

  return (
    <section className="bg-bg-surface rounded-2xl p-4 space-y-3">
      {/* 헤더, 타이틀 + 작업 중 스피너 */}
      <div className="flex items-center gap-2">
        <PixelIcon name="Users" size={16} color="var(--text-primary)" />
        <h2 className="typo-body text-text-primary flex-1">{t("flame.duo.title")}</h2>
        {isWorking && (
          <span
            aria-hidden="true"
            className="w-4 h-4 rounded-full border-2 border-bg-hover border-t-accent animate-spin"
          />
        )}
      </div>

      {/* SR 라이브 리전 (콕 배너 + 스토어 메시지) — aria-live 는 "이미 존재하는
          리전에 삽입된" 콘텐츠만 안내하므로 상시 렌더 sr-only 로 둔다. 시각 UI 를
          그대로 role="status" 로 감싸면 space-y-3 흐름에 빈 박스가 남아 간격이
          두 배가 되고, 조건부 마운트면 SR 이 침묵하는 문제를 함께 피한다. */}
      <span role="status" className="sr-only">
        {friendNudgedMe ? t("flame.duo.nudgeBanner") : ""}
      </span>
      <span role="status" className="sr-only">
        {message ? t(message.key, message.params) : ""}
      </span>

      {/* 받는 쪽 콕 배너, 탭하면 확인(닫힘) */}
      {friendNudgedMe && (
        <button
          type="button"
          onClick={() => {
            play("select");
            acknowledgeNudge();
          }}
          className="press-affordance w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left"
          style={{ background: "color-mix(in srgb, var(--accent-cyan) 16%, transparent)" }}
        >
          <PixelIcon name="Zap" size={14} color="var(--accent-cyan)" />
          <span className="typo-caption text-accent-cyan flex-1">
            {t("flame.duo.nudgeBanner")}
          </span>
        </button>
      )}

      {isActive && uid ? (
        <ActiveBody
          duo={activeDuo}
          uid={uid}
          today={today}
          friendName={friendName}
          mine={mine}
          theirs={theirs}
          fused={fused}
          onNudge={() => {
            play("select");
            void nudge();
          }}
          onLeave={() => {
            play("select");
            setLeaveConfirmOpen(true);
          }}
        />
      ) : isWaiting && activeDuo ? (
        <WaitingBody
          duo={activeDuo}
          uid={uid}
          today={today}
          inviteCode={inviteCode}
          onLeave={() => {
            play("select");
            setLeaveConfirmOpen(true);
          }}
        />
      ) : (
        <InactiveBody
          uid={uid}
          joinCode={joinCode}
          isWorking={isWorking}
          onJoinCodeChange={setJoinCode}
          onJoin={handleJoin}
          onCreate={() => {
            play("select");
            void createInvite();
          }}
          onRequestLogin={() => {
            play("select");
            onRequestLogin();
          }}
        />
      )}

      {/* 스토어 메시지, 초대 생성/참여/에러 등. 탭하면 즉시 닫힘 */}
      {message && (
        <button
          type="button"
          onClick={clearMessage}
          className="w-full text-left typo-caption text-text-tertiary"
        >
          {t(message.key, message.params)}
        </button>
      )}

      {/* 융합 축하 (iOS PixelConfetti overlay 대응) */}
      <PixelConfetti trigger={celebrate} />

      {/* 나가기 확인, 파트너 문서에서 내 기록이 빠지는 동작이라 danger 확인 */}
      <GbConfirm
        open={leaveConfirmOpen}
        danger
        title={t("flame.duo.leaveConfirmTitle")}
        body={t("flame.duo.leaveConfirmBody")}
        confirmLabel={t("flame.duo.leave")}
        onConfirm={handleLeaveConfirmed}
        onCancel={() => setLeaveConfirmOpen(false)}
      />
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */

/** 활성, 두 명. 둘 다 켜지면 융합 불꽃 + 함께 N일째, 아니면 개별 스파크. */
function ActiveBody({
  duo,
  uid,
  today,
  friendName,
  mine,
  theirs,
  fused,
  onNudge,
  onLeave,
}: {
  duo: DuoSnapshot;
  uid: string;
  today: string;
  friendName: string;
  mine: boolean;
  theirs: boolean;
  fused: boolean;
  onNudge: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const joint = jointStreak(duo, uid, today);
  const pokedToday = poked(duo, uid, today);

  // 최근 7일 듀오 도트, 둘 다 = 시안 / 한 명 = 시안 38% / 없음 = elevated
  const recentDays: string[] = [];
  for (let i = -6; i <= 0; i++) {
    const d = addDays(today, i);
    if (d !== null) recentDays.push(d);
  }
  const friendId = duo.memberIds.find((id) => id !== uid) ?? "";
  const dotColor = (day: string): string => {
    const m = checkedIn(duo, uid, day);
    const f = friendId ? checkedIn(duo, friendId, day) : false;
    if (m && f) return "var(--accent-cyan)";
    if (m || f) return "color-mix(in srgb, var(--accent-cyan) 38%, transparent)";
    return "var(--bg-elevated)";
  };

  return (
    <div className="space-y-3">
      {fused ? (
        <div className="flex flex-col items-center gap-1.5 py-1">
          <div className="relative flex items-center justify-center h-24 w-full">
            <div
              aria-hidden="true"
              className="absolute rounded-full"
              style={{
                width: 100,
                height: 100,
                background: "var(--accent-cyan)",
                opacity: 0.22,
                filter: "blur(22px)",
              }}
            />
            <PixelIcon name="Fire" size={56} color="var(--accent-cyan)" />
          </div>
          <p className="typo-heading text-accent-cyan">
            {t("flame.duo.together", { days: joint })}
          </p>
          <p className="typo-caption text-accent-cyan">{t("flame.duo.bothLit")}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center gap-6 py-1">
            <FlameSpark name={t("flame.duo.me")} on={mine} />
            <FlameSpark name={friendName} on={theirs} />
          </div>
          {joint > 0 && (
            <p className="typo-caption text-accent-cyan text-center">
              {t("flame.duo.together", { days: joint })}
            </p>
          )}
          {mine && !theirs ? (
            // 내가 켰고 친구는 아직, 기다림 카피 대신 친구를 깨우는 CTA
            <div className="space-y-2">
              <p className="typo-caption text-text-tertiary text-center">
                {t("flame.duo.friendNotYet", { name: friendName })}
              </p>
              <button
                type="button"
                onClick={onNudge}
                disabled={pokedToday}
                className="press-affordance w-full h-11 rounded-full flex items-center justify-center gap-1.5 typo-body font-semibold"
                style={{
                  background: pokedToday ? "var(--bg-elevated)" : "var(--accent-cyan)",
                  color: pokedToday ? "var(--text-tertiary)" : "var(--bg-primary)",
                }}
              >
                <PixelIcon
                  name="Zap"
                  size={14}
                  color={pokedToday ? "var(--text-tertiary)" : "var(--bg-primary)"}
                />
                {pokedToday ? t("flame.duo.nudged") : t("flame.duo.nudge")}
              </button>
            </div>
          ) : (
            <p
              className={`typo-caption text-center ${
                theirs && !mine ? "text-text-secondary" : "text-text-tertiary"
              }`}
            >
              {theirs && !mine
                ? t("flame.duo.status.friendFirst")
                : mine && !theirs
                  ? t("flame.duo.status.waitingFriend")
                  : t("flame.duo.status.bothNotYet")}
            </p>
          )}
        </>
      )}

      {/* 최근 7일 도트 (보조 시각) + 나가기 */}
      <div className="flex items-center gap-2 pt-0.5">
        <div className="flex items-center gap-2" aria-hidden="true">
          {recentDays.map((day) => (
            <span
              key={day}
              className="w-3 h-3 rounded-full"
              style={{ background: dotColor(day) }}
            />
          ))}
        </div>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onLeave}
          className="press-affordance typo-micro text-text-tertiary py-1.5"
        >
          {t("flame.duo.leave")}
        </button>
      </div>
    </div>
  );
}

/** 대기, 초대했지만 친구 미참여 (memberIds 1명). */
function WaitingBody({
  duo,
  uid,
  today,
  inviteCode,
  onLeave,
}: {
  duo: DuoSnapshot;
  uid: string | null;
  today: string;
  inviteCode: string | null;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const mine = uid ? checkedIn(duo, uid, today) : false;

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="flex items-center justify-center gap-6 py-1">
        <FlameSpark name={t("flame.duo.me")} on={mine} />
        <EmptyFriendSlot />
      </div>
      <p className="typo-caption text-text-tertiary">{t("flame.duo.waiting")}</p>
      {inviteCode && (
        // 초대코드, 복사할 수 있게 선택 허용 (전역 user-select 차단의 옵트아웃)
        <p className="typo-heading text-accent tabular-nums allow-select">
          {t("flame.duo.inviteCode", { code: inviteCode })}
        </p>
      )}
      <button
        type="button"
        onClick={onLeave}
        className="press-affordance typo-micro text-text-tertiary py-1.5"
      >
        {t("flame.duo.leave")}
      </button>
    </div>
  );
}

/** 비활성, 듀오 없음. 빈 파티 자리 + 초대/참여 (익명은 로그인 게이트). */
function InactiveBody({
  uid,
  joinCode,
  isWorking,
  onJoinCodeChange,
  onJoin,
  onCreate,
  onRequestLogin,
}: {
  uid: string | null;
  joinCode: string;
  isWorking: boolean;
  onJoinCodeChange: (code: string) => void;
  onJoin: () => void;
  onCreate: () => void;
  onRequestLogin: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center justify-center gap-4 py-1">
        <FlameSpark name={t("flame.duo.me")} on={false} />
        <PixelIcon name="Plus" size={14} color="var(--text-tertiary)" />
        <EmptyFriendSlot />
      </div>
      <div className="text-center space-y-0.5">
        <p className="typo-heading text-text-primary">{t("flame.duo.inactiveTitle")}</p>
        <p className="typo-caption text-text-tertiary">{t("flame.duo.inactiveSub")}</p>
      </div>

      {uid === null ? (
        // 익명 게이트, 조용한 no-op 대신 로그인 오버레이 유도 (iOS promptLogin 동일)
        <div className="w-full space-y-1.5">
          <button
            type="button"
            onClick={onRequestLogin}
            className="press-affordance w-full h-11 rounded-xl bg-bg-elevated flex items-center justify-center gap-1.5 typo-caption text-accent"
          >
            <PixelIcon name="Link" size={14} color="var(--accent-primary)" />
            {t("flame.duo.loginCta")}
          </button>
          <p className="typo-micro text-text-tertiary text-center">
            {t("flame.duo.loginRequired")}
          </p>
        </div>
      ) : (
        <div className="w-full space-y-2.5">
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && joinCode.trim().length >= 4) onJoin();
              }}
              placeholder={t("flame.duo.codePlaceholder")}
              aria-label={t("flame.duo.codePlaceholder")}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-bg-elevated typo-caption text-text-primary placeholder:text-text-tertiary tracking-widest"
            />
            <button
              type="button"
              onClick={onJoin}
              disabled={isWorking || joinCode.trim().length < 4}
              className="press-affordance h-11 px-4 rounded-xl bg-accent text-bg-primary typo-caption font-semibold disabled:opacity-50"
            >
              {t("flame.duo.join")}
            </button>
          </div>
          <button
            type="button"
            onClick={onCreate}
            disabled={isWorking}
            className="press-affordance w-full h-11 rounded-xl bg-bg-elevated flex items-center justify-center gap-1.5 typo-caption text-accent disabled:opacity-50"
          >
            <PixelIcon name="Link" size={14} color="var(--accent-primary)" />
            {t("flame.duo.createInvite")}
          </button>
        </div>
      )}
    </div>
  );
}

/** 멤버 스파크, 켜짐 = 시안 불꽃, 꺼짐 = 흐린 회색 (이름 1줄 말줄임). */
function FlameSpark({ name, on }: { name: string; on: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 max-w-24">
      <PixelIcon
        name="Fire"
        size={30}
        color={
          on
            ? "var(--accent-cyan)"
            : "color-mix(in srgb, var(--text-tertiary) 40%, transparent)"
        }
      />
      <span
        className={`typo-micro truncate max-w-full ${
          on ? "text-text-primary" : "text-text-tertiary"
        }`}
      >
        {name}
      </span>
    </div>
  );
}

/** 빈 친구 자리, 아바타 자리 표시 (iOS emptyFriendSlot 동일). */
function EmptyFriendSlot() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: "color-mix(in srgb, var(--bg-elevated) 60%, transparent)" }}
      >
        <PixelIcon
          name="Users"
          size={16}
          color="color-mix(in srgb, var(--text-tertiary) 50%, transparent)"
        />
      </div>
      <span
        className="typo-micro"
        style={{ color: "color-mix(in srgb, var(--text-tertiary) 60%, transparent)" }}
      >
        {t("flame.duo.emptySlot")}
      </span>
    </div>
  );
}
