import { describe, it, expect } from "vitest";
import {
  type DuoSnapshot,
  type DuoWriteSentinels,
  DUO_CODE_ALPHABET,
  DUO_INVITE_TTL_MS,
  checkedIn,
  poked,
  sharedDays,
  jointStreak,
  addDays,
  makeCode,
  normalizeCode,
  normalizeDisplayName,
  parseUsableInvite,
  millisValue,
  decodeDuo,
  buildDuoCreateData,
  buildInviteCreateData,
  buildJoinDuoUpdate,
  buildCheckInUpdate,
  buildNudgeUpdate,
  buildLeaveUpdate,
} from "./duo";

/**
 * 트랙 2-2 — 듀오 순수 헬퍼 + write 페이로드 골든 테스트.
 *
 * 골든 테스트의 기준은 firestore.rules 의 hasOnly/diff 검증 (duos·duoInvites).
 * 거절된 write 는 silent 라 페이로드 형태가 어긋나면 "무반응 버그"로만 나타난다 —
 * 여기서 키 목록을 rules 와 문자 그대로 대조해 회귀를 막는다.
 */

// firestore.rules 의 허용 키 목록 (rules 파일과 문자 그대로 일치해야 함)
const DUO_CREATE_ALLOWED = ["memberIds", "memberNames", "checkIns", "createdAt", "updatedAt"];
const DUO_UPDATE_ALLOWED = ["memberIds", "memberNames", "checkIns", "nudges", "createdAt", "updatedAt"];
const INVITE_ALLOWED = ["code", "duoId", "createdBy", "createdAt", "expiresAt", "status"];

// dot-path 업데이트 키의 최상위 세그먼트 ("checkIns.uid1" → "checkIns")
function topSegments(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).map((k) => k.split(".")[0]);
}

// 테스트용 fake 센티널 — 스토어는 실제 firestore 모듈의 arrayUnion 등을 주입
const sentinels: DuoWriteSentinels = {
  arrayUnion: (...values) => ({ __op: "arrayUnion", values }),
  arrayRemove: (...values) => ({ __op: "arrayRemove", values }),
  deleteField: () => ({ __op: "deleteField" }),
};

function makeDuo(partial: Partial<DuoSnapshot>): DuoSnapshot {
  return {
    id: "duo1",
    memberIds: ["me", "friend"],
    memberNames: { me: "나", friend: "친구" },
    checkIns: { me: [], friend: [] },
    nudges: {},
    createdAt: 1_700_000_000_000,
    ...partial,
  };
}

describe("addDays", () => {
  it("하루 전/후 기본 산술", () => {
    expect(addDays("2026-08-24", -1)).toBe("2026-08-23");
    expect(addDays("2026-08-24", 1)).toBe("2026-08-25");
  });

  it("월/연도 경계", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("윤년 2월 29일", () => {
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
  });

  it("파싱 불가 입력은 null", () => {
    expect(addDays("not-a-date", 1)).toBeNull();
    expect(addDays("2026/08/24", 1)).toBeNull();
    expect(addDays("", -1)).toBeNull();
  });
});

describe("checkedIn / poked", () => {
  const duo = makeDuo({
    checkIns: { me: ["2026-08-23"], friend: [] },
    nudges: { friend: ["2026-08-24"] },
  });

  it("checkIns 배열 기준 판정", () => {
    expect(checkedIn(duo, "me", "2026-08-23")).toBe(true);
    expect(checkedIn(duo, "me", "2026-08-24")).toBe(false);
    expect(checkedIn(duo, "unknown", "2026-08-23")).toBe(false);
  });

  it("nudges 배열 기준 판정 — 키 없는 uid 는 false", () => {
    expect(poked(duo, "friend", "2026-08-24")).toBe(true);
    expect(poked(duo, "me", "2026-08-24")).toBe(false);
  });
});

describe("sharedDays", () => {
  it("두 멤버 교집합을 정렬해 반환", () => {
    const duo = makeDuo({
      checkIns: {
        me: ["2026-08-24", "2026-08-22", "2026-08-20"],
        friend: ["2026-08-22", "2026-08-24", "2026-08-21"],
      },
    });
    expect(sharedDays(duo, "me")).toEqual(["2026-08-22", "2026-08-24"]);
  });

  it("솔로(2인 미만)면 빈 배열", () => {
    const duo = makeDuo({ memberIds: ["me"], checkIns: { me: ["2026-08-24"] } });
    expect(sharedDays(duo, "me")).toEqual([]);
  });
});

describe("jointStreak — 오늘부터 역산", () => {
  const today = "2026-08-24";

  it("연속 공동 체크인 일수", () => {
    const duo = makeDuo({
      checkIns: {
        me: ["2026-08-22", "2026-08-23", "2026-08-24"],
        friend: ["2026-08-22", "2026-08-23", "2026-08-24"],
      },
    });
    expect(jointStreak(duo, "me", today)).toBe(3);
  });

  it("오늘이 공동이 아니면 0 (어제까지 이어졌어도)", () => {
    const duo = makeDuo({
      checkIns: {
        me: ["2026-08-22", "2026-08-23"],
        friend: ["2026-08-22", "2026-08-23"],
      },
    });
    expect(jointStreak(duo, "me", today)).toBe(0);
  });

  it("중간 공백에서 역산 중단", () => {
    const duo = makeDuo({
      checkIns: {
        me: ["2026-08-20", "2026-08-21", "2026-08-23", "2026-08-24"],
        friend: ["2026-08-20", "2026-08-21", "2026-08-23", "2026-08-24"],
      },
    });
    // 24, 23 은 연속 — 22 가 비어 20/21 은 세지 않음
    expect(jointStreak(duo, "me", today)).toBe(2);
  });
});

describe("makeCode", () => {
  it("6자 + rules 패턴 ^[A-Z2-9]{6}$ + 혼동문자(I/O/0/1) 미포함", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = makeCode();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(code).not.toMatch(/[IO01]/);
      for (const ch of code) {
        expect(DUO_CODE_ALPHABET).toContain(ch);
      }
    }
  });
});

