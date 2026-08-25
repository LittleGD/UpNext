"use client";

/**
 * 트랙 2-3: 웹 계정 영구 삭제 (Google 전용).
 *
 * iOS AuthService.deleteAccount + GameStore.deleteAccount 포팅. 웹은 Google
 * 로그인만 지원하므로 Apple 토큰 철회 단계가 없다. 순서가 핵심:
 *
 *   1) 라이브 sync 정지: 리스너/디바운스 write 가 재인증 왕복 사이에
 *      users/{uid} 를 재생성하는 고아 PII 레이스 차단 (iOS 와 동일)
 *   2) reauthenticateWithPopup: Firebase 는 민감 작업 전 최근 로그인을 요구
 *   3) users/{uid} 삭제: 실패 시 Auth 삭제 전 중단 + 리스너 복구.
 *      Auth 를 먼저 지우면 rules 가 write/delete 를 거부해 고아 문서가 영구 잔존.
 *      듀오 탈퇴보다 먼저 실행 — 여기서 실패해 전체가 중단(data-delete-failed)돼도
 *      "삭제 실패했는데 듀오만 해체된" 파괴적 부수효과가 남지 않는다
 *   4) 듀오 탈퇴 (best-effort): 파트너 문서에 남는 내 PII(닉네임/체크인) 정리.
 *      Auth 삭제 *전*이어야 rules 의 self-leave 인증 요구를 만족한다
 *   5) deleteUser: auth/requires-recent-login 이면 재인증 1회 후 재시도
 *   6) 로컬 전체 소거 + reload (기존 signOut 경로와 동일한 보안 속성)
 *
 * 알려진 갭 (v0.2.0 수용):
 *   - weekly-leaderboard entries 는 현 규칙상 본인 delete 도 별도 경로가 없어
 *     삭제 시도하지 않는다 (iOS 와 동일).
 *   - 같은 계정으로 로그인된 *다른* 클라이언트(두 번째 탭, iOS 기기)의 ID 토큰은
 *     계정 삭제 후에도 만료(최대 1시간)까지 유효하고 rules 는 계정 존재 여부를
 *     검사하지 않으므로, 그쪽의 디바운스 sync 가 merge setDoc 으로 users/{uid} 를
 *     재생성하면 소유자 없는 고아 PII 문서가 잔존할 수 있다. 이 파일의
 *     stopListener 는 현재 탭만 막는다. 근본 해결은 서버측 정리 — Functions 의
 *     auth onDelete 트리거로 users/{uid}(+ 본인 리더보드 entries) 삭제 (후속 권장).
 */

import { getFirebase, isFirebaseConfigured } from "@/lib/firebase";
import { deleteCloudData, setSyncReady, startListener, stopListener } from "@/lib/sync";

export type AccountDeletionResult =
  | { ok: true }
  /**
   * - cancelled: 재인증 팝업을 사용자가 닫음. 아무것도 삭제되지 않음
   * - data-delete-failed: users/{uid} 삭제 실패. Auth 삭제 전에 중단됨
   * - delete-failed: 그 외 (재인증 실패 / deleteUser 실패 / 미로그인 등)
   */
  | { ok: false; reason: "cancelled" | "data-delete-failed" | "delete-failed" };

/** 재인증 팝업 취소 계열 에러 코드 판정 (useAuthStore.mapSignInError 와 동일 계열). */
function isPopupCancelled(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/user-cancelled"
  );
}

/**
 * 실패/취소 시 라이브 sync 원상 복구. SyncProvider 의 applyCloudSnapshot 과 동일한
 * 콜백으로 재시작한다 (iOS GameStore.deleteAccount 실패 분기의 startLiveSync 대응).
 * retention 도 함께 적용해야 복구 후 리스너가 iOS 체크인을 놓치지 않는다
 * (null 은 필드 부재 = 로컬 유지 신호, SyncProvider 와 동일 규약).
 * 4)까지 성공하고 5)에서 실패한 경우 클라우드 문서는 이미 지워졌지만, 로컬이
 * truth 로 남아 다음 로컬 변경 시 syncToCloud 가 문서를 재생성한다 (iOS 동일).
 */
async function restoreLiveSync(uid: string): Promise<void> {
  const [{ useGameStore }, { useRetentionStore }] = await Promise.all([
    import("@/store/useGameStore"),
    import("@/store/useRetentionStore"),
  ]);
  setSyncReady(true);
  await startListener(uid, (progress, daily, retention) => {
    useGameStore.getState()._setFromCloud(progress, daily);
    if (retention) {
      // SyncProvider.shouldAdoptCloudRetention 과 동일한 최신성 가드 (모듈 그래프를
      // 가볍게 유지하려고 인라인 복제): lastCheckInDate 는 계정 단위 단조 증가라
      // 사전순 비교로 충분. 스테일 스냅샷이 더 새로운 로컬 체크인을 되돌리지 않게.
      const localLast = useRetentionStore.getState().retention.lastCheckInDate;
      const adopt =
        localLast === undefined ||
        (retention.lastCheckInDate !== undefined && retention.lastCheckInDate >= localLast);
      if (adopt) {
        useRetentionStore.getState()._setFromCloud(retention);
      }
    }
  });
}

