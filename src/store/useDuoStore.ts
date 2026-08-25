"use client";

import { create } from "zustand";
import { isFirebaseConfigured, getFirebase } from "@/lib/firebase";
import { getTodayString } from "@/store/useGameStore";
import {
  type DuoSnapshot,
  type DuoWriteSentinels,
  decodeDuo,
  poked,
  makeCode,
  normalizeCode,
  normalizeDisplayName,
  parseUsableInvite,
  buildDuoCreateData,
  buildInviteCreateData,
  buildJoinDuoUpdate,
  buildCheckInUpdate,
  buildNudgeUpdate,
  buildLeaveUpdate,
} from "@/lib/duo";
import type { DictKey } from "@/i18n";
import type { Unsubscribe } from "firebase/firestore";

/**
 * 듀오 불꽃 스토어 — iOS DuoStore.swift 포팅 (Phase: 트랙 2-2).
 *
 * write 형태는 firestore.rules 의 hasOnly/diff 검증에 정확히 맞춘다 (빌더는
 * src/lib/duo.ts 에 분리 — duo.test.ts 골든 테스트와 동일 코드 경로). 거절된
 * write 는 silent 라 형태가 어긋나면 "무반응 버그"로만 나타난다.
 *
 * 배선 (SyncProvider — integration 에이전트 소유):
 *   - 로그인 확정 시 start(uid, displayName), 로그아웃/계정삭제 시 reset()
 *   - useRetentionStore.checkInToday() 성공 시 publishCheckIn(today)
 */

/** 스토어가 노출하는 메시지 — UI 가 t(key, lang, params) 로 렌더 (mapSignInError 패턴). */
export interface DuoMessage {
  key: DictKey;
  params?: Record<string, string | number>;
}

interface DuoState {
  /** 내가 속한 활성 듀오 (솔로 대기 포함). 리스너가 관리. */
  activeDuo: DuoSnapshot | null;
  /** 내가 만든 초대코드 — 대기 상태 UI 표시용. */
  inviteCode: string | null;
  isWorking: boolean;
  message: DuoMessage | null;
  /** 친구가 오늘 나를 콕 찔렀을 때 1회 true — 받는 쪽 배너 트리거. */
  friendNudgedMe: boolean;

  /** 로그인 확정 시 호출 — displayName 은 trim + 40자 캡 + "UpNext" 폴백. */
  start: (uid: string, displayName: string | null | undefined) => void;
  /** 로그아웃/계정삭제 시 호출 — 리스너 해제 + 전체 상태 초기화. */
  reset: () => void;
  createInvite: () => Promise<void>;
  joinInvite: (rawCode: string) => Promise<void>;
  leaveDuo: () => Promise<void>;
  /** 계정 삭제 플로우 전용 awaitable leave — best-effort, 실패해도 throw 하지 않음. */
  leaveDuoAsync: () => Promise<void>;
  /** 리텐션 체크인 성공 시 듀오 문서에 발행 (fire-and-forget). */
  publishCheckIn: (date: string) => void;
  /** 친구 콕 찌르기 — 당일 1회 쿨다운, 낙관적 적용 + 실패 롤백. */
  nudge: () => Promise<void>;
  /** 받는 쪽 배너 확인(닫기) — 같은 찌르기로 재노출되지 않게. */
  acknowledgeNudge: () => void;
  /** 메시지 소비 후 클리어 (토스트 dismiss 용). */
  clearMessage: () => void;
}

// --- 모듈 프라이빗 상태 (sync.ts 패턴) ---

let currentUid: string | null = null;
let currentDisplayName: string = "UpNext";
let unsubscribeDuo: Unsubscribe | null = null;
/**
 * 리스너 첫 스냅샷 워밍업 플래그. 앱 시작/리스너 재부착 직후 첫 콜백은 배너를
 * 띄우지 않게 한다 — 안 그러면 친구가 이전에 찌른 상태가 재시작마다 배너로 뜬다.
 */
