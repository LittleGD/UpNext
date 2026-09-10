"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { LocalNotifications } from "@capacitor/local-notifications";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useGameStore } from "@/store/useGameStore";
import { useRetentionSetupStore, type SetupKind } from "@/store/useRetentionSetupStore";
import { enableNativeDailyReminder, retentionSetupNative } from "@/lib/retentionSetupNative";
import { cardTitle, t } from "@/i18n";
import copy from "@/data/retentionSetupCopy.json";

export default function RetentionSetupModal({ kind, canPin }: { kind: SetupKind; canPin: boolean }) {
  const progress = useGameStore(s => s.progress);
  const daily = useGameStore(s => s.daily);
  const setup = useRetentionSetupStore();
  const text = (key: keyof typeof copy) => copy[key][progress.language];
  const reminderTime = setup.time ?? progress.notificationTime;
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<keyof typeof copy | null>(null);
  const [wide, setWide] = useState(true);
  const [holding, setHolding] = useState(false);
  const [placed, setPlaced] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const container = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();
  const close = () => { if (!inFlight.current) setup.finish(kind); };
  useModalA11y(container, close, { noEscape: busy, initialFocus: heading });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (holdTimer.current) clearTimeout(holdTimer.current); };
  }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [setup.step, success]);

  const verify = useCallback(async (fromResume = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (kind === "widget") {
        const state = await retentionSetupNative.getSetupState();
        if (!mounted.current) return;
        setSuccess(state.installed);
        if (!state.installed && !fromResume) setError("홈 화면에 위젯을 추가해주세요.");
      } else {
        const permission = await LocalNotifications.checkPermissions();
        if (fromResume && permission.display !== "granted") {
          if (mounted.current) setDenied(true);
          return;
        }
        const state = useRetentionSetupStore.getState();
        const game = useGameStore.getState();
        const time = state.time ?? game.progress.notificationTime;
        const enabled = await enableNativeDailyReminder(time, t("notif.daily.reminder.body", game.progress.language), game.progress.language);
        // Persist only after the native request is actually registered.
        if (enabled) {
          game.setNotificationTime(time);
          game.setNotificationsEnabled(true);
          state.draft({ awaitingExternal: null });
        }
        if (!mounted.current) return;
        setDenied(!enabled);
        setSuccess(enabled);
      }
    } catch {
      if (mounted.current) setError(kind === "notifications" ? "설정을 저장하지 못했어요. 다시 시도해주세요." : "error");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [kind]);

  useEffect(() => {
    const resume = () => {
      if (useRetentionSetupStore.getState().awaitingExternal === kind) void verify(true);
    };
    const visibility = () => { if (!document.hidden) resume(); };
    const listener = retentionSetupNative.addListener("setupResumed", resume);
    document.addEventListener("visibilitychange", visibility);
    // Restores a handoff even if Android killed the app while Settings was open.
    resume();
    return () => {
      void listener.then(handle => handle.remove()).catch(() => {});
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [kind, verify]);

  async function openSettings() {
    setup.draft({ time: reminderTime, awaitingExternal: "notifications" });
    setError(null);
    try { await retentionSetupNative.openNotificationSettings(); }
    catch { setError("error"); }
  }
  async function pin() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setup.draft({ awaitingExternal: "widget" });
    try {
      const result = await retentionSetupNative.requestPinWidget();
      if (!result.requested) setError("widgetManual");
    } catch { setError("error"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function stopHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  }
  function startHold() {
    stopHold();
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      setup.draft({ step: 1 });
    }, 650);
  }

  const isReminder = kind === "notifications";
  const title = success ? (isReminder ? "알림 설정 완료" : "위젯 추가 완료")
    : isReminder ? (denied ? "알림이 꺼져 있어요" : "내일도 이어갈까요?")
    : setup.step === 0 ? "홈 화면에서 바로 보기" : setup.step === 1 ? "크기 고르기" : "홈 화면에 추가하기";
  const description = success ? null : isReminder ? (denied ? "설정에서 알림을 켜주세요." : null)
    : setup.step === 0 ? "빈 곳을 길게 눌러보세요." : setup.step === 1 ? null
    : canPin ? "추가 버튼으로 홈 화면에 놓으세요." : "홈 화면으로 나가 따라 해보세요.";
  const cards = daily.challengePhase === "extra" ? daily.extraSelectedCards : daily.challengePhase === "super" ? daily.superSelectedCards : daily.selectedCards;
  const completedIds = daily.challengePhase === "extra" ? daily.extraCompletedIds : daily.challengePhase === "super" ? daily.superCompletedIds : daily.completedIds;
  const pending = cards.find(card => !completedIds.includes(card.id));
  const challenge = pending ? cardTitle(pending, progress.language) : cards.length ? text("오늘의 챌린지 완료") : text("오늘의 챌린지");
  const primaryLabel = success ? "완료" : busy ? "확인 중" : isReminder ? (denied ? "설정 열기" : "알림 켜기")
    : setup.step === 0 ? "다음" : setup.step === 1 || (canPin && setup.awaitingExternal !== "widget") ? "홈 화면에 추가하기" : "추가 확인";
  const primary = () => {
    if (success) close();
    else if (isReminder) { if (denied) void openSettings(); else void verify(); }
    else if (setup.step === 0) setup.draft({ step: 1 });
    else if (setup.step === 1) { setup.draft({ step: 2 }); if (canPin) void pin(); }
    else if (canPin && setup.awaitingExternal !== "widget") void pin();
    else void verify();
  };
  const transition = reduced ? { duration: .12 } : { type: "spring" as const, duration: .32, bounce: .18 };
  const widgetPreview = <motion.div layout={!reduced} transition={transition}
    style={{ width: wide ? '100%' : '62%' }} className="rounded-xl bg-bg-primary p-3.5 text-left text-text-primary">
    <div className="mb-3 flex items-center justify-between typo-micro"><span>UpNext</span><PixelIcon name="Fire" size={16} color="var(--accent-primary)" /></div>
    <p className="typo-body">{challenge}</p>
    <div className="mt-3 flex items-center gap-1.5">
      {cards.slice(0, 5).map((card, index) => <span key={card.id} className={`h-1 w-4 rounded-full ${index < completedIds.length ? 'bg-accent' : 'bg-bg-hover'}`} />)}
      <span className="typo-micro tabular-nums">{completedIds.length}/{cards.length}</span>
      <PixelIcon name="ArrowUp" size={16} color="var(--accent-primary)" className="ml-auto rotate-45" />
    </div>
  </motion.div>;

  return <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-lg p-4"
    style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
    onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
    <motion.div ref={container} role="dialog" aria-modal="true" aria-labelledby="retention-title" data-testid="retention-setup"
      onClick={event => event.stopPropagation()}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 30, scale: .95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }} transition={transition}
      className="flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-32px)] w-full max-w-[380px] flex-col gap-4 rounded-[18px] bg-bg-surface p-5 shadow-2xl">
      <div className="min-h-0 overflow-y-auto">
        <div className="flex items-center gap-2">
          <PixelIcon name={success ? 'Check' : isReminder ? 'Clock' : 'Grid3x3'} size={20} color="var(--accent-primary)" />
          <h2 id="retention-title" ref={heading} tabIndex={-1} className="typo-heading text-text-primary outline-none">{text(title)}</h2>
          {!isReminder && !success && setup.step < 2 && <span className="ml-auto shrink-0 typo-micro text-text-tertiary">{setup.step + 1}/2</span>}
        </div>
        {description && <p className="mt-3 typo-caption text-text-secondary">{text(description)}</p>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={success ? "success" : isReminder ? "reminder" : setup.step} className="mt-4"
            initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}>
            {isReminder ? <>
              <div aria-label={text("알림 미리보기")} className="flex items-start gap-3 rounded-xl bg-bg-elevated p-3.5">
                <PixelIcon name="Fire" size={24} color="var(--accent-primary)" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2 typo-micro text-text-secondary"><span>UpNext</span><span className="tabular-nums">{reminderTime}</span></div>
                  <p className="typo-body text-text-primary">{text("오늘의 챌린지")}</p>
                </div>
              </div>
              {!success && <>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {([['09:00', '아침'], ['12:30', '점심'], ['20:00', '저녁']] as const).map(([time, label]) => <button key={time} disabled={busy} aria-pressed={reminderTime === time}
                    onClick={() => setup.draft({ time })} className={`press-affordance min-h-11 rounded-full px-2 typo-caption disabled:opacity-50 ${reminderTime === time ? 'bg-accent text-bg-primary' : 'bg-bg-elevated text-text-secondary'}`}>{text(label)}</button>)}
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 typo-caption text-text-secondary">{text("직접 고르기")}
                  <input type="time" value={reminderTime} disabled={busy} required onChange={event => { if (event.target.value) setup.draft({ time: event.target.value }); }} className="min-h-11 max-w-[60%] rounded-lg bg-bg-elevated px-3 typo-body text-text-primary [color-scheme:dark]" />
                </label>
              </>}
            </> : success ? widgetPreview : <>
              <div className="rounded-xl bg-bg-elevated p-3.5">
                {setup.step < 2 && <p className="mb-3 typo-micro text-text-tertiary">{text("연습")}</p>}
                {setup.step === 0 ? <>
                  <div aria-hidden className="flex gap-3.5">{[0,1,2,3].map(index => <span key={index} className="size-8 rounded-lg bg-text-secondary/15" />)}</div>
                  <button aria-label={text("빈 곳 길게 누르기")} onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setup.draft({ step: 1 }); } }}
                    onContextMenu={event => event.preventDefault()} className="flex min-h-24 w-full touch-none select-none items-center justify-center">
                    <span className="relative flex size-14 items-center justify-center"><PixelIcon name="Hand" size={30} color="var(--accent-primary)" /><svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56" aria-hidden="true"><motion.circle cx="28" cy="28" r="26" fill="none" stroke="var(--accent-primary)" strokeWidth="2" initial={false} animate={{ pathLength: holding ? 1 : 0 }} transition={{ duration: holding && !reduced ? .65 : 0, ease: "linear" }} /></svg></span>
                  </button>
                </> : setup.step === 1 ? <>
                  <button aria-label={text("위젯 놓기")} onClick={() => setPlaced(true)} className="w-full">
                    <motion.div animate={{ scale: placed && !reduced ? .96 : 1 }} transition={transition} className="flex justify-center">{widgetPreview}</motion.div>
                  </button>
                  <p className={`mt-2 text-center typo-micro ${placed ? 'text-accent' : 'text-text-secondary'}`}>{text(placed ? "연습 완료" : "위젯을 눌러 놓아보세요.")}</p>
                  <div role="group" aria-label={text("위젯 크기")} className="mt-3 flex gap-2">
                    {[false, true].map(value => <button key={String(value)} aria-pressed={wide === value} onClick={() => setWide(value)} className={`press-affordance min-h-11 flex-1 rounded-full typo-caption ${wide === value ? 'bg-accent text-bg-primary' : 'bg-bg-hover text-text-secondary'}`}>{text(value ? "넓게" : "작게")}</button>)}
                  </div>
                </> : canPin ? widgetPreview : <ol className="space-y-3 typo-body text-text-primary">
                  {["빈 곳 길게 누르기", "위젯 → UpNext → 추가"].map((key, index) => <li key={key} className="flex gap-3"><span className="text-accent">{index + 1}</span>{text(key as keyof typeof copy)}</li>)}
                </ol>}
              </div>
            </>}
          </motion.div>
        </AnimatePresence>
        {error && <p role="alert" className="mt-3 typo-caption text-accent-secondary">{text(error)}</p>}
      </div>
      <div className="shrink-0 space-y-1">
        <motion.button whileTap={reduced ? undefined : { scale: .97 }} onClick={primary} disabled={busy} data-testid="retention-primary" className="min-h-[52px] w-full rounded-xl bg-accent px-4 typo-body text-bg-primary disabled:opacity-50">{text(primaryLabel)}</motion.button>
        {!success && <div className="flex gap-2">
          {!isReminder && setup.step === 2 && setup.awaitingExternal === "widget" && canPin && <button disabled={busy} onClick={() => void pin()} className="min-h-12 flex-1 typo-body text-text-tertiary disabled:opacity-50">{text("다시 추가")}</button>}
          <button onClick={close} disabled={busy} className="min-h-12 flex-1 typo-body text-text-tertiary disabled:opacity-50">{text("나중에")}</button>
        </div>}
      </div>
    </motion.div>
  </motion.div>;
}
