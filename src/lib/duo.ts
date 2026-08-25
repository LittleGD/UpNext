// 듀오 불꽃 순수 헬퍼 — iOS DuoStore.swift(DuoSnapshot) + RetentionSectionView.jointStreak 포팅.
// Firestore 접근이 없는 로직만 모아 vitest 로 검증 가능하게 분리한다.
// write 페이로드 빌더는 firestore.rules 의 hasOnly/diff 검증(duos·duoInvites)과
// 바이트 단위로 맞아야 한다 — 거절된 write 는 silent 라 형태가 곧 스펙이다.

/** Firestore duos/{duoId} 문서의 관용 디코드 결과. iOS DuoSnapshot 미러. */
export interface DuoSnapshot {
  id: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  checkIns: Record<string, string[]>;
  nudges: Record<string, string[]>;
  createdAt: number;
}

// 초대코드 알파벳 — 혼동 문자(I/O/0/1) 제외 32자. rules 의 ^[A-Z2-9]{6}$ 와 일치.
export const DUO_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DUO_CODE_LENGTH = 6;
// 초대 유효기간 72시간 (iOS createInvite 와 동일).
export const DUO_INVITE_TTL_MS = 72 * 60 * 60 * 1000;
// rules memberNames[uid].size() <= 40 과 일치 — 초과 시 silent 거절되므로 선캡.
export const DUO_NAME_MAX = 40;
export const DUO_NAME_FALLBACK = "UpNext";

// --- 관용 디코드 헬퍼 (iOS 의 as? 캐스트 + 기본값 패턴) ---

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function toStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function toStringArrayMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(value)) {
    if (Array.isArray(v)) out[k] = v.filter((d): d is string => typeof d === "string");
  }
  return out;
}

/** iOS millisValue — Int/Int64/Double 관용 수용. 웹에선 유한 number 만 통과. */
export function millisValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  return null;
}

/** duos/{duoId} 문서 관용 디코드 — 필드 손상 시 해당 필드만 기본값으로 강등. */
export function decodeDuo(id: string, data: Record<string, unknown>): DuoSnapshot {
  return {
    id,
    memberIds: toStringArray(data.memberIds),
    memberNames: toStringMap(data.memberNames),
    checkIns: toStringArrayMap(data.checkIns),
    nudges: toStringArrayMap(data.nudges),
    createdAt: millisValue(data.createdAt) ?? 0,
  };
}

// --- 스냅샷 조회 (iOS DuoSnapshot 메서드) ---

/** uid 가 day 에 체크인했는지. */
export function checkedIn(duo: DuoSnapshot, uid: string, day: string): boolean {
  return (duo.checkIns[uid] ?? []).includes(day);
}

/**
 * uid 가 day 에 콕 찌르기를 보냈는지. 쿨다운/배너 판정의 단일 근거 —
 * 로컬 플래그가 아니라 서버 nudges 배열을 보므로 앱 재시작에도 일관.
 */
export function poked(duo: DuoSnapshot, uid: string, day: string): boolean {
  return (duo.nudges[uid] ?? []).includes(day);
}

/** 두 멤버가 모두 체크인한 날짜의 정렬 목록. 듀오 미완성(2인 미만)이면 빈 배열. */
export function sharedDays(duo: DuoSnapshot, currentUid: string): string[] {
  if (duo.memberIds.length !== 2) return [];
  const other = duo.memberIds.find((id) => id !== currentUid) ?? "";
  const mine = new Set(duo.checkIns[currentUid] ?? []);
  const theirs = new Set(duo.checkIns[other] ?? []);
  return [...mine].filter((d) => theirs.has(d)).sort();
}

/**
 * "함께 N일째" — 오늘부터 역산해 연속으로 함께 켠 날 수.
 * iOS RetentionSectionView.jointStreak 포팅: 오늘이 shared 가 아니면 0.
 */
