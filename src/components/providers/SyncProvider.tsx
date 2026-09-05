"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured, getFirebase } from "@/lib/firebase";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { useRetentionStore } from "@/store/useRetentionStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useDuoStore } from "@/store/useDuoStore";
import { useUIStore } from "@/store/useUIStore";
import {
  startListener,
  stopListener,
  uploadLocalData,
  getCloudData,
  setSyncReady,
  flushPendingSync,
  normalizeUpHeroState,
  hasUpHeroFootprint,
} from "@/lib/sync";
import { compareProgress } from "@/lib/progressCompare";
import { freshRetentionState } from "@/lib/retention";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import type { AuthUser } from "@/types/auth";
import type { UserProgress, DailyState } from "@/types/game";
import type { RetentionState } from "@/types/retention";
import type { CloudUpHeroState } from "@/lib/sync";
import { AnimatePresence } from "framer-motion";
import MergeConflictDialog from "@/components/auth/MergeConflictDialog";
import PatchNotesModal from "@/components/PatchNotesModal";
import ReviewPromptModal from "@/components/ReviewPromptModal";
import FortunePromptModal, {
  markFortuneAutoOpen,
  markFortunePromptAsked,
  wasFortunePromptAsked,
} from "@/components/flame/FortunePromptModal";
import { LATEST_PATCH } from "@/data/patchNotes";
import { shouldShowReviewPrompt } from "@/lib/reviewPrompt";
import { isAdAvailable } from "@/lib/ads";
import { computeDailyFortune, isFortuneRevealed, readFortuneState } from "@/lib/fortune";

interface ConflictState {
  uid: string;
  localProgress: UserProgress;
  localDaily: DailyState;
  localRetention: RetentionState;
  cloudProgress: UserProgress;
  cloudDaily: DailyState;
  // null = 클라우드 문서에 retention 필드 없음 (iOS 미체크인 계정)
  cloudRetention: RetentionState | null;
  // null = 클라우드 문서에 uphero 필드 없음 (Up Hero 를 만진 적 없는 계정)
  cloudUpHero: CloudUpHeroState | null;
}

/**
 * 트랙 2-1: 클라우드 리스너 공용 콜백. progress/daily 는 기존 경로 그대로,
 * retention 은 필드가 존재할 때만 교체한다 (null 은 로컬 유지, iOS 의
 * cloudRetention ?? retention 폴백과 동일).
 *
 * retention 최신성 가드 — progress 의 aAhead 가드에 대응하는 방어선.
 * lastCheckInDate 는 계정 단위로 단조 증가("YYYY-MM-DD" 사전순 = 시간순)이므로,
 * 클라우드 값이 로컬보다 엄밀히 오래된 스냅샷이면 스킵한다. 체크인 직후
 * (디바운스 flush 전/오프라인 재시도 중) 도착한 스테일 스냅샷이 오늘 체크인을
 * 어제로 되돌려 방패 소모/스트릭 리셋/usedSaverDates 유실을 일으키는 것 방지.
 * 로컬이 미체크인(undefined)이면 항상 적용. 사용자가 MergeConflictDialog 에서
 * 명시적으로 클라우드를 선택하는 경로는 이 함수를 거치지 않는다 (의도 우선).
 */
function shouldAdoptCloudRetention(cloud: RetentionState): boolean {
  const localLast = useRetentionStore.getState().retention.lastCheckInDate;
  if (localLast === undefined) return true;
  return cloud.lastCheckInDate !== undefined && cloud.lastCheckInDate >= localLast;
}

/**
 * 업로드용 Up Hero 페이로드. 스토어가 아직 hydrate 되지 않았을 수 있으므로
 * (아지트/홈을 거치지 않은 세션) 영속본인 localStorage 를 진실원으로 읽는다.
 * 흔적이 없으면 uploadLocalData 가 키를 생략해 클라우드 값을 보존한다.
 */
function localUpHeroPayload(): CloudUpHeroState {
  return normalizeUpHeroState(loadFromStorage<unknown>("uphero"));
}