let duoWarmedUp = false;
/** 비동기 attach 중 reset/재시작 감지용 세대 카운터 — stale 리스너 부착 방지. */
let listenGeneration = 0;
/** 초대코드 복구 원샷 쿼리를 이미 시도한 duo id — 스냅샷마다 재조회하지 않게. */
let inviteRecoveryTriedForDuoId: string | null = null;

// Firestore 모듈 캐시 (동적 import 1회만 — sync.ts 와 동일 패턴)
let _firestoreMod: typeof import("firebase/firestore") | null = null;
async function getFirestoreMod() {
  if (!_firestoreMod) {
    _firestoreMod = await import("firebase/firestore");
  }
  return _firestoreMod;
}

function stopDuoListener(): void {
  if (unsubscribeDuo) {
    unsubscribeDuo();
    unsubscribeDuo = null;
  }
}

/**
 * 에러 → error.code 추출 (useAuthStore.mapSignInError 패턴).
 * 메시지 보간엔 code 만 노출 — localizedDescription 성격의 장문 메시지는 콘솔로.
 */
function errorCode(context: string, error: unknown): string {
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message;
  console.error(`[duo] ${context} failed:`, code, message, error);
  return code || "unknown";
}

export const useDuoStore = create<DuoState>((set, get) => {
  /** array-contains 쿼리 limit 1 리스너 — iOS observeActiveDuo 포팅. */
  async function observeActiveDuo(): Promise<void> {
    const uid = currentUid;
    if (!uid || !isFirebaseConfigured) return;
    const gen = ++listenGeneration;
    stopDuoListener();
    duoWarmedUp = false;

    const { db } = await getFirebase();
    const { collection, query, where, limit, onSnapshot } = await getFirestoreMod();
    // 동적 import 대기 중 reset()/start() 가 다시 불렸으면 stale attach 포기.
    if (gen !== listenGeneration || currentUid !== uid) return;

    const q = query(
      collection(db, "duos"),
      where("memberIds", "array-contains", uid),
      limit(1),
    );
    unsubscribeDuo = onSnapshot(
      q,
      (snapshot) => {
        if (gen !== listenGeneration) return;
        const docSnap = snapshot.docs[0];
        if (!docSnap) {
          // 빈 스냅샷은 duoWarmedUp 을 건드리지 않는다 (iOS 동일) — 오프라인 캐시가
          // 빈 결과를 먼저 emit 한 뒤 서버 스냅샷이 도착하는 시퀀스도 워밍업으로 취급해
          // 재시작 직후 이월 nudge 로 배너가 오발되지 않게 한다.
          set({ activeDuo: null });
          return;
        }
        const next = decodeDuo(docSnap.id, docSnap.data());
        detectIncomingNudge(get().activeDuo, next);
        set({ activeDuo: next });
        // 대기(1인) 상태인데 초대코드가 메모리에 없으면(페이지 새로고침) 원샷
        // 조회로 복구 — 코드 없인 친구에게 보낼 방법이 없다. duo 당 1회만 시도.
        if (
          next.memberIds.length === 1 &&
          !get().inviteCode &&
          inviteRecoveryTriedForDuoId !== next.id
        ) {
          inviteRecoveryTriedForDuoId = next.id;
          void recoverInviteCode(next.id);
        }
      },
      (error) => {
        // 에러 옵저버 필수 — 리스너 실패(예: rules 미배포 permission-denied, 인덱스
        // 누락)는 구독을 조용히 종료시킨다. 로그 없이는 "무반응 버그"로만 보인다.
        if (gen !== listenGeneration) return;
        set({
          message: {
            // 사전 미등록 신규 키 — i18n 전담 에이전트가 4개국어 반영 예정 (보고됨).
            key: "flame.duo.msg.observeFailed",
            params: { error: errorCode("observeActiveDuo", error) },
          },
        });
      },
    );
  }

  /**
   * 대기 상태 초대코드 복구 — inviteCode 는 메모리 전용이라 새로고침 후 소실된다
   * (iOS 도 @Published 메모리지만 웹은 리로드가 훨씬 잦다). rules 는 duoInvites
   * read 를 signedIn() 에 허용하므로, 내가 만든 open 초대를 원샷 조회한다.
   * 등호 조건만 쓰는 쿼리라 복합 인덱스가 필요 없다. best-effort — 실패는 로그만.
   */
  async function recoverInviteCode(duoId: string): Promise<void> {
    const uid = currentUid;
    if (!uid || !isFirebaseConfigured) return;
    try {
      const { db } = await getFirebase();
      const { collection, query, where, limit, getDocs } = await getFirestoreMod();
      const q = query(
        collection(db, "duoInvites"),
        where("duoId", "==", duoId),
        where("createdBy", "==", uid),
        where("status", "==", "open"),
        limit(1),
      );
      const snap = await getDocs(q);
      const docSnap = snap.docs[0];
      // 만료 재검증 포함 — 만료된 코드를 보여주면 친구의 참여가 조용히 실패한다.
      if (!docSnap || !parseUsableInvite(docSnap.data(), Date.now())) return;
      // 조회 중 상태 변화(참여 완료/떠남/재생성) 감지 — stale 코드 세팅 방지.
      const duo = get().activeDuo;
      if (!duo || duo.id !== duoId || duo.memberIds.length !== 1) return;
      if (get().inviteCode) return;
      // rules 가 doc id == code 를 강제하므로 id 가 곧 초대코드다.
      set({ inviteCode: docSnap.id });
    } catch (error) {
      errorCode("recoverInviteCode", error);
    }
  }

  /**
   * 친구가 나를 콕 찔렀는지 — nudges[friend] 에 오늘 날짜가 false→true 로 바뀐
   * 전이일 때만 배너 1회. 첫 스냅샷(duoWarmedUp == false)은 무시해 재시작마다 뜨지 않게.
   */
  function detectIncomingNudge(previous: DuoSnapshot | null, next: DuoSnapshot): void {
    const warmed = duoWarmedUp;
    duoWarmedUp = true;
    if (!warmed || !currentUid) return;
    if (next.memberIds.length !== 2) return;
    const friend = next.memberIds.find((id) => id !== currentUid);
    if (!friend) return;
    const today = getTodayString();
    const was = previous ? poked(previous, friend, today) : false;
    if (poked(next, friend, today) && !was) {
      set({ friendNudgedMe: true });
    }
  }

  /** activeDuo.nudges[본인] 에 day 를 더하거나(add) 빼서(rollback) 로컬 즉시 반영. */
  function applyLocalNudge(uid: string, day: string, add: boolean): void {
    const duo = get().activeDuo;
    if (!duo) return;
    const arr = duo.nudges[uid] ?? [];
    if (add && arr.includes(day)) return;
    const nextArr = add ? [...arr, day] : arr.filter((d) => d !== day);
    set({ activeDuo: { ...duo, nudges: { ...duo.nudges, [uid]: nextArr } } });
  }

  return {
    activeDuo: null,
    inviteCode: null,
    isWorking: false,
    message: null,
    friendNudgedMe: false,

    start: (uid, displayName) => {
      currentUid = uid;
      currentDisplayName = normalizeDisplayName(displayName);
      void observeActiveDuo();
    },

    reset: () => {
      listenGeneration += 1;
      stopDuoListener();
      currentUid = null;
      currentDisplayName = "UpNext";
      duoWarmedUp = false;
      inviteRecoveryTriedForDuoId = null;
      set({
        activeDuo: null,
        inviteCode: null,
        isWorking: false,
        message: null,
        friendNudgedMe: false,
      });
    },

    createInvite: async () => {
      if (get().activeDuo || get().isWorking) return;
      // 익명 상태의 조용한 무반응을 방어적으로 표면화 (iOS 와 동일 — UI 로그인
      // 게이트가 선차단하지만 직접 호출 방어).
      if (!currentUid) {
        set({ message: { key: "flame.duo.msg.loginRequired" } });
        return;
      }
      if (!isFirebaseConfigured) return;
      const uid = currentUid;
      set({ isWorking: true, message: null });
      try {
        const { db } = await getFirebase();
        const { collection, doc, writeBatch } = await getFirestoreMod();
        const code = makeCode();
        const duoRef = doc(collection(db, "duos")); // auto id
        const inviteRef = doc(db, "duoInvites", code); // doc id == code (rules 검증)
        const now = Date.now();
        const batch = writeBatch(db);
        batch.set(duoRef, buildDuoCreateData(uid, currentDisplayName, now));
        batch.set(inviteRef, buildInviteCreateData(code, duoRef.id, uid, now));
        await batch.commit();
        set({ inviteCode: code, message: { key: "flame.duo.msg.inviteReady" } });
        void observeActiveDuo();
      } catch (error) {
        set({
          message: {
            key: "flame.duo.msg.createFailed",
            params: { error: errorCode("createInvite", error) },
          },
        });
      } finally {
        set({ isWorking: false });
      }
    },

    joinInvite: async (rawCode) => {
      if (get().activeDuo || get().isWorking) return;
      if (!currentUid) {
        set({ message: { key: "flame.duo.msg.loginRequired" } });
        return;
      }
      const code = normalizeCode(rawCode);
      if (code.length < 4) return;
      if (!isFirebaseConfigured) return;
      const uid = currentUid;
      const displayName = currentDisplayName;
      set({ isWorking: true, message: null });
      try {
        const { db } = await getFirebase();
        const { doc, getDoc, runTransaction } = await getFirestoreMod();
        const inviteRef = doc(db, "duoInvites", code);

        let inviteData: Record<string, unknown> | undefined;
        try {
          const snapshot = await getDoc(inviteRef);
          inviteData = snapshot.data();
        } catch (error) {
          set({
            message: {
              key: "flame.duo.msg.lookupFailed",
              params: { error: errorCode("joinInvite lookup", error) },
            },
          });
          return;
        }

        const invite = parseUsableInvite(inviteData, Date.now());
        if (!invite) {
          set({ message: { key: "flame.duo.msg.invalidCode" } });
          return;
        }

        const duoRef = doc(db, "duos", invite.duoId);
        try {
          // 트랜잭션 — memberIds < 2 확인 + 자기 키만 추가 + invite "joined" 전환.
          // 두 사람이 같은 코드로 동시에 join 해도 한 명만 성공한다.
          await runTransaction(db, async (tx) => {
            const duoDoc = await tx.get(duoRef);
            const data = duoDoc.data() ?? {};
            const memberIds = Array.isArray(data.memberIds)
              ? (data.memberIds as unknown[]).filter((v): v is string => typeof v === "string")
              : [];
            if (memberIds.length >= 2 && !memberIds.includes(uid)) {
              // iOS 의 NSError(code: 409) 대응 — errorCode() 가 집는 code 필드 부여.
              const full = new Error("duo already has two members") as Error & { code: string };
              full.code = "duo/full";
              throw full;
            }
            tx.update(duoRef, buildJoinDuoUpdate(data, uid, displayName, Date.now()));
            tx.update(inviteRef, { status: "joined" });
          });
        } catch (error) {
          set({
            message: {
              key: "flame.duo.msg.joinFailed",
              params: { error: errorCode("joinInvite", error) },
            },
          });
          return;
        }

        set({ inviteCode: null, message: { key: "flame.duo.msg.started" } });
        void observeActiveDuo();
      } finally {
        set({ isWorking: false });
      }
    },

    leaveDuo: async () => {
      const duo = get().activeDuo;
      if (!currentUid || !duo || get().isWorking) return;
      const uid = currentUid;
      set({ isWorking: true });
      try {
        const { db } = await getFirebase();
        const { doc, updateDoc, arrayUnion, arrayRemove, deleteField } = await getFirestoreMod();
        const sentinels: DuoWriteSentinels = { arrayUnion, arrayRemove, deleteField };
        await updateDoc(doc(db, "duos", duo.id), buildLeaveUpdate(uid, Date.now(), sentinels));
      } catch (error) {
        // iOS 콜백형 leaveDuo 는 에러를 표면화하지 않음 — 콘솔 로그만 동일하게.
        errorCode("leaveDuo", error);
      } finally {
        set({ isWorking: false, activeDuo: null, inviteCode: null });
      }
    },

    leaveDuoAsync: async () => {
      // 계정 삭제 플로우 전용 — Auth 레코드 삭제 *전*에 완료를 보장해야 파트너
      // 문서에서 내 PII(표시이름·체크인·nudge)가 확실히 제거된다. best-effort —
      // 실패해도 계정 삭제 자체는 진행 (users/{uid} 문서는 별도로 삭제됨).
      if (!currentUid || !isFirebaseConfigured) return;
      const uid = currentUid;
      try {
        const { db } = await getFirebase();
        const {
          doc, updateDoc, arrayUnion, arrayRemove, deleteField,
          collection, query, where, limit, getDocs,
        } = await getFirestoreMod();
        // in-memory activeDuo 는 리스너 워밍업 전(로그인 직후 즉시 삭제)이거나
        // 오프라인 캐시가 빈 스냅샷을 먼저 emit 한 동안 null 일 수 있다. 그대로
        // 포기하면 듀오 탈퇴가 스킵된 채 Auth 가 삭제되고, rules 상 delete 불가 +
        // self-leave 인증 필요라 파트너 문서에 내 PII 가 영구 잔존한다.
        // 원샷 조회로 보강한다 (여전히 best-effort).
        let duoId = get().activeDuo?.id ?? null;
        if (!duoId) {
          const snap = await getDocs(
            query(collection(db, "duos"), where("memberIds", "array-contains", uid), limit(1)),
          );
          duoId = snap.docs[0]?.id ?? null;
        }
        if (duoId) {
          const sentinels: DuoWriteSentinels = { arrayUnion, arrayRemove, deleteField };
          await updateDoc(doc(db, "duos", duoId), buildLeaveUpdate(uid, Date.now(), sentinels));
        }
      } catch (error) {
        errorCode("leaveDuoAsync", error);
      }
      set({ activeDuo: null, inviteCode: null });
    },

    publishCheckIn: (date) => {
      const duo = get().activeDuo;
      if (!currentUid || !duo || !isFirebaseConfigured) return;
      const uid = currentUid;
      const duoId = duo.id;
      // fire-and-forget (iOS 동일) — arrayUnion 이라 재시도/중복 발행에도 안전.
      void (async () => {
        try {
          const { db } = await getFirebase();
          const { doc, updateDoc, arrayUnion, arrayRemove, deleteField } = await getFirestoreMod();
          const sentinels: DuoWriteSentinels = { arrayUnion, arrayRemove, deleteField };
          await updateDoc(
            doc(db, "duos", duoId),
            buildCheckInUpdate(uid, date, Date.now(), sentinels),
          );
        } catch (error) {
          errorCode("publishCheckIn", error);
        }
      })();
    },

    nudge: async () => {
      const duo = get().activeDuo;
      if (!currentUid || !duo || duo.memberIds.length !== 2) return;
      const uid = currentUid;
      const today = getTodayString();
      // 하루 1회 쿨다운 — 로컬 플래그가 아니라 서버 nudges 배열 기준 (재시작 일관).
      if (poked(duo, uid, today)) return;
      // 낙관적 로컬 반영 — 서버 왕복을 기다리지 않고 버튼이 즉시 "콕 찔렀어요"로.
      // 성공 시 리스너가 동일 값(arrayUnion)을 echo 하므로 깜빡임/불일치 없음.
      applyLocalNudge(uid, today, true);
      try {
        const { db } = await getFirebase();
        const { doc, updateDoc, arrayUnion, arrayRemove, deleteField } = await getFirestoreMod();
        const sentinels: DuoWriteSentinels = { arrayUnion, arrayRemove, deleteField };
        await updateDoc(doc(db, "duos", duo.id), buildNudgeUpdate(uid, today, Date.now(), sentinels));
      } catch (error) {
        // 실패(예: rules 미배포 → permission-denied)를 표면화 + 낙관값 롤백.
        errorCode("nudge", error);
        set({ message: { key: "flame.duo.msg.nudgeFailed" } });
        applyLocalNudge(uid, today, false);
      }
    },

    acknowledgeNudge: () => {
      set({ friendNudgedMe: false });
    },

    clearMessage: () => {
      set({ message: null });
    },
  };
});
