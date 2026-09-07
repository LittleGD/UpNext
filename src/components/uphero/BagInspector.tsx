"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Equipment, Hero } from "@/types/uphero";
import type { DictKey } from "@/i18n";
import { useTranslation } from "@/hooks/useTranslation";
import { useModalA11y } from "@/hooks/useModalA11y";
import { affixStatLabel, categoryLabel, equipmentNameById } from "@/lib/upHeroI18n";
import { BAG_STAT_KEYS, equipmentChange, suggestBagPlacement, type BagStats } from "@/lib/bagInsights";
import { BAG_COLS, BAG_HERO_CELL, anchorAt, computeBagSynergy, footprint, shapeFor, isPhotoTalisman, normalizeBagLayout, type BagPlacement } from "@/lib/upHeroBag";
import { GB, GB_ENEMY } from "@/lib/upHeroPalette";
import { SLOT_LABEL_KEY } from "@/lib/equipmentSlotMeta";
import { TALISMAN_SKILLS } from "@/lib/talismanSkills";
import { skillName, skillDesc } from "@/lib/upHeroI18n";

interface Props {
  item: Equipment | null;
  worn: boolean;
  equipped: Hero["equipped"];
  inventory: Equipment[];
  rows: number;
  onEquip: () => void;
  onUnequip: () => void;
  onMove: () => void;
  onPlace: (p: BagPlacement) => void;
}

export default function BagInspector(props: Props) {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const { item, worn } = props;
  return <>
    <button type="button" onClick={() => setOpen(true)} data-testid="bag-inspector"
      className="shrink-0 text-left px-3 py-2 w-full"
      style={{ minHeight: 88, background: `${GB.dark}66`, border: "none", color: GB.light }}>
      <span className="typo-caption block" style={{ color: GB.lightest }}>
        {item ? equipmentNameById(item.baseId ?? "", item.name, language) : t("uphero.bag.inspect.guide")}
        {item && (item.enhanceLevel ?? 0) > 0 && ` +${item.enhanceLevel}`}
      </span>
      <span className="typo-caption block">
        {item ? `${t(worn ? "uphero.bag.inspect.worn" : "uphero.bag.inspect.stats")} · ${formatStats(item.stats, language) || t("uphero.bag.inspect.noStats")}` : t("uphero.bag.inspect.idle")}
      </span>
      {item && <span className="typo-micro block underline">{t("uphero.bag.inspect.detail")} · {t("uphero.bag.inspect.rules")}</span>}
    </button>
    {open && <InspectorSheet {...props} onClose={() => setOpen(false)} />}
  </>;
}

function formatStats(stats: BagStats, language: ReturnType<typeof useTranslation>["language"]): string {
  return BAG_STAT_KEYS.filter(k => stats[k]).map(k => `${affixStatLabel(k, language)} ${(stats[k] ?? 0) > 0 ? "+" : ""}${stats[k]}${k === "crit" ? "%p" : ""}`).join("  ·  ");
}