/**
 * 클라우드 Up Hero 채택 — 병합은 한 방향만 한다. 로컬에 흔적이 없고(신규 설치 /
 * 쿠키 삭제 / TWA→Capacitor 전환) 클라우드에 실제 진행이 있을 때만 내려받는다.
 * 로컬에 흔적이 있으면 로컬이 이긴다: 코인·인벤토리는 단조 증가 축이 아니라
 * (쓰면 줄고 팔면 사라진다) compareProgress 류 벡터 비교로 "앞선 쪽" 을 고를 수 없다.
 *
 * 로컬 판정을 `loadFromStorage("uphero") === null` 로 두지 않는 이유:
 * useUpHeroStore.initialize 가 schemaVersion 마이그레이션 경로에서 기본값을 곧바로
 * persist 한다. 홈/뽑기 화면(CardDrawScreen)이 마운트되며 초기화가 먼저 돌면 키는
 * "있지만 빈" 상태가 되고, 그걸 로컬 데이터로 오인하면 새 기기 로그인 때 클라우드
 * 영웅 데이터를 빈 값으로 덮어쓴다. 그래서 키 존재가 아니라 흔적으로 판정한다.
 *
 * 클라우드 쪽 흔적도 확인한다: 빈 클라우드 값을 채택하면 _setFromCloud 가 isLoaded 를
 * 세워 initialize 의 heroStartLevel seed 를 건너뛰게 만든다 (챌린지 Lv 41 신규 유저의
 * 영웅 Lv 가 1 이 아니라 41 이 되는 회귀).
 */
function adoptCloudUpHero(uphero: CloudUpHeroState | null): void {
  // Phase 2-A — 영웅 XP 풀은 단조 증가 축이라 흔적 게이트와 무관하게 max 병합한다.
  //   (로컬에 흔적이 있어 아래에서 채택을 건너뛰는 기기도, 다른 기기가 올린 더 큰
  //   풀을 받아들여야 Lv47 시드값이 클라우드를 되감는 핑퐁이 사라진다.)
  //   클라우드에 키가 없으면 no-op — 절대 지어내지 않는다.
  useUpHeroStore.getState().mergeCloudHeroXp(uphero?.heroXp);
  if (!uphero || !hasUpHeroFootprint(uphero)) return;
  if (hasUpHeroFootprint(loadFromStorage<unknown>("uphero"))) return;
  useUpHeroStore.getState()._setFromCloud(uphero);
}

function applyCloudSnapshot(
  progress: UserProgress,
  daily: DailyState,
  retention: RetentionState | null,
  uphero: CloudUpHeroState | null,
): void {
  useGameStore.getState()._setFromCloud(progress, daily);
  if (retention && shouldAdoptCloudRetention(retention)) {
    useRetentionStore.getState()._setFromCloud(retention);
  }
  adoptCloudUpHero(uphero);
}

/**
 * 오늘의 기운 진입 팝업 — 세션당 1회 게이트.
 *
 * localStorage 의 "오늘 물어봤는지" 기록(wasFortunePromptAsked)이 주 게이트지만,
 * 사파리 프라이빗 모드처럼 저장이 통째로 막히는 환경에서도 팝업이 탭 이동마다
 * 되살아나면 안 된다. 모듈 스코프라 SyncProvider 가 재마운트돼도(Fast Refresh,
 * 라우트 그룹 전환) 살아남고, 앱을 껐다 켜면 자연스럽게 초기화된다.
 */
let fortunePromptShownThisSession = false;

/**
 * requestIdleCallback 래퍼 — FCP/LCP 이후 idle 시점에 콜백 실행
 * → Firebase SDK 파싱이 초기 렌더를 방해하지 않도록 지연
 */
function whenIdle(fn: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(fn);
  } else {
    setTimeout(fn, 50);
  }
}