describe("normalizeCode", () => {
  it("양끝 공백 제거 + 대문자화", () => {
    expect(normalizeCode("  abcd23\n")).toBe("ABCD23");
    expect(normalizeCode("Xy2Z9A")).toBe("XY2Z9A");
  });
});

describe("normalizeDisplayName", () => {
  it("trim + 빈 값은 UpNext 폴백", () => {
    expect(normalizeDisplayName("  지민  ")).toBe("지민");
    expect(normalizeDisplayName("   ")).toBe("UpNext");
    expect(normalizeDisplayName(null)).toBe("UpNext");
    expect(normalizeDisplayName(undefined)).toBe("UpNext");
  });

  it("40자 캡 — rules memberNames[uid].size() <= 40 과 일치", () => {
    expect(normalizeDisplayName("a".repeat(60))).toBe("a".repeat(40));
    expect(normalizeDisplayName("a".repeat(40))).toBe("a".repeat(40));
  });

  it("코드포인트 단위 캡 — 서로게이트 쌍(이모지)이 반 토막 나지 않음", () => {
    const name = "🔥".repeat(41);
    const capped = normalizeDisplayName(name);
    expect(Array.from(capped).length).toBe(40);
    // 잘린 결과가 깨진 서로게이트를 포함하지 않아야 함
    expect(capped).toBe("🔥".repeat(40));
  });
});

describe("parseUsableInvite", () => {
  const now = 1_700_000_000_000;
  const base = {
    code: "ABC234",
    duoId: "duo1",
    createdBy: "me",
    createdAt: now - 1000,
    expiresAt: now + 1000,
    status: "open",
  };

  it("open + 미만료 + duoId 존재 → duoId 반환", () => {
    expect(parseUsableInvite(base, now)).toEqual({ duoId: "duo1" });
  });

  it("문서 없음 → null", () => {
    expect(parseUsableInvite(undefined, now)).toBeNull();
  });

  it("만료(expiresAt <= now) → null", () => {
    expect(parseUsableInvite({ ...base, expiresAt: now }, now)).toBeNull();
    expect(parseUsableInvite({ ...base, expiresAt: now - 1 }, now)).toBeNull();
  });

  it("joined/closed 상태 → null", () => {
    expect(parseUsableInvite({ ...base, status: "joined" }, now)).toBeNull();
    expect(parseUsableInvite({ ...base, status: "closed" }, now)).toBeNull();
  });

  it("duoId 누락/비문자열 → null", () => {
    expect(parseUsableInvite({ ...base, duoId: undefined }, now)).toBeNull();
    expect(parseUsableInvite({ ...base, duoId: 42 }, now)).toBeNull();
  });

  it("expiresAt double(소수) 관용 수용 — iOS millisValue 미러", () => {
    expect(parseUsableInvite({ ...base, expiresAt: now + 1000.7 }, now)).toEqual({
      duoId: "duo1",
    });
  });
});

