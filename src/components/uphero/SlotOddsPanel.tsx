"use client";

/**
 * Up Hero — 굴림틀 확률 공개 패널.
 *
 * 굴림틀 이벤트에서 **스핀 전에** 볼 수 있는 작은 정보 표면이다. `ChoicePanel` 이
 * 굴림틀 선택지 위에 "확률 보기" 토글을 두고, 누르면 이 패널이 인라인으로 펼쳐진다.
 * 결과 모달·릴 연출과는 분리돼 있어 도파민 경로를 건드리지 않는다.
 *
 * 왜 있는가: 13+ (Simulated Gambling: Infrequent) 서사와 앱의 정직성 원칙
 * ("공개된 확률이 거짓이 되지 않는다") 은 이 UI 를 전제한다. 그래서 여기 적히는
 * 숫자는 전부 **런타임 계산값** 이다 — `slotOddsRows()` / `slotRtp()` /
 * `SLOT_PITY_THRESHOLD` / `SLOT_DAILY_SPIN_CAP` 를 포맷해 넣고, 문자열에 확률을
 * 하드코딩하지 않는다. 표를 고치면 화면이 따라온다 (테스트가 일치를 고정).
 *
 * 내용 순서: 결과별 확률 표(꽝이 맨 위) → 환수율 → pity 는 표와 별개 규칙이라는
 * 한 줄 → 하루 상한과 오늘 남은 횟수.
 *
 * 디자인: 아지트 GB 팔레트, 보더·아이콘 박스 없음, 에러색 없음. 정보 위계는 작게
 * (typo-micro / typo-caption), 배경은 `GB.dark` 40% 로 선택지 버튼보다 뒤에 앉는다.
 */

import { useId, useState } from "react";
import { GB, GB_HINT, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import PixelIcon from "@/components/icons/PixelIcon";
import type { DictKey } from "@/i18n";
import {
  SLOT_DAILY_SPIN_CAP,
  SLOT_PITY_THRESHOLD,
  formatSlotPercent,
  slotOddsRows,
  slotRtp,
  type SlotOddsRow,
} from "@/lib/upHeroSlot";

/** `useTranslation().t` 와 같은 모양. 테스트가 가짜 t 를 꽂을 수 있게 분리. */
export type SlotOddsT = (key: DictKey, params?: Record<string, string | number>) => string;

/**
 * 표 한 줄의 라벨 — 지급 내용(`SLOT_GRANTS`)에서 유도한다. 결과 모달의 보상 문구
 * (`uphero.slot.reward.*`)와 같은 키를 쓰므로 표와 결과 화면의 이름이 어긋날 수 없다.
 * 꽝만 전용 키(`uphero.slot.odds.blank`).
 */
export function slotOddsLabel(row: SlotOddsRow, t: SlotOddsT): string {
  const g = row.grant;
  switch (g.kind) {
    case "none":
      return t("uphero.slot.odds.blank");
    case "coins":
      return t("uphero.slot.reward.coins", { n: g.amount });
    case "destroyGuards":
      return t("uphero.slot.reward.destroyGuard", { n: g.count });
    case "downGuards":
      return t("uphero.slot.reward.downGuard", { n: g.count });
    case "itemBox":
      return t("uphero.slot.reward.itemBox");
    case "combatBuff":
      return t("uphero.slot.reward.buff", { pct: g.pct, battles: g.battles });
  }
}

interface Props {
  /** 오늘 남은 굴림 횟수 (`slotSpinsLeft(shopDaily)`). 상한과 나란히 보여준다. */
  spinsLeft: number;
}

export default function SlotOddsPanel({ spinsLeft }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const rows = slotOddsRows();

  return (
    <div className="mb-2 pl-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={regionId}
        className="slot-odds-toggle typo-micro inline-flex items-center gap-1 rounded-sm"
        style={{
          // 텍스트 버튼 — 선택지 버튼과 위계가 겹치지 않게 배경·보더 없이 글자만.
          color: open ? GB.lightest : GB.light,
          background: "transparent",
          padding: "4px 6px 4px 0",
          minHeight: 28,
          cursor: "pointer",
          letterSpacing: "0.04em",
          transition: `color 160ms ${EASE_OUT}`,
        }}
      >
        <PixelIcon name="InfoBox" size={12} color={open ? GB.lightest : GB.light} />
        <span>{t(open ? "uphero.slot.odds.close" : "uphero.slot.odds.open")}</span>
      </button>

      {open && (
        <section
          id={regionId}
          aria-label={t("uphero.slot.odds.title")}
          className="mt-1 rounded"
          style={{
            background: `${GB.dark}66`,
            padding: "8px 10px 9px",
          }}
        >
          <div
            className="typo-micro mb-1.5"
            style={{ color: GB.lightest, letterSpacing: "0.06em" }}
          >
            {t("uphero.slot.odds.title")}
          </div>
          <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
            {rows.map((row) => (
              <li
                key={row.id}
                className="typo-micro flex items-baseline justify-between gap-3"
                style={{ color: GB.light }}
              >
                <span>{slotOddsLabel(row, t)}</span>
                <span className="tabular-nums" style={{ color: GB.lightest }}>
                  {formatSlotPercent(row.probability)}
                </span>
              </li>
            ))}
          </ul>
          <div
            className="typo-micro tabular-nums mt-2"
            style={{ color: GB.lightest }}
          >
            {t("uphero.slot.odds.rtp", { pct: formatSlotPercent(slotRtp()) })}
          </div>
          <div className="typo-micro mt-1 leading-relaxed" style={{ color: GB_HINT }}>
            {t("uphero.slot.odds.pityNote", { n: SLOT_PITY_THRESHOLD - 1 })}
          </div>
          <div className="typo-micro tabular-nums mt-1" style={{ color: GB_HINT }}>
            {t("uphero.slot.odds.dailyCap", { n: SLOT_DAILY_SPIN_CAP })}
            {" · "}
            {t("uphero.slot.spinsLeft", { n: spinsLeft })}
          </div>
        </section>
      )}
      <style jsx>{`
        .slot-odds-toggle {
          outline: none;
        }
        .slot-odds-toggle:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