export default function SyncProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  // 패치 노트 모달: 초기 동기화(로컬/클라우드)가 끝나기 전까지는 lastSeenPatchVersion을
  // 신뢰할 수 없으므로 modal을 띄우지 않는다. syncSettled가 true가 되는 시점:
  // - Firebase 비사용: 즉시
  // - 로그인: 클라우드 페치 + merge 완료 후
  // - 로그아웃: auth listener null 브랜치 실행 후
  // 트랙 2-1 리뷰 반영: 로컬 useState → useUIStore 전역 플래그. /flame 이 부트스트랩
  // (클라우드 retention 채택) 완료 전 체크인을 게이트하는 데 같은 신호를 쓴다.
  const syncSettled = useUIStore((s) => s.syncSettled);
  const setSyncSettled = useUIStore((s) => s.setSyncSettled);
  const [showPatchModal, setShowPatchModal] = useState(false);
  const [showFortunePrompt, setShowFortunePrompt] = useState(false);
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUser(null);
      setSyncSettled(true);
      return;
    }

    let unsub: (() => void) | null = null;
    let cancelled = false;

    // Firebase 로딩을 idle 시점으로 지연 → TBT 감소
    whenIdle(async () => {
      if (cancelled) return;

      const { auth } = await getFirebase();
      const { onAuthStateChanged } = await import("firebase/auth");

      if (cancelled) return;

      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const user: AuthUser = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            email: firebaseUser.email,
          };
          setUser(user);
          // 트랙 2-2: 로그인 확정 시 듀오 리스너 시작 (표시이름 정규화는 스토어 내부).
          useDuoStore.getState().start(firebaseUser.uid, firebaseUser.displayName);

          try {
            const cloudResult = await getCloudData(firebaseUser.uid);
            const store = useGameStore.getState();
            // 부트스트랩 분기 판단 전에 로컬 retention 을 복원해 둔다 (idempotent).
            useRetentionStore.getState().initialize();

            // iOS SyncManager CloudLoad 3상태 미러 — "invalid"(문서는 있으나 progress
            // 손상)를 "notFound"(신규 계정)와 구분한다. invalid 를 신규로 오판해
            // uploadLocalData 하면 merge 라도 progress/daily 가 로컬로 덮이고, 로컬에
            // 체크인 기록이 있으면 멀쩡한 클라우드 retention(iOS 스트릭)까지 덮는다.
            const cloudData = typeof cloudResult === "object" ? cloudResult : null;
            const cloudInvalid = cloudResult === "invalid";

            if (cloudInvalid) {
              // 손상 문서: 업로드/덮어쓰기 없이 로컬 유지, 아래 공통 경로에서
              // 리스너만 시작해 다음 정상 스냅샷을 기다린다 (iOS CloudLoad.failed 대응).
            } else if (store.isLocalEmpty && cloudData && !store.hasCompletedOnboarding) {
              // 쿠키 삭제 후 복원 — 클라우드 데이터로 복원.
              //
              // `!hasCompletedOnboarding` 가드: isLocalEmpty 는 initialize() 시점의
              // 스냅샷이라 이후 유저가 온보딩을 끝내도 true 로 남아있을 수 있다.
              // Firebase auth listener 가 whenIdle 로 지연되어 fire 하는 동안 유저가
              // 온보딩을 완료하면, 여기서 fresh 로컬 선택(예: mode=godlife)을
              // 조용히 클라우드 값(prior mode=normal)으로 덮어쓰는 데이터 손실 발생.
              // 온보딩이 이미 완료된 상태면 로컬이 truth — 아래 compareProgress 로 합친다.
              useGameStore.getState()._setFromCloud(cloudData.progress, cloudData.daily);
              saveToStorage("progress", cloudData.progress);
              saveToStorage("daily", cloudData.daily);
              saveToStorage("onboarding_complete", true);
              useGameStore.setState({ hasCompletedOnboarding: true, isLocalEmpty: false });
              // retention 도 클라우드 복원 (필드 없으면 로컬 fresh 유지)
              if (cloudData.retention) {
                useRetentionStore.getState()._setFromCloud(cloudData.retention);
              }
              // Up Hero(코인·영웅·인벤)도 같이 복원 — 로컬에 흔적이 없을 때만 채택한다.
              adoptCloudUpHero(cloudData.uphero);
            } else if (store.isLocalEmpty && !cloudData) {
              // 진짜 신규 유저 — 기본값 저장
              saveToStorage("progress", store.progress);
              saveToStorage("daily", store.daily);
              useGameStore.setState({ isLocalEmpty: false });
            } else if (!cloudData) {
              if (store.hasCompletedOnboarding) {
                // retention/uphero 포함 여부(체크인 기록·흔적 게이트)는 uploadLocalData 가 판단
                await uploadLocalData(
                  firebaseUser.uid,
                  store.progress,
                  store.daily,
                  useRetentionStore.getState().retention,
                  localUpHeroPayload(),
                );
              }
            } else {
              if (!store.hasCompletedOnboarding) {
                applyCloudSnapshot(
                  cloudData.progress,
                  cloudData.daily,
                  cloudData.retention,
                  cloudData.uphero,
                );
              } else {
                // 데일리 진행 + 미니게임 진행(runs/xp/unlocked) + 추가/슈퍼 챌린지를
                // 벡터 비교해서 "strictly ahead"인 쪽을 자동 채택, 서로 앞서는 필드가
                // 다르면 유저에게 병합 UI를 띄운다. totalDaysCompleted만 보던 기존 로직은
                // "같은 날짜지만 로컬에 미니게임 진행이 있는" 케이스에서 클라우드가 로컬을
                // 조용히 덮어쓰는 데이터 손실 버그를 일으켰다.
                const result = compareProgress(store.progress, cloudData.progress);
                if (result === "equal" || result === "bAhead") {
                  applyCloudSnapshot(
                    cloudData.progress,
                    cloudData.daily,
                    cloudData.retention,
                    cloudData.uphero,
                  );
                } else if (result === "aAhead") {
                  // P0 — compareProgress 는 retention 을 비교하지 않으므로 progress 가
                  // 앞선다고 retention 까지 로컬이 앞선 게 아니다 (iOS 체크인 위주 사용
                  // + 웹 XP 진행 케이스). 클라우드 retention 이 더 최신이면 먼저 채택해야,
                  // 직후 60초 틱의 reconcileForToday 가 fresh retention 으로 주간 리포트를
                  // 백필해 syncToCloud("retention") 으로 iOS 스트릭/히트맵을 0/[] 로
                  // 클로버하는 경로가 막힌다 (iOS 는 머지 다이얼로그가 이 창을 없앰).
                  if (cloudData.retention && shouldAdoptCloudRetention(cloudData.retention)) {
                    useRetentionStore.getState()._setFromCloud(cloudData.retention);
                  }
                  // Up Hero 도 같은 순서 — 로컬이 비어 있으면 먼저 클라우드를 채택하고,
                  // 그 결과를 다시 올린다 (채택 후엔 로컬 = 클라우드라 업로드가 무해).
                  adoptCloudUpHero(cloudData.uphero);
                  await uploadLocalData(
                    firebaseUser.uid,
                    store.progress,
                    store.daily,
                    useRetentionStore.getState().retention,
                    localUpHeroPayload(),
                  );
                } else {
                  // 진짜 conflict — 양쪽이 서로 다른 축에서 앞서 있음
                  setConflict({
                    uid: firebaseUser.uid,
                    localProgress: store.progress,
                    localDaily: store.daily,
                    localRetention: useRetentionStore.getState().retention,
                    cloudProgress: cloudData.progress,
                    cloudDaily: cloudData.daily,
                    cloudRetention: cloudData.retention,
                    cloudUpHero: cloudData.uphero,
                  });
                  return;
                }
              }
            }
          } catch (error) {
            console.error("Sync initialization failed:", error);
          }

          setSyncReady(true);
          setSyncSettled(true);
          await startListener(firebaseUser.uid, applyCloudSnapshot);
        } else {
          const store = useGameStore.getState();
          if (store.isLocalEmpty) {
            saveToStorage("progress", store.progress);
            saveToStorage("daily", store.daily);
            useGameStore.setState({ isLocalEmpty: false });
          }
          setSyncReady(true);
          setSyncSettled(true);
          setUser(null);
          stopListener();
          // 트랙 2-2: 로그아웃/계정삭제로 auth 가 null 이 되면 듀오 리스너 해제 +
          // 상태 초기화. 익명 첫 진입에도 실행되지만 idempotent no-op 이라 무해.
          // (retention 은 익명 로컬 상태가 정당하므로 여기서 리셋하지 않는다.
          //  로그아웃 시 in-memory 리셋은 useAuthStore.signOut 이 담당.)
          useDuoStore.getState().reset();
        }
      });
    });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [setUser, setSyncSettled]);

  // 체크인/진행 직후 300ms 디바운스 창 안에서 탭을 닫으면 write 가 유실된다
  // (웹 Firestore JS 는 오프라인 영속 기본 비활성 — 큐가 재시작을 못 넘긴다).
  // pagehide + 백그라운드 전환 시 즉시 flush 해 유실 창을 좁힌다 (best-effort).
  useEffect(() => {
    const onPageHide = () => flushPendingSync();
    const onVisibilityFlush = () => {
      if (document.hidden) flushPendingSync();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityFlush);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityFlush);
    };
  }, []);

  // 패치 노트 트리거: 동기화 완료 + 온보딩 완료 + "돌아온 유저" + 버전 미확인.
  // hasCompletedOnboarding은 로컬 storage 기반이라 sync보다 먼저 hydrate되지만,
  // lastSeenPatchVersion은 클라우드 값이 로컬을 덮어쓸 수 있으므로 syncSettled 후에만 판단한다.
  // cloud sync가 lastSeenPatchVersion을 늦게 내려보내도 이 effect가 재실행돼서 modal을 닫는다.
  const lastSeenPatchVersion = useGameStore((s) => s.progress.lastSeenPatchVersion);
  const hasCompletedOnboarding = useGameStore((s) => s.hasCompletedOnboarding);
  const totalDaysCompleted = useGameStore((s) => s.progress.totalDaysCompleted);
  const completionHistoryLength = useGameStore((s) => s.progress.completionHistory?.length ?? 0);
  const minigameRunsPlayed = useGameStore((s) => s.progress.minigameRunsPlayed);
  const reviewPromptShownAt = useGameStore((s) => s.progress.reviewPromptShownAt);
  // 오늘 완료 수 — 이틀째 완료를 "그날 당일에" 감지하려면 필요하다.
  // completionHistory 는 날짜가 넘어가야 기록되므로 오늘 몫이 빠져 있다.
  const todayCompletedCount = useGameStore((s) => s.daily.completedIds.length);
  // 카드 드로우/선택 진행 중에는 패치 모달을 띄우지 않는다.
  // 선택이 끝나면 isSelectionDone이 true로 바뀌면서 이 effect가 재실행돼 모달을 띄운다.
  const isSelectionDone = useGameStore((s) => {
    const d = s.daily;
    const phase = d.challengePhase || "daily";
    return phase === "daily" ? d.isSelectionComplete
      : phase === "extra" ? d.extraSelectionComplete
      : d.superSelectionComplete;
  });

  useEffect(() => {
    if (!syncSettled) return;
    if (conflict) return; // 병합 충돌 다이얼로그와 겹치지 않게
    if (!hasCompletedOnboarding) return;
    // 카드 드로우/선택 중에는 표시하지 않음 (extra/super phase 진입 시에도 닫힘)
    if (!isSelectionDone) {
      setShowPatchModal(false);
      return;
    }

    // cloud sync가 lastSeenPatchVersion을 최신으로 갱신했으면 modal을 즉시 닫음
    if (lastSeenPatchVersion === LATEST_PATCH.version) {
      setShowPatchModal(false);
      return;
    }

    // "돌아온 유저" 신호: 챌린지 완료/기록/미니게임 플레이 중 하나라도 있어야 함
    const hasActivity =
      (totalDaysCompleted ?? 0) > 0 ||
      completionHistoryLength > 0 ||
      (minigameRunsPlayed ?? 0) > 0;
    if (!hasActivity) return;

    // 기존 인트로/레벨업 모달과 겹치지 않도록 약간의 지연
    const timer = setTimeout(() => setShowPatchModal(true), 300);
    return () => clearTimeout(timer);
  }, [
    syncSettled,
    conflict,
    hasCompletedOnboarding,
    isSelectionDone,
    lastSeenPatchVersion,
    totalDaysCompleted,
    completionHistoryLength,
    minigameRunsPlayed,
  ]);

  const handleClosePatchModal = () => {
    useGameStore.getState().markPatchNotesSeen(LATEST_PATCH.version);
    setShowPatchModal(false);
  };

  // 오늘의 기운 진입 팝업 — 모달 체인의 패치 노트 다음 칸.
  // 패치 노트와 달리 isSelectionDone 은 게이트하지 않는다. 이 팝업의 목적이
  // "카드를 뽑기 전에 오늘의 기운부터 확인" 이라, 선택 완료를 기다리면 정작
  // 앱을 켠 순간(=아직 미드로우)에는 영영 뜨지 않는다.
  // 스플래시는 게이트한다 — 스플래시가 화면을 덮은 채 모달이 뒤에서 뜨면
  // 걷히는 순간 이미 떠 있는 것처럼 보여 등장 연출이 통째로 사라진다.
  const splashActive = useUIStore((s) => s.splashActive);
  const today = useGameStore((s) => s.daily.date);
  const unlockedCardIds = useGameStore((s) => s.progress.unlockedCardIds);

  useEffect(() => {
    if (!syncSettled || conflict || !hasCompletedOnboarding) return;
    if (splashActive) return;
    if (showPatchModal) return; // 패치 노트에 양보 — 닫히면 이 effect 가 재실행된다
    // 세션 1회. 스킵 후 탭을 옮겨 다녀도 다시 뜨지 않는다.
    if (fortunePromptShownThisSession) return;
    if (!today) return;
    // 이미 열었거나(fortune.ts 의 revealedDate) 오늘 이미 물어봤으면 조용히 넘어간다
    if (isFortuneRevealed(today) || wasFortunePromptAsked(today)) return;
    // 광고 진입점이 없는 환경(순수 웹 프로덕션)은 FortuneCard 자체가 숨겨져 있어
    // "지금 열기" 로 보내봐야 빈 화면이다.
    if (!isAdAvailable()) return;
    // 해금 카드가 하나도 없으면 열 것이 없다 — "지금 열기" 로 보내봐야 FortuneCard 는
    // 빈 안내만 띄운다(죽은 CTA 금지). iOS evaluateFortunePrompt 와 같은 판정.
    if (computeDailyFortune(today, readFortuneState().salt, unlockedCardIds) === null) return;

    // 패치 노트(300ms) 뒤, 앱 평가(1200ms) 앞 — 세 모달이 같은 프레임에 겹치지 않게.
    const timer = setTimeout(() => {
      fortunePromptShownThisSession = true;
      setShowFortunePrompt(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [
    syncSettled,
    conflict,
    hasCompletedOnboarding,
    splashActive,
    showPatchModal,
    today,
    unlockedCardIds,
  ]);

  // 어느 경로로 닫히든 "오늘 물어봤음" 을 1회 기록한다 — 광고를 중도 이탈해도
  // 같은 날 팝업이 다시 뜨지 않는다.
  const handleSkipFortunePrompt = () => {
    markFortunePromptAsked(today);
    setShowFortunePrompt(false);
  };

  // "지금 열기" — 광고는 FortuneCard 가 옵트인으로 받는다. 여기서는 자동 열기
  // 신호만 남기고 불꽃 탭으로 보낸다 (계약은 FortunePromptModal 상단 주석 참고).
  const handleConfirmFortunePrompt = () => {
    markFortunePromptAsked(today);
    markFortuneAutoOpen(today);
    setShowFortunePrompt(false);
    router.push("/flame");
  };

  // 앱 평가 요청 — 챌린지를 완료한 서로 다른 날이 2일에 도달하면 1회.
  // 패치노트와 같은 게이트(동기화 완료·온보딩 완료·카드 선택 중 아님)를 쓰되,
  // 두 모달이 겹치지 않도록 패치노트가 떠 있으면 양보한다.
  // 오늘의 기운 팝업도 체인상 앞이라 같이 양보한다 (닫히면 이 effect 가 재실행).
  useEffect(() => {
    if (!syncSettled || conflict || !hasCompletedOnboarding) return;
    if (!isSelectionDone || showPatchModal || showFortunePrompt) return;
    if (reviewPromptShownAt) return;

    const { progress, daily } = useGameStore.getState();
    if (!shouldShowReviewPrompt(progress, daily)) return;

    // 완료 직후 축하 연출과 겹치지 않도록 여유를 둔다(패치노트 300ms 보다 뒤).
    const timer = setTimeout(() => setShowReviewPrompt(true), 1200);
    return () => clearTimeout(timer);
  }, [
    syncSettled,
    conflict,
    hasCompletedOnboarding,
    isSelectionDone,
    showPatchModal,
    showFortunePrompt,
    reviewPromptShownAt,
    completionHistoryLength,
    todayCompletedCount,
  ]);

  // 어느 경로로 닫히든(스토어 이동·피드백 전송·나중에) 여기서 1회 기록한다.
  const handleCloseReviewPrompt = () => {
    useGameStore.getState().markReviewPromptShown();
    setShowReviewPrompt(false);
  };

  // Phase 13 review Critical #3 — `checkDailyReset` 호출 훅 (이전엔 어느 곳에서도
  //   호출 안 됨). 앱을 켜둔 채 자정 (KST 01:00) 넘기면 daily.date 가 어제로 남아
  //   새 드로우 불가. 해결: (a) visibilitychange 시 resume 확인, (b) 60초 주기
  //   poll. 2 패턴 동시 사용 — 백그라운드 탭에서도 접근성.
  // 트랙 2-1: 같은 틱에서 리텐션 정리(월 세이버 리필 + 주간 리포트 백필)도 수행.
  //   순서 고정: checkDailyReset 이 어제 daily 를 completionHistory 로 롤오버한
  //   뒤에 reconcileForToday 가 그 기록으로 리포트를 만든다 (iOS reconcileForToday
  //   내부 순서와 동일).
  useEffect(() => {
    if (!syncSettled) return;
    const tick = () => {
      useGameStore.getState().checkDailyReset();
      useRetentionStore.getState().reconcileForToday();
    };
    tick(); // 즉시 1회 (mount + syncSettled 직후)
    const intervalId = window.setInterval(tick, 60_000);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [syncSettled]);

  const handleChooseLocal = async () => {
    if (!conflict) return;
    // 로컬 선택: retention 도 로컬을 업로드 (미체크인이면 uploadLocalData 가
    // 키를 생략해 클라우드의 iOS retention 을 보존).
    await uploadLocalData(
      conflict.uid,
      conflict.localProgress,
      conflict.localDaily,
      conflict.localRetention,
      localUpHeroPayload(),
    );
    setSyncReady(true);
    await startListener(conflict.uid, applyCloudSnapshot);
    setConflict(null);
    setSyncSettled(true);
  };

  const handleChooseCloud = async () => {
    if (!conflict) return;
    // force=true — 사용자가 MergeConflictDialog 에서 명시적으로 "클라우드" 선택.
    // 로컬이 일부 축에서 앞서더라도 사용자 의도를 우선해 P0 sanity guard 우회.
    useGameStore.getState()._setFromCloud(conflict.cloudProgress, conflict.cloudDaily, { force: true });
    // 클라우드 선택: retention 도 클라우드로 교체. 필드가 없으면 fresh 로 리셋
    // (iOS applyResolveCloud 의 cloudRetention ?? fresh 와 동일).
    useRetentionStore
      .getState()
      ._setFromCloud(conflict.cloudRetention ?? freshRetentionState());
    // Up Hero 는 여기서도 한 방향 규칙을 지킨다 (로컬에 흔적이 없을 때만 채택).
    // 병합 다이얼로그는 챌린지 진행도만 비교해 보여주므로, 유저의 "클라우드" 선택을
    // "이 기기의 코인·인벤토리를 버려도 좋다" 는 동의로 해석하지 않는다.
    adoptCloudUpHero(conflict.cloudUpHero);
    setSyncReady(true);
    await startListener(conflict.uid, applyCloudSnapshot);
    setConflict(null);
    setSyncSettled(true);
  };

  return (
    <>
      {children}
      <AnimatePresence>
        {conflict && (
          <MergeConflictDialog
            localProgress={conflict.localProgress}
            cloudProgress={conflict.cloudProgress}
            onChooseLocal={handleChooseLocal}
            onChooseCloud={handleChooseCloud}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPatchModal && !conflict && (
          <PatchNotesModal patch={LATEST_PATCH} onClose={handleClosePatchModal} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showFortunePrompt && !conflict && !showPatchModal && (
          <FortunePromptModal
            onConfirm={handleConfirmFortunePrompt}
            onSkip={handleSkipFortunePrompt}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showReviewPrompt && !conflict && !showPatchModal && !showFortunePrompt && (
          <ReviewPromptModal onClose={handleCloseReviewPrompt} />
        )}
      </AnimatePresence>
    </>
  );
}
