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
        if (!state.installed && !fromResume) setError("아직 위젯이 확인되지 않아요. 홈 화면에서 추가한 뒤 다시 확인해주세요.");
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
  const title = success ? (isReminder ? "내일 만날 시간, 정했어요" : "홈 화면에 자리 잡았어요")
    : isReminder ? (setup.manual === kind ? "나에게 맞는\n알림 시간을 정해요" : "첫 실천 완료!\n내일은 언제 만날까요?")
    : setup.step === 2 ? "widgetReal"
    : setup.manual === kind ? "오늘의 챌린지를\n홈 화면에서 만나요" : "두 번째 실천도 완료!\n홈 화면에 꺼내둘까요?";
  const description = isReminder ? (success ? "선택한 시간에 하루 한 번 알려드릴게요. 설정에서 언제든 바꿀 수 있어요." : denied ? "notificationSettings" : "실천하기 편한 시간을 골라주세요. 하루 한 번, 오늘의 챌린지를 알려드릴게요.")
    : success ? "오늘의 챌린지를 바로 확인하고, 위젯을 눌러 UpNext로 돌아올 수 있어요."
    : setup.step === 2 ? (canPin ? "widgetPin" : "widgetManual") : setup.step === 1 ? "widgetChoose" : "widgetIntro";
  const cards = daily.challengePhase === "extra" ? daily.extraSelectedCards : daily.challengePhase === "super" ? daily.superSelectedCards : daily.selectedCards;
  const completedIds = daily.challengePhase === "extra" ? daily.extraCompletedIds : daily.challengePhase === "super" ? daily.superCompletedIds : daily.completedIds;
  const challenge = cards[0] ? cardTitle(cards[0], progress.language) : text("오늘의 챌린지");
  const primaryLabel = success ? "좋아요" : busy ? "확인 중" : isReminder ? (denied ? "기기 알림 설정 열기" : "이 시간에 알림 받기")
    : setup.step < 2 ? "다음 단계" : canPin && setup.awaitingExternal !== "widget" ? "widgetAdd" : "추가했어요 · 확인하기";
  const primary = () => {
    if (success) close();
    else if (isReminder) { if (denied) void openSettings(); else void verify(); }
    else if (setup.step < 2) setup.draft({ step: setup.step + 1 });
    else if (canPin && setup.awaitingExternal !== "widget") void pin();
    else void verify();
  };
  const transition = reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 370, damping: 34 };

  return <motion.div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 px-2 pt-8 sm:items-center sm:px-4"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .18 }}>
    <motion.div ref={container} role="dialog" aria-modal="true" aria-labelledby="retention-title" data-testid="retention-setup"
      initial={{ y: reduced ? 0 : 36 }} animate={{ y: 0 }} exit={{ y: reduced ? 0 : 28 }} transition={transition}
      className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-[28px] bg-bg-surface shadow-2xl sm:rounded-[28px]">
      <div className="flex items-center justify-between px-6 pt-4">
        <span className="text-xs font-semibold tracking-wide text-accent">{text(isReminder ? "내일도 이어가요" : "눈에 보이면 더 쉬워요")}</span>
        <button onClick={close} disabled={busy} aria-label={text("닫기")} className="flex size-11 items-center justify-center rounded-xl text-text-secondary disabled:opacity-50"><span aria-hidden="true" className="text-2xl">×</span></button>
      </div>
      <div className="overflow-y-auto px-6 pb-4">
        <h2 id="retention-title" ref={heading} tabIndex={-1} className="whitespace-pre-line text-[27px] font-bold leading-[1.3] tracking-tight text-text-primary outline-none">{text(title)}</h2>
        <p className="mb-5 mt-3 text-sm leading-relaxed text-text-secondary">{text(description)}</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={success ? "success" : isReminder ? "reminder" : setup.step}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }}>
            {success ? <div className="flex min-h-44 flex-col items-center justify-center gap-4 rounded-2xl bg-accent/10 py-7 text-accent">
              <motion.div initial={{ scale: reduced ? 1 : .7 }} animate={{ scale: 1 }} transition={transition}><PixelIcon name="Check" size={42} /></motion.div>
              <p className="text-center font-semibold">{text(isReminder ? "알림 설정 완료" : "위젯 추가를 확인했어요")}</p>
              {isReminder && <p className="text-3xl font-semibold tabular-nums">{reminderTime}</p>}
            </div> : isReminder ? <>
              <div aria-label={text("알림 미리보기")} className="rounded-2xl bg-bg-elevated p-4">
                <div className="mb-3 flex items-center gap-2 text-xs text-text-secondary"><PixelIcon name="Bell" size={15} /><span>UpNext</span><span className="ml-auto">{reminderTime}</span></div>
                <p className="font-semibold text-text-primary">{text("오늘의 챌린지")}</p><p className="mt-1 text-sm text-text-secondary">{t("notif.daily.reminder.body", progress.language)}</p>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {([['09:00', '아침'], ['12:30', '점심'], ['20:00', '저녁']] as const).map(([time, label]) => <button key={time} disabled={busy} aria-pressed={reminderTime === time}
                  onClick={() => setup.draft({ time })} className={`rounded-xl px-2 py-3 text-sm disabled:opacity-50 ${reminderTime === time ? 'bg-accent/15 text-accent ring-1 ring-accent/70' : 'bg-bg-elevated text-text-secondary'}`}>
                  {text(label)}<span className="mt-1 block font-semibold tabular-nums">{time}</span></button>)}
              </div>
              <label className="mt-4 flex items-center justify-between gap-3 text-sm text-text-secondary">{text("알림 시간")}
                <input type="time" value={reminderTime} disabled={busy} required onChange={event => { if (event.target.value) setup.draft({ time: event.target.value }); }} className="min-h-11 rounded-xl bg-bg-elevated px-3 text-text-primary [color-scheme:dark]" />
              </label>
            </> : <>
              <div className="relative overflow-hidden rounded-[24px] bg-[radial-gradient(ellipse_at_top,#344337,#121812_80%)] px-5 pb-7 pt-4">
                <div className="mb-5 flex justify-between text-[11px] text-white/50"><span>{text("practice")}</span><span>{Math.min(setup.step + 1, 3)}/3</span></div>
                {setup.step === 0 ? <button aria-label={text("빈 곳을 길게 눌러보세요")} onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setup.draft({ step: 1 }); } }}
                  onContextMenu={event => event.preventDefault()} className="flex min-h-44 w-full touch-none select-none flex-col items-center justify-center gap-4 rounded-2xl text-sm text-white/80">
                  <span className="relative flex size-14 items-center justify-center"><span className="size-3 rounded-full bg-accent" /><svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56" aria-hidden="true"><motion.circle cx="28" cy="28" r="24" fill="none" stroke="var(--accent)" strokeWidth="2" initial={false} animate={{ pathLength: holding ? 1 : 0 }} transition={{ duration: holding && !reduced ? .65 : 0, ease: "linear" }} /></svg></span>
                  {text("빈 곳을 길게 눌러보세요")}
                </button> : <div className="flex min-h-44 flex-col items-center justify-center gap-4">
                  <motion.div layout={!reduced} transition={transition} style={{ width: wide ? '100%' : '70%' }} className="rounded-2xl bg-[#19211b] p-4 shadow-[0_4px_28px_#0004]">
                    <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#ccff00]"><span>UpNext</span><span>Lv.{progress.level}</span></div>
                    <p className="text-xs text-white/50">{text("오늘의 챌린지")}</p><p className="mt-1 text-sm font-semibold leading-snug text-white">{challenge}</p>
                    <div className="mt-4 h-1 rounded-full bg-white/10"><div style={{ width: `${cards.length ? Math.min(100, completedIds.length / cards.length * 100) : 0}%` }} className="h-1 rounded-full bg-[#ccff00]" /></div>
                  </motion.div>
                  {setup.step === 1 && <button onClick={() => setup.draft({ step: 2 })} className="flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm text-white"><PixelIcon name="Grid3x3" size={16} />{text("위젯 추가")}<PixelIcon name="ChevronRight" size={15} /></button>}
                </div>}
              </div>
              {setup.step === 1 && <div role="group" aria-label={text("위젯 크기")} className="mt-3 flex justify-center gap-2">
                {[false, true].map(value => <button key={String(value)} aria-pressed={wide === value} onClick={() => setWide(value)} className={`min-h-11 rounded-full px-5 text-sm ${wide === value ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-text-secondary'}`}>{text(value ? "넓게" : "작게")}</button>)}
              </div>}
              <p className="mt-3 text-center text-xs leading-relaxed text-text-secondary">{text(setup.step === 0 ? "widgetHold" : setup.step === 1 ? "widgetChoose" : "widgetManual")}</p>
            </>}
          </motion.div>
        </AnimatePresence>
        {error && <p role="alert" className="mt-4 text-sm leading-relaxed text-amber-300">{text(error)}</p>}
      </div>
      <div className="space-y-1 px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
        <motion.button whileTap={reduced ? undefined : { scale: .97 }} onClick={primary} disabled={busy} data-testid="retention-primary" className="min-h-[52px] w-full rounded-xl bg-accent px-4 font-semibold text-[#11170a] disabled:opacity-50">{text(primaryLabel)}</motion.button>
        {!success && !isReminder && setup.step === 2 && setup.awaitingExternal === "widget" && canPin && <button disabled={busy} onClick={() => void pin()} className="min-h-11 w-full text-sm text-accent">{text("widgetAdd")}</button>}
        {!success && <button onClick={close} disabled={busy} className="min-h-11 w-full text-sm text-text-secondary disabled:opacity-50">{text("나중에 할게요")}</button>}
      </div>
    </motion.div>
  </motion.div>;
}
