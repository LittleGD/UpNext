import { describe, it, expect } from "vitest";
import { resolveAdUnitMode } from "./ads";

const PROD_HOST = "up-next-phi.vercel.app";

describe("resolveAdUnitMode", () => {
  it('NEXT_PUBLIC_ADS_ENV="production" 이면 호스트와 무관하게 실광고', () => {
    expect(resolveAdUnitMode("production", PROD_HOST)).toBe("production");
    expect(resolveAdUnitMode("production", "localhost")).toBe("production");
    expect(resolveAdUnitMode("production", undefined)).toBe("production");
  });

  it('NEXT_PUBLIC_ADS_ENV="test" 면 프로덕션 호스트에서도 테스트 광고 (QA 탈출구)', () => {
    expect(resolveAdUnitMode("test", PROD_HOST)).toBe("test");
    expect(resolveAdUnitMode("test", "localhost")).toBe("test");
  });

  it("env 미설정이면 프로덕션 호스트에서만 실광고", () => {
    expect(resolveAdUnitMode(undefined, PROD_HOST)).toBe("production");
  });

  it("env 미설정 + 로컬·프리뷰·SSR 은 전부 테스트 광고", () => {
    const hosts = [
      "localhost",
      "127.0.0.1",
      "up-next-git-feat-fortune-and-rewarded-ads.vercel.app",
      "up-next-phi.vercel.app.example.com",
      "",
      undefined,
    ];
    for (const host of hosts) {
      expect(resolveAdUnitMode(undefined, host)).toBe("test");
    }
  });

  it("알 수 없는 env 값은 오버라이드로 취급하지 않고 호스트 판정으로 떨어진다", () => {
    expect(resolveAdUnitMode("preview", PROD_HOST)).toBe("production");
    expect(resolveAdUnitMode("preview", "localhost")).toBe("test");
  });
});