function InspectorSheet({ item, worn, equipped, inventory, rows, onClose, onEquip, onUnequip, onMove, onPlace }: Props & { onClose: () => void }) {
  const { t, language } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(ref, onClose);
  const copy = (key: string) => t(`uphero.bag.inspect.${key}` as DictKey);
  const synergy = useMemo(() => computeBagSynergy(equipped, inventory, rows), [equipped, inventory, rows]);
  const change = item ? equipmentChange(item, worn, equipped, inventory, rows) : null;
  const suggestion = useMemo(() => item && !worn ? suggestBagPlacement(item, equipped, inventory, rows) : null, [item, worn, equipped, inventory, rows]);
  const links = synergy.links.filter(l => l.rule !== "S6" && (worn ? l.anchor === item?.type : l.sourceId === item?.id));
  const slots = [...new Set(links.flatMap(l => l.anchor ? [l.anchor] : []))];
  const rules = !item || worn ? ["s1", "s2", "s3", "s4"] : isPhotoTalisman(item) ? ["s4"] : ["s1", ...(item.type === "accessory" ? ["s2"] : item.type === "talisman" ? ["s3"] : [])];
  const act = (fn: () => void) => { onClose(); fn(); };
  const buttonStyle = { minHeight: 52, padding: "10px 16px", border: "none", borderRadius: 12, background: GB.lightest, color: GB.darkest };

  return createPortal(<div ref={ref} role="dialog" aria-modal="true" aria-label={copy(item ? "detail" : "guide")}
    className="fixed inset-0 z-[60] flex flex-col" style={{ background: GB.darkest, color: "#e2ecd9", paddingTop: "max(env(safe-area-inset-top), 12px)", paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
    <header className="px-4 flex items-center justify-between shrink-0">
      <h2 className="typo-body">{copy(item ? "detail" : "guide")}</h2>
      <button type="button" onClick={onClose} className="typo-caption" style={{ ...buttonStyle, background: "transparent", color: GB.lightest }}>{copy("close")}</button>
    </header>
    <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-5">
      {item && <section className="space-y-2">
        <h3 className="typo-heading" style={{ color: GB.lightest }}>{equipmentNameById(item.baseId ?? "", item.name, language)}{(item.enhanceLevel ?? 0) > 0 ? ` +${item.enhanceLevel}` : ""}</h3>
        <p className="typo-caption">{categoryLabel(item.category, language)} · {t(SLOT_LABEL_KEY[item.type])} · {t(`rarity.${item.rarity}` as DictKey)}</p>
        <p className="typo-caption">{copy(worn ? "worn" : normalizeBagLayout(inventory, rows).layout.statusById[item.id] === "placed" ? "carried" : "waiting")}</p>
        <h4 className="typo-body">{copy("stats")}</h4>
        <p className="typo-caption">{t(shapeFor(item.type, item.bagRot ?? 0).length === 4 ? "uphero.bag.shape.2x2" : item.type === "weapon" ? (item.bagRot ?? 0) % 2 ? "uphero.bag.shape.2x1" : "uphero.bag.shape.1x2" : "uphero.bag.shape.1x1")}</p>
        <p className="typo-caption" style={{ color: GB.light }}>{copy("statsIncluded")}</p>
        {BAG_STAT_KEYS.filter(k => item.stats[k]).map(k => <div key={k} className="typo-body flex justify-between py-1"><span>{affixStatLabel(k, language)} <small>{k === "slotBonus" ? "SLOT" : k.toUpperCase()}</small></span><span>{(item.stats[k] ?? 0) > 0 ? "+" : ""}{item.stats[k]}{k === "crit" ? "%p" : ""}</span></div>)}
        {item.talismanSkills?.map(id => { const skill = TALISMAN_SKILLS[id]; return skill ? <p key={id} className="typo-caption">{skillName(id, skill.name, language)}: {skillDesc(id, skill.description, language)}</p> : null; })}
        <p className="typo-caption" style={{ color: GB.light }}>{copy("statMeaning")}</p>
        <p className="typo-caption" style={{ color: GB.light }}>{copy("statSkills")}</p>
      </section>}
      <p className="typo-caption leading-relaxed" style={{ color: GB.light }}>{copy("roles")}</p>
      {item && change && <section className="space-y-2 p-3 rounded-xl" style={{ background: `${GB.dark}88` }}>
        <h3 className="typo-body">{copy(worn ? "compareUnequip" : "compareEquip")}</h3>
        <StatsDelta stats={change.delta} />
        <p className="typo-caption">{copy("compareNote")}</p>
        <button type="button" className="typo-body w-full" style={buttonStyle} onClick={() => act(worn ? onUnequip : onEquip)}>{t(worn ? "common.unequip" : "uphero.equip.action.equip")}</button>
        {!worn && <button type="button" className="typo-caption w-full" style={{ ...buttonStyle, background: GB.dark, color: GB.lightest }} onClick={() => act(onMove)}>{copy("move")}</button>}
      </section>}
      {item && <section className="space-y-2">
        <h3 className="typo-body">{copy("connections")}</h3>
        {!slots.length ? <p className="typo-caption">{copy("noConnections")}</p> : <>
          <p className="typo-caption" style={{ color: GB.light }}>{copy("anchorTotal")}</p>
          {slots.map(slot => <p key={slot} className="typo-caption">{t(SLOT_LABEL_KEY[slot])}: {formatStats(synergy.perAnchor[slot], language)}<br />{[...new Set(links.filter(l => l.anchor === slot).map(l => l.rule.toLowerCase()))].map(rule => copy(`${rule}title`)).join(" · ")}</p>)}
        </>}
      </section>}
      {item && !worn && <section className="space-y-3">
        <h3 className="typo-body">{copy("suggest")}</h3>
        {suggestion ? <>
          <p className="typo-caption">{copy("suggestion")}</p>
          <StatsDelta stats={suggestion.delta} />
          <PlacementMap item={item} p={suggestion.placement} inventory={inventory} rows={rows} />
          <button type="button" className="typo-body w-full" style={buttonStyle} onClick={() => act(() => onPlace(suggestion.placement))}>{copy("apply")}</button>
        </> : <p className="typo-caption">{copy("noSuggestion")}</p>}
      </section>}
      <section className="space-y-4">
        <h3 className="typo-body">{copy("rules")}</h3>
        {rules.map(rule => <div key={rule} className="space-y-1"><h4 className="typo-body" style={{ color: GB.lightest }}>{copy(`${rule}title`)}</h4><p className="typo-caption leading-relaxed">{copy(`${rule}body`)}</p></div>)}
        <p className="typo-caption" style={{ color: GB.light }}>{copy("synth")}</p>
      </section>
    </div>
  </div>, document.body);
}

function StatsDelta({ stats }: { stats: BagStats }) {
  const { t, language } = useTranslation();
  return <div className="typo-body flex flex-wrap gap-3">{Object.keys(stats).length ? BAG_STAT_KEYS.filter(k => stats[k]).map(k => <span key={k} style={{ color: (stats[k] ?? 0) < 0 ? GB_ENEMY : GB.lightest }}>{formatStats({ [k]: stats[k] }, language)}</span>) : t("uphero.bag.inspect.noChange")}</div>;
}

function PlacementMap({ item, p, inventory, rows }: { item: Equipment; p: BagPlacement; inventory: Equipment[]; rows: number }) {
  const { t } = useTranslation();
  const cells = footprint(item.type, p.x, p.y, p.rot);
  const layout = normalizeBagLayout(inventory.filter(i => i.id !== item.id), rows).layout;
  return <div role="img" aria-label={t("uphero.bag.inspect.suggestion")} style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, maxWidth: 250, marginInline: "auto" }}>
    {Array.from({ length: rows * BAG_COLS }, (_, i) => { const x = i % BAG_COLS, y = rows - 1 - Math.floor(i / BAG_COLS); const hot = cells.some(c => c.x === x && c.y === y); const slot = anchorAt(x, y); const occupied = layout.occupancy[y * BAG_COLS + x]; return <span key={i} className="typo-micro flex items-center justify-center" style={{ aspectRatio: "1", borderRadius: 4, color: hot ? GB.darkest : GB.light, background: hot ? GB.lightest : occupied ? GB.dark : `${GB.dark}44` }}>{hot ? "+" : slot ? t(SLOT_LABEL_KEY[slot]) : x === BAG_HERO_CELL.x && y === BAG_HERO_CELL.y ? "●" : occupied ? "·" : ""}</span>; })}
  </div>;
}