/**
 * 로컬 전체 소거 + 스토어 리셋 + reload.
 * useAuthStore.signOut 의 Phase 11c R4 / Phase 14 시퀀스와 동일: storage 를 먼저
 * 지워 sync upload 트리거를 차단하고, in-memory Zustand 를 명시적으로 리셋해
 * reload 가 실패해도 이전 유저 state 가 UI 에 드러나지 않게 한다.
 */
async function wipeLocalAndReload(): Promise<void> {
  const { clearAllAppStorage } = await import("@/lib/storage");
  const { clearAllPhotoStorage } = await import("@/lib/photoStorage");
  clearAllAppStorage();
  await clearAllPhotoStorage();

  const [gameStoreMod, growthStoreMod, upHeroStoreMod, retentionStoreMod] = await Promise.all([
    import("@/store/useGameStore"),
    import("@/store/useGrowthStore"),
    import("@/store/useUpHeroStore"),
    import("@/store/useRetentionStore"),
  ]);
  gameStoreMod.useGameStore.getState().resetForSignOut();
  growthStoreMod.useGrowthStore.getState().resetForSignOut();
  upHeroStoreMod.useUpHeroStore.getState().resetForSignOut();
  // 트랙 2-1: 불꽃 리텐션 in-memory 도 초기화 (useAuthStore.signOut 과 동일 시퀀스.
  // 듀오는 deleteUser 로 auth 가 null 이 되면 SyncProvider 가 reset() 처리).
  retentionStoreMod.useRetentionStore.getState().resetForSignOut();

  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

/**
 * 계정 영구 삭제 실행. 성공 시 내부에서 reload 하므로 호출부 이후 코드는
 * 실패/취소 경로에서만 실행된다.
 */
export async function deleteAccountWeb(): Promise<AccountDeletionResult> {
  if (!isFirebaseConfigured) return { ok: false, reason: "delete-failed" };

  const { auth, googleProvider } = await getFirebase();
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "delete-failed" };
  const uid = user.uid;

  // 1) 삭제 동안 라이브 sync 정지. stopListener 는 debounce 타이머/pending 을
  //    함께 비우고 currentUid 를 null 로 만들어 syncToCloud 재진입도 차단한다.
  setSyncReady(false);
  stopListener();

  const { reauthenticateWithPopup, deleteUser } = await import("firebase/auth");

  // 2) 재인증. 취소는 "아무 일도 없었음" 으로 처리하고 sync 를 복구한다.
  try {
    await reauthenticateWithPopup(user, googleProvider);
  } catch (error) {
    console.error("Account deletion reauth failed:", error);
    await restoreLiveSync(uid);
    return { ok: false, reason: isPopupCancelled(error) ? "cancelled" : "delete-failed" };
  }

  // 3) users/{uid} 삭제. 실패하면 Auth 삭제 전에 중단 (고아 PII 방지) + 복구.
  //    듀오 탈퇴보다 먼저 — 여기서 실패하면 듀오는 무손상으로 남는다 (실패한
  //    삭제가 "파트너와의 듀오 해체"라는 되돌리기 어려운 부수효과만 남기지 않게).
  try {
    await deleteCloudData(uid);
  } catch (error) {
    console.error("Cloud data deletion failed:", error);
    await restoreLiveSync(uid);
    return { ok: false, reason: "data-delete-failed" };
  }

  // 4) 듀오 탈퇴 (best-effort). Auth 삭제 *전* — 인증된 상태에서만 rules 가
  //    self-leave 를 허용한다. 스토어가 없거나 실패해도 계정 삭제는 진행 (iOS 동일).
  try {
    const duoMod = await import("@/store/useDuoStore");
    await duoMod.useDuoStore?.getState?.().leaveDuoAsync?.();
  } catch (error) {
    console.warn("Duo leave during account deletion failed (best-effort):", error);
  }

  // 5) Auth 계정 삭제. requires-recent-login 이면 재인증 1회 후 재시도.
  try {
    await deleteUser(user);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "auth/requires-recent-login") {
      try {
        await reauthenticateWithPopup(user, googleProvider);
        await deleteUser(user);
      } catch (retryError) {
        console.error("Account deletion retry failed:", retryError);
        await restoreLiveSync(uid);
        return {
          ok: false,
          reason: isPopupCancelled(retryError) ? "cancelled" : "delete-failed",
        };
      }
    } else {
      console.error("Account deletion failed:", error);
      await restoreLiveSync(uid);
      return { ok: false, reason: "delete-failed" };
    }
  }

  // 6) 로컬 소거 + reload. Auth 는 이미 삭제됨: SyncProvider 의
  //    onAuthStateChanged null 분기가 병행 실행돼도 signOut 경로와 동일하게 무해.
  await wipeLocalAndReload();
  return { ok: true };
}
