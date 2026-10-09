"use client";

import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MoveRight } from "lucide-react";
import { usePixelSnap } from "./pixel-snap";
import { longPress } from "./long-press";
import { charNameParts, fmt1, fmtCardDate, fmtInt, parseSlot, todayIso } from "@/lib/showcase/format";
import { CharacterTags } from "@/components/showcase/element-icon";
import {
  CHAR_COLORS,
  EXTRA_COLOR,
  charDamageShare,
  characterGear,
  extraDamageOrNull,
  extraDamagePercent,
  extraDamageShare,
  extraRecalcOn,
  extraScaleVisible,
  rotationArrows,
  sortedCharacters,
  teamDisplayName,
  teamDisplayDpr,
  teamDisplayDps,
} from "@/lib/showcase/display";
import type { TeamBlock } from "@/lib/showcase/types";
import { TeamMenu } from "./team-menu";

interface TeamCardProps {
  team: TeamBlock;
  highlight?: boolean;
  source?: string;
  favorite?: boolean;
  favSrc?: string;
  favAddedAt?: number;
  selected?: boolean;
  onToggleFavorite?: (team: TeamBlock) => void;
  onToggleSelect?: (team: TeamBlock) => void;
  onEdit?: (team: TeamBlock) => void;
  onDelete?: (team: TeamBlock) => void;
  multiSelect?: boolean;
  onExport?: (team: TeamBlock) => void;
  exportStatic?: CardExportStatic;
}

export interface CardExportStatic {
  footerLeft: string;
  footerRight: string;
  showFooter: boolean;
  dispEl: boolean;
  dispRar: boolean;
  dispDps: boolean;
  dispTeam: boolean;
}