describe("millisValue", () => {
  it("유한 number 만 통과, 소수는 trunc", () => {
    expect(millisValue(1700000000000)).toBe(1700000000000);
    expect(millisValue(1700000000000.9)).toBe(1700000000000);
    expect(millisValue("1700")).toBeNull();
    expect(millisValue(NaN)).toBeNull();
    expect(millisValue(Infinity)).toBeNull();
    expect(millisValue(null)).toBeNull();
  });
});

describe("decodeDuo — 관용 디코드", () => {
  it("정상 문서 디코드", () => {
    const snap = decodeDuo("duo1", {
      memberIds: ["me", "friend"],
      memberNames: { me: "나", friend: "친구" },
      checkIns: { me: ["2026-08-24"], friend: [] },
      nudges: { me: ["2026-08-24"] },
      createdAt: 1_700_000_000_000,
    });
    expect(snap.id).toBe("duo1");
    expect(snap.memberIds).toEqual(["me", "friend"]);
    expect(snap.checkIns.me).toEqual(["2026-08-24"]);
    expect(snap.nudges.me).toEqual(["2026-08-24"]);
    expect(snap.createdAt).toBe(1_700_000_000_000);
  });

  it("필드 누락/손상은 해당 필드만 기본값으로 강등", () => {
    const snap = decodeDuo("duo1", {
      memberIds: ["me", 42, null],
      memberNames: "corrupted",
      checkIns: { me: ["2026-08-24", 7], friend: "bad" },
      // nudges 누락 (구 문서 — nudges 도입 전)
      createdAt: "not-a-number",
    });
    expect(snap.memberIds).toEqual(["me"]);
    expect(snap.memberNames).toEqual({});
    expect(snap.checkIns).toEqual({ me: ["2026-08-24"] });
    expect(snap.nudges).toEqual({});
    expect(snap.createdAt).toBe(0);
  });
});

// --- write 페이로드 골든 테스트 (rules hasOnly 대비) ---

describe("buildDuoCreateData — rules duos create 분기", () => {
  const data = buildDuoCreateData("me", "나", 1_700_000_000_000);

  it("hasOnly([memberIds, memberNames, checkIns, createdAt, updatedAt]) — nudges 키 없음", () => {
    expect(Object.keys(data).sort()).toEqual([...DUO_CREATE_ALLOWED].sort());
    expect("nudges" in data).toBe(false);
  });

  it("memberIds 는 [본인] 단독, memberNames/checkIns 는 본인 키만", () => {
    expect(data.memberIds).toEqual(["me"]);
    expect(data.memberNames).toEqual({ me: "나" });
    expect(data.checkIns).toEqual({ me: [] });
  });

  it("createdAt/updatedAt 은 int (millis)", () => {
    expect(data.createdAt).toBe(1_700_000_000_000);
    expect(data.updatedAt).toBe(1_700_000_000_000);
  });
});

describe("buildInviteCreateData — rules duoInvites create 분기", () => {
  const now = 1_700_000_000_000;
  const data = buildInviteCreateData("ABC234", "duo1", "me", now);

  it("hasOnly([code, duoId, createdBy, createdAt, expiresAt, status])", () => {
    expect(Object.keys(data).sort()).toEqual([...INVITE_ALLOWED].sort());
  });

  it("code == doc id 용 값, createdBy == 본인, status == open", () => {
    expect(data.code).toBe("ABC234");
    expect(data.duoId).toBe("duo1");
    expect(data.createdBy).toBe("me");
    expect(data.status).toBe("open");
  });

  it("expiresAt = createdAt + 72h > createdAt", () => {
    expect(data.expiresAt).toBe(now + DUO_INVITE_TTL_MS);
    expect(data.expiresAt as number).toBeGreaterThan(data.createdAt as number);
    expect(DUO_INVITE_TTL_MS).toBe(72 * 60 * 60 * 1000);
  });
});

