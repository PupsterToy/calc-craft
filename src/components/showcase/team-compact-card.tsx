"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { ChevronDown, MoveRight } from "lucide-react";
import { usePixelSnap } from "./pixel-snap";
import { longPress } from "./long-press";
import { charNameParts, fmt1, fmtInt, parseSlot } from "@/lib/showcase/format";
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
  rotationArrows,
  sortedCharacters,
  teamDisplayName,
  teamDisplayDpr,
  teamDisplayDps,
} from "@/lib/showcase/display";
import type { TeamBlock } from "@/lib/showcase/types";
import { TeamMenu } from "./team-menu";
import type { CardExportStatic } from "./team-card";

interface TeamCompactCardProps {
  team: TeamBlock;
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

type CompactPopup = "dps" | "slot" | "src" | "extra" | `c${number}`;

const FADE_ENTER = 0.92;

export const TeamCompactCard = memo(function TeamCompactCard({
  team,
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
}: TeamCompactCardProps) {
  const [popup, setPopup] = useState<CompactPopup | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const onMenuOpenChange = useCallback((open: boolean) => {
    setMenuOpen(open);
    if (open) setPopup(null);
  }, []);

  const popupElRef = useRef<HTMLDivElement | null>(null);
  const [popupUp, setPopupUp] = useState(true);
  const dpsPopRef = useRef<HTMLDivElement | null>(null);
  usePixelSnap(popupElRef, popup !== null && popup !== "dps");

  useLayoutEffect(() => {
    if (popup !== "dps") return;
    const el = dpsPopRef.current;
    const zone = el?.parentElement;
    if (!el || !zone) return;
    const place = () => {
      const er = el.getBoundingClientRect();
      const zr = zone.getBoundingClientRect();
      const xInt = Math.round(zr.x + zr.width / 2 - er.width / 2);
      el.style.left = `${xInt - zr.x}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    ro.observe(zone);
    return () => ro.disconnect();
  }, [popup]);

  useLayoutEffect(() => {
    if (popup === null || popup === "dps") {
      setPopupUp(true);
      return;
    }
    const el = popupElRef.current;
    const anchor = el?.parentElement;
    if (!el || !anchor) return;
    const h = el.offsetHeight;
    const ar = anchor.getBoundingClientRect();
    const sec = document.querySelector<HTMLElement>('section[aria-label="Поиск"]');
    const limit = Math.max(8, sec ? sec.getBoundingClientRect().bottom + 4 : 8);
    const vh = document.documentElement.clientHeight;
    const upOk = ar.top - h - 4 >= limit;
    const downOk = ar.bottom + h + 4 <= vh - 8;
    setPopupUp(upOk || !downOk);
  }, [popup]);

  const [zoneOver, setZoneOver] = useState<Record<string, boolean>>({});
  const [clipOn, setClipOn] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const next: Record<string, boolean> = {};
      const nextClip: Record<string, boolean> = {};
      root.querySelectorAll<HTMLElement>("[data-zone]").forEach((z) => {
        next[z.dataset.zone!] = isOverflowing(z);
        const nm = z.querySelector<HTMLElement>('[data-overflow="fit"]');
        if (nm) nextClip[z.dataset.zone!] = isOverflowing(nm);
      });
      setZoneOver((prev) => {
        const nk = Object.keys(next);
        const pk = Object.keys(prev);
        if (nk.length === pk.length && nk.every((k) => prev[k] === next[k])) return prev;
        return next;
      });
      setClipOn((prev) => {
        const nk = Object.keys(nextClip);
        const pk = Object.keys(prev);
        if (nk.length === pk.length && nk.every((k) => prev[k] === nextClip[k])) return prev;
        return nextClip;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => {
        requestAnimationFrame(() => requestAnimationFrame(measure));
        window.setTimeout(measure, 400);
      }).catch(() => {});
    }
    return () => {
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (popup === null) return;
    const onDoc = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) {
        if (popupElRef.current?.contains(t)) return;
        if (t instanceof Element && t.closest('[role="button"]')) return;
      }
      setPopup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopup(null);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [popup]);

  const chars = sortedCharacters(team);
  const extra = extraDamageOrNull(team);
  const recalcOn = extraRecalcOn(team);
  const displayName = teamDisplayName(team);
  const slot = parseSlot(team.slot);

  const slotHold = longPress(
    onToggleFavorite && !favorite ? () => onToggleFavorite(team) : undefined,
  );
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

  const isOverflowing = (root: HTMLElement) => {
    const own = root.matches("[data-overflow]") ? [root] : [];
    const kids = Array.from(root.querySelectorAll<HTMLElement>("[data-overflow]"));
    return [...own, ...kids].some((n) => {
      const range = document.createRange();
      range.selectNodeContents(n);
      const right = range.getBoundingClientRect().right - n.getBoundingClientRect().left;
      return right > (n.dataset.overflow === "fit" ? n.clientWidth + 1 : n.clientWidth * FADE_ENTER);
    });
  };

  const openPopup = (which: CompactPopup, ifOverflow: boolean) => ({
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      if (ifOverflow && !isOverflowing(e.currentTarget)) {
        setPopup(null);
        return;
      }
      setPopup((p) => (p === which ? null : which));
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (ifOverflow && !isOverflowing(e.currentTarget)) {
        setPopup(null);
        return;
      }
      setPopup((p) => (p === which ? null : which));
    },
  });

  return (
    <article
      ref={rootRef}
      onClick={
        multiSelect && onToggleSelect
          ? (e) => {
              if (e.target instanceof Element) {
                const block = e.target.closest(
                  'button, [role="button"], [role="menuitem"], [role="dialog"], a, input, .team-menu',
                );
                if (block) {
                  const zone = block.closest("[data-zone]");
                  if (!zone || !(zone instanceof HTMLElement) || isOverflowing(zone))
                    return;
                }
              }
              onToggleSelect(team);
            }
          : undefined
      }
      className={
        "flex flex-col rounded-xl border bg-gradient-to-b from-[#24304a] to-[#1d2739] p-4 [container-type:inline-size] " +
        (selected
          ? "border-dashed border-[#cd890b] transition-colors hover:border-[#f1a10d]"
          : "border-[#2f3d59] transition-colors hover:border-[#a68b5c]") +
        (popup !== null || menuOpen ? " relative z-20" : "")
      }
      aria-label={`Команда ${displayName || "без названия"} (компактно)`}
    >
      <ul className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-[10%]">
        {chars.map((c, i) => {
          const color = CHAR_COLORS[i % CHAR_COLORS.length];
          const share = charDamageShare(team, c);
          const gear = characterGear(c);
          const { cons, base } = charNameParts(c);
          const which = `c${i}` as CompactPopup;
          return (
            <li
              key={c.name}
              className="relative col-span-2 grid grid-cols-subgrid border-t border-black/25 py-1.5 first:border-t-0"
            >
              <div
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                aria-expanded={popup === which}
                aria-label={`${c.name}: снаряжение`}
                data-zone={which}
                {...openPopup(which, true)}
                style={{ cursor: zoneOver[which] ? "pointer" : "auto" }}
                className="min-w-0"
              >
                <div className="flex h-[13px] items-center">
                  <span
                    aria-hidden
                    className="mr-2 h-2 w-2 shrink-0 rounded-full -translate-y-px"
                    style={{ background: color }}
                  />
                  {cons && (
                    <span className="mr-2 shrink-0 text-[11px] leading-none text-[#d3bc8e]">{cons}</span>
                  )}
                  <span
                    data-overflow="fit"
                    className={
                      "min-w-0 overflow-hidden text-[12.5px] font-semibold leading-none whitespace-nowrap text-[#e8e2d5]" +
                      (clipOn[which]
                        ? " [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]"
                        : "")
                    }
                  >
                    {base}
                  </span>
                  <CharacterTags
                    c={c}
                    compact
                    className="ml-1.5"
                    forceEl={exportStatic?.dispEl}
                    forceRar={exportStatic?.dispRar}
                  />
                </div>
                <div
                  data-overflow
                  className="mt-0.5 pl-4 overflow-hidden text-[10.5px] leading-[16px] whitespace-nowrap text-[#9aa5b8] [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]"
                >
                  {gear || "—"}
                </div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[12.5px] font-semibold leading-none text-[#e8e2d5] tabular-nums">
                  {fmtInt(c.damage)}
                </div>
                <div className="mt-0.5 text-[10.5px] leading-[16px] text-[#9aa5b8] tabular-nums">
                  {share.toFixed(1)}%{c.field_time_s != null ? ` · ${fmt1(c.field_time_s)}с` : ""}
                </div>
              </div>
              {popup === which && (
                <div
                  ref={popupElRef}
                  role="dialog"
                  aria-label={`${c.name}: снаряжение`}
                  className={
                    "absolute right-0 z-50 w-max max-w-[calc(100vw-2rem)] rounded-md border border-[#2f3d59] bg-[#1d2739] p-3 text-left text-xs leading-relaxed text-[#e8e2d5] shadow-md animate-in fade-in animation-duration-150 will-change-transform " +
                    (popupUp ? "bottom-full mb-1 slide-in-from-bottom-2" : "top-full mt-1 slide-in-from-top-2")
                  }
                >
                  <div className="flex flex-wrap items-center gap-y-1 leading-none">
                    {cons && <span className="mr-2 text-[11px] text-[#d3bc8e]">{cons}</span>}
                    <span className="text-[12.5px] font-semibold">{base}</span>
                    <CharacterTags c={c} compact className="ml-1.5" />
                  </div>
                  <div className="mt-1.5 text-[#9aa5b8]">{gear || "—"}</div>
                </div>
              )}
            </li>
          );
        })}
        {extra && (
          <li className="relative col-span-2 grid grid-cols-subgrid border-t border-black/25 py-1.5">
            <div
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              aria-expanded={popup === "extra"}
              aria-label={`${extra.name}: описание`}
              data-zone="extra"
              {...openPopup("extra", true)}
              style={{ cursor: zoneOver["extra"] ? "pointer" : "auto" }}
              className="min-w-0"
            >
              <div className="flex h-[13px] items-center gap-2">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full -translate-y-px"
                  style={{ background: EXTRA_COLOR }}
                />
                <span
                  data-overflow
                  className="min-w-0 flex-1 overflow-hidden text-[12.5px] font-semibold leading-none whitespace-nowrap text-[#e8e2d5] [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]"
                >
                  {extra.name}
                </span>
              </div>
              <div
                data-overflow
                className="mt-0.5 pl-4 overflow-hidden text-[10.5px] leading-[16px] whitespace-nowrap text-[#9aa5b8] [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]"
              >
                {extra.note ?? ""}
              </div>
            </div>
            <div className="min-w-0 text-right">
              <div className="text-[12.5px] font-semibold leading-none text-[#e8e2d5] tabular-nums">
                {fmtInt(extra.damage)}
              </div>
              <div className="mt-0.5 text-[10.5px] leading-[16px] text-[#9aa5b8] tabular-nums">
                {(() => {
                  const pct = extraDamagePercent(team);
                  return pct != null ? `${pct.toFixed(1)}%` : "";
                })()}
              </div>
            </div>
            {popup === "extra" && (
              <div
                ref={popupElRef}
                role="dialog"
                aria-label={`${extra.name}: описание`}
                className={
                  "absolute right-0 z-50 w-max max-w-[calc(100vw-2rem)] rounded-md border border-[#2f3d59] bg-[#1d2739] p-3 text-left text-xs leading-relaxed shadow-md animate-in fade-in animation-duration-150 will-change-transform " +
                  (popupUp ? "bottom-full mb-1 slide-in-from-bottom-2" : "top-full mt-1 slide-in-from-top-2")
                }
              >
                <span className="font-semibold text-[#e8e2d5]">
                  {extra.name}
                </span>
                {extra.note && <div className="mt-1 text-[#9aa5b8]">{extra.note}</div>}
              </div>
            )}
          </li>
        )}
      </ul>

      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={popup === "dps"}
        aria-label="Ротация и комментарии команды"
        {...openPopup("dps", false)}
        className="group relative mt-2 cursor-pointer"
      >
        {(!exportStatic || exportStatic.dispDps) && (
        <div className="team-dps-row grid grid-cols-[1fr_auto_1fr] items-center gap-x-2.5 text-[12.5px] leading-[17px] text-[#9aa5b8]">
          <span className="justify-self-end">
            DPS <span className="text-[#d3bc8e]">·</span>{" "}
            <b className="font-semibold text-[#e8e2d5] tabular-nums">{fmtInt(teamDisplayDps(team))}</b>
          </span>
          <span aria-hidden className="w-px self-stretch bg-[#2f3d59]" />
          <span className="justify-self-start">
            <b className="font-semibold text-[#e8e2d5] tabular-nums">{fmtInt(teamDisplayDpr(team))}</b>{" "}
            <span className="text-[#d3bc8e]">·</span> DPR
          </span>
          {!exportStatic && (
          <ChevronDown
            aria-hidden
            className="absolute top-[1.5px] right-0 h-3.5 w-3.5 text-[#9aa5b8] transition-colors group-hover:text-[#e8e2d5]"
          />
          )}
        </div>
        )}
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-black/30" aria-hidden>
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
        {popup === "dps" && (
          <div
            role="dialog"
            aria-label="Ротация и комментарии"
            onClick={(e) => e.stopPropagation()}
            ref={dpsPopRef}
            className="absolute top-full left-[-17px] z-50 mt-1.5 w-[calc(100cqw+34px)] max-w-[calc(100vw-16px)] cursor-auto rounded-md border border-[#435680] bg-[#1d2739] p-3 text-left shadow-xl shadow-black/40 animate-in fade-in animation-duration-150 will-change-transform"
          >
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
                    <span key={i}>
                      {i > 0 && (
                        <MoveRight
                          className="mx-1 inline-block h-3.5 w-3.5 align-[-2.5px]"
                          aria-hidden
                        />
                      )}
                      {w}
                    </span>
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
            {!team.rotation && !team.extra_info && (
              <p className="text-[11.5px] leading-[19px] text-[#9aa5b8]">—</p>
            )}
          </div>
        )}
      </div>

      {(!exportStatic || exportStatic.showFooter) && (
      <footer className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] leading-[17px] text-[#6b7893]">
        <div className="relative min-w-0 flex-1">
          <div
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            aria-expanded={popup === "src"}
            {...openPopup("src", true)}
            aria-label="Источник: подробности"
            data-overflow
            data-zone="src"
            style={{ cursor: zoneOver.src ? "pointer" : "auto" }}
            className="overflow-hidden whitespace-nowrap text-left [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]"
          >
            {exportStatic ? exportStatic.footerLeft : source || (team.author ? `by ${team.author}` : "")}
          </div>
          {popup === "src" && (
            <div
              ref={popupElRef}
              role="dialog"
              aria-label="Источник"
              className={
                "absolute left-0 z-50 w-max max-w-[calc(100vw-2rem)] rounded-md border border-[#2f3d59] bg-[#1d2739] p-3 text-left text-xs leading-relaxed text-[#e8e2d5] shadow-md animate-in fade-in animation-duration-150 will-change-transform " +
                (popupUp ? "bottom-full mb-1 slide-in-from-bottom-2" : "top-full mt-1 slide-in-from-top-2")
              }
            >
              {source || (team.author ? `by ${team.author}` : "")}
            </div>
          )}
        </div>
        {exportStatic ? (
          <span className="shrink-0 whitespace-nowrap">{exportStatic.footerRight}</span>
        ) : (
        <>
        <div className="relative shrink-0">
          <span
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            aria-expanded={popup === "slot"}
            {...openPopup("slot", false)}
            aria-label={`Слот ${team.slot}: подробности`}
            {...slotHold}
            className={
              "inline-block cursor-pointer rounded-md border px-2 py-1 text-[11px] leading-[16px] whitespace-nowrap text-[#9aa5b8] transition-colors hover:text-[#e8e2d5] select-none [-webkit-touch-callout:none] [touch-action:pan-y_pinch-zoom] " +
              (favorite
                ? "border-[#3d624e] hover:border-[#4a765f]"
                : "border-[#2a3650] hover:border-[#435680]")
            }
          >
            {team.slot}
          </span>
          {popup === "slot" && (
            <div
              ref={popupElRef}
              role="dialog"
              aria-label={`Слот ${team.slot}: подробности`}
              className={
                "absolute right-0 z-50 w-max max-w-[calc(100vw-2rem)] rounded-md border border-[#2f3d59] bg-[#1d2739] p-3 text-left text-xs leading-relaxed text-[#e8e2d5] shadow-md animate-in fade-in animation-duration-150 will-change-transform " +
                (popupUp ? "bottom-full mb-1 slide-in-from-bottom-2" : "top-full mt-1 slide-in-from-top-2")
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
          onOpenChange={onMenuOpenChange}
        />
        </>
        )}
      </footer>
      )}
    </article>
  );
});