export function jointStreak(duo: DuoSnapshot, currentUid: string, today: string): number {
  const shared = new Set(sharedDays(duo, currentUid));
  let n = 0;
  let d: string | null = today;
  while (d !== null && shared.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

/**
 * "yyyy-MM-dd" 문자열 날짜 산술 — UTC 기반이라 DST/타임존과 무관하게 순수.
 * 파싱 불가 입력은 null (iOS RetentionEngine.addDays 의 optional 반환 미러).
 */
export function addDays(day: string, value: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(base + value * 86_400_000);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

// --- 초대코드 ---

/** 6자 초대코드 생성 — rules 의 doc id 패턴 ^[A-Z2-9]{6}$ 를 만족. */
export function makeCode(): string {
  let code = "";
  for (let i = 0; i < DUO_CODE_LENGTH; i += 1) {
    code += DUO_CODE_ALPHABET[Math.floor(Math.random() * DUO_CODE_ALPHABET.length)];
  }
  return code;
}

/** 입력 코드 정규화 — 양끝 공백 제거 + 대문자화 (iOS joinInvite 와 동일). */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * 초대 문서 유효성 검사 — open 상태 + duoId 존재 + 미만료일 때만 duoId 반환.
 * 문서 없음/만료/joined·closed 는 모두 null (= "유효하지 않은 초대코드").
 */
export function parseUsableInvite(
  data: Record<string, unknown> | undefined,
  now: number,
): { duoId: string } | null {
  if (!data) return null;
  if (data.status !== "open") return null;
  const duoId = typeof data.duoId === "string" ? data.duoId : null;
  const expiresAt = millisValue(data.expiresAt);
  if (!duoId || expiresAt === null || expiresAt <= now) return null;
  return { duoId };
}

/**
 * 표시이름 정규화 — trim 후 빈 값이면 "UpNext" 폴백, 40자 캡.
 * rules 의 memberNames[uid].size() ∈ (0, 40] 검증과 일치. 서로게이트 쌍(이모지)이
 * 잘려 깨지지 않게 코드포인트 단위로 자른다 (Swift prefix(40) 대응).
 */
export function normalizeDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (trimmed.length === 0) return DUO_NAME_FALLBACK;
  return Array.from(trimmed).slice(0, DUO_NAME_MAX).join("");
}

// --- write 페이로드 빌더 ---
// 스토어와 골든 테스트가 같은 빌더를 쓰므로 "테스트 통과 = 실제 write 형태 보장".
// FieldValue 센티널(arrayUnion 등)은 Firestore 모듈에 붙어 있어 순수 모듈에서
// 직접 만들 수 없다 — 주입받아 키 구조만 여기서 고정한다.

/** Firestore FieldValue 센티널 주입 타입 — 테스트에선 fake, 스토어에선 실물. */
export interface DuoWriteSentinels {
  arrayUnion: (...values: unknown[]) => unknown;
  arrayRemove: (...values: unknown[]) => unknown;
  deleteField: () => unknown;
}

/**
 * duos create 페이로드 — rules create 분기와 일치:
 * hasOnly([memberIds, memberNames, checkIns, createdAt, updatedAt]) — nudges 키 금지,
 * memberIds 는 [본인 uid] 단독, memberNames/checkIns 는 본인 키만.
 */
export function buildDuoCreateData(
  uid: string,
  displayName: string,
  now: number,
): Record<string, unknown> {
  return {
    memberIds: [uid],
    memberNames: { [uid]: displayName },
    checkIns: { [uid]: [] },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * duoInvites create 페이로드 — rules 와 일치:
 * hasOnly([code, duoId, createdBy, createdAt, expiresAt, status]),
 * code == doc id, expiresAt > createdAt (72h), status == "open".
 */
export function buildInviteCreateData(
  code: string,
  duoId: string,
  uid: string,
  now: number,
): Record<string, unknown> {
  return {
    code,
    duoId,
    createdBy: uid,
    createdAt: now,
    expiresAt: now + DUO_INVITE_TTL_MS,
    status: "open",
  };
}

/**
 * join 트랜잭션의 duo update 페이로드 — rules update A 분기(솔로→듀오)와 일치:
 * 기존 멤버 보존 + 본인만 추가, checkIns/memberNames diff 는 본인 키만,
 * nudges 는 건드리지 않음 (diff 빈 맵 → hasOnly 자동 통과).
 */
export function buildJoinDuoUpdate(
  existing: Record<string, unknown>,
  uid: string,
  displayName: string,
  now: number,
): Record<string, unknown> {
  const memberIds = toStringArray(existing.memberIds);
  if (!memberIds.includes(uid)) memberIds.push(uid);
  const memberNames = { ...toStringMap(existing.memberNames), [uid]: displayName };
  const checkIns = toStringArrayMap(existing.checkIns);
  if (!checkIns[uid]) checkIns[uid] = [];
  return { memberIds, memberNames, checkIns, updatedAt: now };
}

/**
 * 체크인 발행 페이로드 — dot-path + arrayUnion 으로 본인 키만 atomic 병합.
 * read-modify-write 는 파트너 동시 체크인과 race (iOS 주석 참조) — 금지.
 */
export function buildCheckInUpdate(
  uid: string,
  date: string,
  now: number,
  s: DuoWriteSentinels,
): Record<string, unknown> {
  return {
    [`checkIns.${uid}`]: s.arrayUnion(date),
    updatedAt: now,
  };
}

/** 콕 찌르기 페이로드 — 체크인과 동일한 race-free dot-path + arrayUnion. */
export function buildNudgeUpdate(
  uid: string,
  day: string,
  now: number,
  s: DuoWriteSentinels,
): Record<string, unknown> {
  return {
    [`nudges.${uid}`]: s.arrayUnion(day),
    updatedAt: now,
  };
}

/**
 * leave 페이로드 — rules update C 분기(self leave)와 일치:
 * arrayRemove 로 본인만 제외 + 본인 키(deleteField) 청소. 파트너 데이터 불변.
 * 서버측 atomic 이라 두 명이 동시에 나가도 부분 결과 race 없음.
 */
export function buildLeaveUpdate(
  uid: string,
  now: number,
  s: DuoWriteSentinels,
): Record<string, unknown> {
  return {
    memberIds: s.arrayRemove(uid),
    [`memberNames.${uid}`]: s.deleteField(),
    [`checkIns.${uid}`]: s.deleteField(),
    [`nudges.${uid}`]: s.deleteField(),
    updatedAt: now,
  };
}