export const TeamCard = memo(function TeamCard({
  team,
  highlight,
  source,
  favorite = false,
  favSrc,
  favAddedAt,
  selected = false,
  onToggleFavorite,
  onToggleSelect,
  onEdit,
  onDelete,
  multiSelect = false,
  onExport,
  exportStatic,
}: TeamCardProps) {
  const [slotOpen, setSlotOpen] = useState(false);
  const slotRootRef = useRef<HTMLDivElement | null>(null);
  const slotBadgeRef = useRef<HTMLSpanElement | null>(null);
  const slotPanelRef = useRef<HTMLDivElement | null>(null);
  usePixelSnap(slotPanelRef, slotOpen);
  useEffect(() => {
    if (!slotOpen) return;
    const onDoc = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (slotPanelRef.current?.contains(t)) return;
      if (slotBadgeRef.current?.contains(t)) return;
      setSlotOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSlotOpen(false);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [slotOpen]);
  const [slotUp, setSlotUp] = useState(true);
  useLayoutEffect(() => {
    if (!slotOpen) {
      setSlotUp(true);
      return;
    }
    const el = slotPanelRef.current;
    const anchor = slotRootRef.current;
    if (!el || !anchor) return;
    const h = el.offsetHeight;
    const ar = anchor.getBoundingClientRect();
    const sec = document.querySelector<HTMLElement>('section[aria-label="Поиск"]');
    const limit = Math.max(8, sec ? sec.getBoundingClientRect().bottom + 4 : 8);
    const vh = document.documentElement.clientHeight;
    const upOk = ar.top - h - 4 >= limit;
    const downOk = ar.bottom + h + 4 <= vh - 8;
    setSlotUp(upOk || !downOk);
  }, [slotOpen]);
  const slot = parseSlot(team.slot);
  const slotTip: ReactNode = !slot
    ? "—"
    : favSrc != null
      ? (
          <>
            • {`Ряд ${slot.row}, колонка ${slot.col}.`}
            {team.range ? ` Диапазон ${team.range}.` : ""}
            <br />• {`В избранном. Источник: «${favSrc}».`}
          </>
        )
      : `Ряд ${slot.row}, колонка ${slot.col}.` +
        (team.range ? ` Диапазон ${team.range}.` : "") +
        (favorite ? " В избранном." : "");
  const chars = sortedCharacters(team);
  const extra = extraDamageOrNull(team);
  const scaleOn = extraScaleVisible(team);
  const recalcOn = extraRecalcOn(team);
  const displayName = teamDisplayName(team);
  const hideTeam = exportStatic ? !exportStatic.dispTeam : false;

  const slotHold = longPress(
    onToggleFavorite && !favorite ? () => onToggleFavorite(team) : undefined,
  );

  return (
    <article
      onClick={
        multiSelect && onToggleSelect
          ? (e) => {
              if (
                e.target instanceof Element &&
                e.target.closest(
                  'button, [role="button"], [role="menuitem"], [role="dialog"], a, input, .team-menu',
                )
              )
                return;
              onToggleSelect(team);
            }
          : undefined
      }
      className={
        "flex flex-col rounded-xl border bg-gradient-to-b from-[#24304a] to-[#1d2739] p-4 sm:p-5 " +
        (selected
          ? "border-dashed border-[#cd890b] transition-colors hover:border-[#f1a10d]"
          : highlight
            ? "border-[#a68b5c]"
            : "border-[#2f3d59] transition-colors hover:border-[#a68b5c]")
      }
      aria-label={`Команда ${displayName || "без названия"}`}
    >
      {!hideTeam && (
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] leading-[21px] font-semibold text-[#d3bc8e] sm:text-base sm:leading-[22px]">
          {displayName || "—"}
        </h2>
        {!exportStatic && (
        <div className="flex shrink-0 items-center gap-2 sm:-mr-1">
          <div ref={slotRootRef} className="relative shrink-0">
              <span
                ref={slotBadgeRef}
                tabIndex={0}
                role="button"
                aria-label={`Слот ${team.slot}: подробности`}
                aria-haspopup="dialog"
                aria-expanded={slotOpen}
                onClick={() => setSlotOpen((o) => !o)}
                {...slotHold}
                className={
                  "inline-block cursor-pointer rounded-md border px-2 py-1 text-[11px] leading-[16px] whitespace-nowrap text-[#9aa5b8] transition-colors select-none [-webkit-touch-callout:none] [touch-action:pan-y_pinch-zoom] " +
                  (favorite
                    ? "border-[#3d624e] hover:border-[#4a765f] hover:text-[#d8d3c8]"
                    : "border-[#2f3d59] hover:border-[#435680] hover:text-[#e8e2d5]")
                }
              >
                {team.slot}
              </span>
              {slotOpen && (
                <div
                  ref={slotPanelRef}
                  role="dialog"
                  aria-label={`Слот ${team.slot}: подробности`}
                  className={
                    "absolute right-0 z-50 w-max max-w-[calc(100vw-2rem)] rounded-md border border-[#2f3d59] bg-[#1d2739] p-3 text-left text-xs leading-relaxed text-[#e8e2d5] shadow-md animate-in fade-in animation-duration-150 will-change-transform " +
                    (slotUp ? "bottom-full mb-1 slide-in-from-bottom-2" : "top-full mt-1 slide-in-from-top-2")
                  }
                >
                  {slotTip}
                </div>
              )}
          </div>
          <TeamMenu
            team={team}
            favorite={favorite}
            favAddedAt={favAddedAt}
            selected={selected}
            onToggleFavorite={onToggleFavorite}
            onToggleSelect={onToggleSelect}
            onEdit={onEdit}
            onDelete={onDelete}
            onExport={onExport}
          />
        </div>
        )}
      </header>
      )}

      <ul className="mb-2.5 grid grid-cols-[1fr_max-content] gap-x-3">
        {chars.map((c, i) => {
          const color = CHAR_COLORS[i % CHAR_COLORS.length];
          const share = charDamageShare(team, c);
          const gear = characterGear(c);
          const { cons, base } = charNameParts(c);
          return (
            <li
              key={c.name}
              className={
                "col-span-2 grid grid-cols-subgrid py-2 leading-[17px] [grid-template-rows:auto_9px_6px_8px_auto] " +
                (i === 0 && hideTeam ? "" : "border-t border-black/25 ")
              }
            >
              <div className="col-start-1 row-start-1 flex h-[13px] min-w-0 items-center">
                <span
                  aria-hidden
                  className="mr-2 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                {cons && (
                  <span className="mr-2 shrink-0 text-[11.5px] leading-none text-[#d3bc8e]">{cons}</span>
                )}
                <span className="min-w-0 truncate text-[13px] font-semibold leading-none text-[#e8e2d5]">
                  {base}
                </span>
                <CharacterTags
                  c={c}
                  className="ml-1.5"
                  forceEl={exportStatic?.dispEl}
                  forceRar={exportStatic?.dispRar}
                />
              </div>
              <div className="col-start-1 row-start-3 h-1.5 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full"
                  style={{ width: `${Math.min(100, share).toFixed(1)}%`, background: color }}
                />
              </div>
              {gear && (
                <div className="col-start-1 row-start-5 text-[11px] text-[#9aa5b8]">{gear}</div>
              )}
              <div className="col-start-2 row-start-3 flex items-center justify-end tabular-nums">
                <span className="-translate-y-[0.75px] text-[13px] font-semibold leading-none text-[#e8e2d5]">
                  {fmtInt(c.damage)}
                </span>
              </div>
              <div className="col-start-2 row-start-5 text-right tabular-nums text-[11px] text-[#9aa5b8]">
                {share.toFixed(1)}%{c.field_time_s != null ? ` · ${fmt1(c.field_time_s)}с` : ""}
              </div>
            </li>
          );
        })}
        {extra && (
          <li
            className={
              "col-span-2 grid grid-cols-subgrid border-t border-black/25 py-2 leading-[17px] " +
              (scaleOn
                ? "[grid-template-rows:auto_9px_6px_8px_auto]"
                : "[grid-template-rows:auto_6px_auto]")
            }
          >
            <div className="col-start-1 row-start-1 flex h-[13px] min-w-0 items-center">
              <span
                aria-hidden
                className="mr-2 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: EXTRA_COLOR }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-none text-[#e8e2d5]">
                {extra.name}
              </span>
            </div>
            {scaleOn ? (
              <>
                <div className="col-start-1 row-start-3 h-1.5 overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, extraDamageShare(team)).toFixed(1)}%`,
                      background: EXTRA_COLOR,
                    }}
                  />
                </div>
                <div className="col-start-2 row-start-3 flex items-center justify-end tabular-nums">
                  <span className="-translate-y-[0.75px] text-[13px] font-semibold leading-none text-[#e8e2d5]">
                    {fmtInt(extra.damage)}
                  </span>
                </div>
              </>
            ) : (
              <div className="col-start-2 row-start-1 flex h-[13px] items-center justify-end tabular-nums">
                <span className="text-[13px] font-semibold leading-none text-[#e8e2d5]">
                  {fmtInt(extra.damage)}
                </span>
              </div>
            )}
            {extra.note && (
              <div
                className={
                  "col-start-1 text-[11px] text-[#9aa5b8] " +
                  (scaleOn ? "row-start-5" : "row-start-3")
                }
              >
                {extra.note}
              </div>
            )}
            <div
              className={
                "col-start-2 text-right tabular-nums text-[11px] text-[#9aa5b8] " +
                (scaleOn ? "row-start-5" : "row-start-3")
              }
            >
              {(() => {
                const pct = extraDamagePercent(team);
                return pct != null ? `${pct.toFixed(1)}%` : "";
              })()}
            </div>
          </li>
        )}
      </ul>

      {(!exportStatic || exportStatic.dispDps) && (
      <div className="team-dps-row mb-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-x-2.5 text-[14px] leading-[19px] text-[#9aa5b8]">
        <span className="justify-self-end">
          DPS <span className="text-[#d3bc8e]">·</span>{" "}
          <b className="font-semibold text-[#e8e2d5] tabular-nums">{fmtInt(teamDisplayDps(team))}</b>
        </span>
        <span aria-hidden className="w-px self-stretch bg-[#2f3d59]" />
        <span className="justify-self-start">
          <b className="font-semibold text-[#e8e2d5] tabular-nums">{fmtInt(teamDisplayDpr(team))}</b>{" "}
          <span className="text-[#d3bc8e]">·</span> DPR
        </span>
      </div>
      )}

      <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-black/30" aria-hidden>
        {chars.map((c, i) => (
          <div
            key={c.name}
            style={{
              width: `${charDamageShare(team, c).toFixed(2)}%`,
              background: CHAR_COLORS[i % CHAR_COLORS.length],
            }}
          />
        ))}
        {extra && recalcOn && (
          <div
            style={{
              width: `${extraDamageShare(team).toFixed(2)}%`,
              background: EXTRA_COLOR,
            }}
          />
        )}
      </div>

      {team.rotation && (
        <div className="team-rotation whitespace-pre-line rounded-lg px-3 py-2 text-[12.5px] leading-[20px] text-[#e8e2d5]">
          <span className="mb-1 block text-[10.5px] leading-[16px] tracking-wider text-[#d3bc8e] uppercase">
            Ротация · {fmt1(team.rotation_time_s)}
            <span className="lowercase">с</span>
          </span>
          {rotationArrows(team.rotation)
            .split(" → ")
            .filter(Boolean)
            .map((w, i) => (
              <Fragment key={i}>
                {i > 0 && (
                  <MoveRight
                    className="mx-1 inline-block h-3.5 w-3.5 align-[-2.5px]"
                    aria-hidden
                  />
                )}
                {w}
              </Fragment>
            ))}
        </div>
      )}

      {team.extra_info && (
        <div className="mt-3 border-t border-dashed border-[#2f3d59] pt-2">
          <p className="text-[11.5px] leading-[19px] whitespace-pre-line text-[#9aa5b8]">
            {team.extra_info}
          </p>
        </div>
      )}

      {(!exportStatic || exportStatic.showFooter) && (
      <footer className="mt-auto flex items-center justify-between gap-2 pt-4 text-[11px] leading-[17px] text-[#6b7893]">
        <span className="min-w-0 truncate">
          {exportStatic ? exportStatic.footerLeft : source || (team.author ? `by ${team.author}` : "")}
        </span>
        <span className="shrink-0">
          {exportStatic ? exportStatic.footerRight : (fmtCardDate(team.date) ?? fmtCardDate(todayIso()))}
        </span>
      </footer>
      )}
    </article>
  );
});