describe("buildJoinDuoUpdate — rules update A 분기 (솔로→듀오)", () => {
  const existing = {
    memberIds: ["owner"],
    memberNames: { owner: "주인" },
    checkIns: { owner: ["2026-08-23"] },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
  const update = buildJoinDuoUpdate(existing, "me", "나", 1_700_000_100_000);

  it("허용 키만 사용 + nudges 는 건드리지 않음 (diff 빈 맵 통과)", () => {
    for (const key of Object.keys(update)) {
      expect(DUO_UPDATE_ALLOWED).toContain(key);
    }
    expect("nudges" in update).toBe(false);
    expect("createdAt" in update).toBe(false); // createdAt 불변 — 페이로드에 미포함
  });

  it("기존 멤버 보존 + 본인만 추가 (size 1 → 2)", () => {
    expect(update.memberIds).toEqual(["owner", "me"]);
  });

  it("memberNames/checkIns diff 는 본인 키만 — 파트너 값 그대로", () => {
    expect(update.memberNames).toEqual({ owner: "주인", me: "나" });
    expect(update.checkIns).toEqual({ owner: ["2026-08-23"], me: [] });
  });

  it("이미 멤버면 중복 추가 없음 (트랜잭션 재실행 멱등)", () => {
    const again = buildJoinDuoUpdate(
      { ...existing, memberIds: ["owner", "me"], checkIns: { owner: [], me: ["2026-08-24"] } },
      "me",
      "나",
      1,
    );
    expect(again.memberIds).toEqual(["owner", "me"]);
    expect(again.checkIns).toEqual({ owner: [], me: ["2026-08-24"] }); // 기존 체크인 보존
  });
});

describe("buildCheckInUpdate — rules update B 분기 (본인 키만)", () => {
  const update = buildCheckInUpdate("me", "2026-08-24", 1_700_000_000_000, sentinels);

  it("dot-path 로 checkIns.본인 + updatedAt 만 변경", () => {
    expect(Object.keys(update).sort()).toEqual(["checkIns.me", "updatedAt"]);
    for (const seg of topSegments(update)) {
      expect(DUO_UPDATE_ALLOWED).toContain(seg);
    }
  });

  it("arrayUnion 센티널로 atomic 병합 (read-modify-write 금지)", () => {
    expect(update["checkIns.me"]).toEqual({ __op: "arrayUnion", values: ["2026-08-24"] });
    expect(update.updatedAt).toBe(1_700_000_000_000);
  });
});

describe("buildNudgeUpdate — rules nudges diff hasOnly([본인])", () => {
  const update = buildNudgeUpdate("me", "2026-08-24", 1_700_000_000_000, sentinels);

  it("dot-path 로 nudges.본인 + updatedAt 만 변경", () => {
    expect(Object.keys(update).sort()).toEqual(["nudges.me", "updatedAt"]);
    for (const seg of topSegments(update)) {
      expect(DUO_UPDATE_ALLOWED).toContain(seg);
    }
  });

  it("arrayUnion 센티널 — 당일 중복 발행에도 안전", () => {
    expect(update["nudges.me"]).toEqual({ __op: "arrayUnion", values: ["2026-08-24"] });
  });
});

describe("buildLeaveUpdate — rules update C 분기 (self leave)", () => {
  const update = buildLeaveUpdate("me", 1_700_000_000_000, sentinels);

  it("memberIds arrayRemove(본인) + 본인 키 3종 deleteField + updatedAt", () => {
    expect(Object.keys(update).sort()).toEqual([
      "checkIns.me",
      "memberIds",
      "memberNames.me",
      "nudges.me",
      "updatedAt",
    ]);
    for (const seg of topSegments(update)) {
      expect(DUO_UPDATE_ALLOWED).toContain(seg);
    }
  });

  it("파트너 키는 어떤 형태로도 등장하지 않음", () => {
    expect(update.memberIds).toEqual({ __op: "arrayRemove", values: ["me"] });
    expect(update["memberNames.me"]).toEqual({ __op: "deleteField" });
    expect(update["checkIns.me"]).toEqual({ __op: "deleteField" });
    expect(update["nudges.me"]).toEqual({ __op: "deleteField" });
    const dotKeys = Object.keys(update).filter((k) => k.includes("."));
    for (const k of dotKeys) {
      expect(k.endsWith(".me")).toBe(true);
    }
  });
});
