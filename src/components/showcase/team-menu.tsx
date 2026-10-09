"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SVGProps,
} from "react";
import { Pencil, SquareCheck, SquarePlus, Star, Trash2 } from "lucide-react";
import { ExportIcon } from "./export-icon";
import { usePixelSnap } from "./pixel-snap";
import { longPress } from "./long-press";
import { Tip } from "@/components/showcase/tip";
import type { TeamBlock } from "@/lib/showcase/types";

interface TeamMenuProps {
  size?: "card" | "row";
  team: TeamBlock;
  favorite?: boolean;
  favAddedAt?: number;
  selected?: boolean;
  onToggleFavorite?: (team: TeamBlock) => void;
  onDelete?: (team: TeamBlock) => void;
  onToggleSelect?: (team: TeamBlock) => void;
  onEdit?: (team: TeamBlock) => void;
  onExport?: (team: TeamBlock) => void;
  onOpenChange?: (open: boolean) => void;
}

export const TeamMenu = memo(function TeamMenu({
  size = "card",
  team,
  favorite = false,
  favAddedAt,
  selected = false,
  onToggleFavorite,
  onToggleSelect,
  onEdit,
  onDelete,
  onExport,
  onOpenChange,
}: TeamMenuProps) {
  const [open, setOpen] = useState(false);
  const [favDimElapsed, setFavDimElapsed] = useState(false);
  useEffect(() => {
    if (favAddedAt == null) {
      setFavDimElapsed(false);
      return;
    }
    const left = favAddedAt + 1000 - Date.now();
    if (left <= 0) {
      setFavDimElapsed(true);
      return;
    }
    setFavDimElapsed(false);
    const t = window.setTimeout(() => setFavDimElapsed(true), left);
    return () => window.clearTimeout(t);
  }, [favAddedAt]);
  const favDim = favorite && (favAddedAt == null || favDimElapsed);
  const [delArmed, setDelArmed] = useState(false);
  useEffect(() => {
    if (!open) setDelArmed(false);
  }, [open]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trigRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  usePixelSnap(panelRef, open);

  const [up, setUp] = useState(true);
  useLayoutEffect(() => {
    if (!open) {
      setUp(true);
      return;
    }
    const el = panelRef.current;
    const anchor = rootRef.current;
    if (!el || !anchor) return;
    const h = el.offsetHeight;
    const ar = anchor.getBoundingClientRect();
    const sec = document.querySelector<HTMLElement>('section[aria-label="Поиск"]');
    const limit = Math.max(8, sec ? sec.getBoundingClientRect().bottom + 4 : 8);
    const vh = document.documentElement.clientHeight;
    const upOk = ar.top - h - 4 >= limit;
    const downOk = ar.bottom + h + 4 <= vh - 8;
    setUp(upOk || !downOk);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (panelRef.current && e.composedPath().includes(panelRef.current)) return;
      if (panelRef.current?.contains(t)) return;
      if (trigRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const toggle = () => setOpen((o) => !o);

  const trigHold = longPress(
    onToggleSelect ? () => onToggleSelect(team) : undefined,
  );

  const onTrigKey = (e: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    toggle();
  };

  const items: {
    aria: string;
    Icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
    fill?: string;
    danger?: boolean;
    disabled?: boolean;
    twoStep?: boolean;
    closes?: boolean;
    favBlock?: "fresh" | "dim";
    tip?: ReactNode;
    act?: (team: TeamBlock) => void;
  }[] = [
    {
      aria: "Удалить",
      Icon: Trash2,
      danger: true,
      disabled: !onDelete,
      act: onDelete,
      twoStep: true,
      tip: (
        <>
          • Нажать дважды для удаления
          <br />• После удаления можно восстановить в верхней секции страницы
        </>
      ),
    },
    { aria: "Редактировать", Icon: Pencil, act: onEdit, disabled: !onEdit, closes: true },
    { aria: "Выбрать", Icon: selected ? SquareCheck : SquarePlus, act: onToggleSelect },
    {
      aria: "В избранное",
      Icon: Star,
      fill: favorite ? "currentColor" : undefined,
      act: favorite ? undefined : onToggleFavorite,
      disabled: favorite,
      favBlock: favorite ? (favDim ? "dim" : "fresh") : undefined,
      tip: <>Добавляет в источник «Избранное»</>,
    },
    { aria: "Экспорт", Icon: ExportIcon, act: onExport, disabled: !onExport, closes: true },
  ];

  const fire = (
    twoStep: boolean | undefined,
    closes: boolean | undefined,
    act: ((team: TeamBlock) => void) | undefined,
    disabled: boolean | undefined,
  ) => {
    if (!act || disabled) return;
    if (twoStep) {
      if (!delArmed) {
        setDelArmed(true);
        return;
      }
      setDelArmed(false);
      setOpen(false);
    }
    if (closes) setOpen(false);
    act(team);
  };

  const onItemKey = (
    e: ReactKeyboardEvent<HTMLSpanElement>,
    twoStep: boolean | undefined,
    closes: boolean | undefined,
    act: ((team: TeamBlock) => void) | undefined,
    disabled: boolean | undefined,
  ) => {
    if (!act || disabled || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    e.stopPropagation();
    fire(twoStep, closes, act, disabled);
  };

  return (
    <div
      ref={rootRef}
      data-menu-open={open ? "true" : undefined}
      className="team-menu relative shrink-0"
    >
      <span
        ref={trigRef}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Меню карточки"
        onClick={toggle}
        onKeyDown={onTrigKey}
        {...trigHold}
        className={
          "flex items-center justify-center text-[#9aa5b8] transition-colors hover:text-[#e8e2d5] select-none [-webkit-touch-callout:none] [touch-action:pan-y_pinch-zoom] " +
          (size === "card" ? "h-6 w-5" : "h-5 w-4")
        }
      >
        {size === "card" ? (
          <svg viewBox="0 0 12 20" className="h-5 w-3" fill="currentColor" aria-hidden>
            <circle cx="6" cy="4" r="1" />
            <circle cx="6" cy="10" r="1" />
            <circle cx="6" cy="16" r="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 8 14" className="h-3.5 w-2" fill="currentColor" aria-hidden>
            <circle cx="4" cy="2" r="1" />
            <circle cx="4" cy="7" r="1" />
            <circle cx="4" cy="12" r="1" />
          </svg>
        )}
      </span>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Меню карточки"
          className={
            "absolute right-0 z-50 flex overflow-hidden rounded-md border border-[#435680] bg-[#1d2739] shadow-md animate-in fade-in animation-duration-150 will-change-transform " +
            (up ? "bottom-full mb-1 slide-in-from-bottom-2" : "top-full mt-1 slide-in-from-top-2")
          }
        >
          {items.map(({ aria, Icon, fill, danger, disabled, twoStep, closes, favBlock, tip, act }, i) => {
            const item = (
              <span
                key={aria}
                role="menuitem"
                tabIndex={0}
                aria-label={aria}
                aria-disabled={disabled || undefined}
              onClick={act && !disabled ? () => fire(twoStep, closes, act, disabled) : undefined}
              onKeyDown={(e) => onItemKey(e, twoStep, closes, disabled ? undefined : act, disabled)}
              className={
                "flex h-8 w-8 items-center justify-center text-[#9aa5b8] transition-colors " +
                (favBlock === "dim"
                  ? "cursor-not-allowed opacity-50"
                  : favBlock === "fresh"
                    ? "cursor-not-allowed hover:bg-[#24304a] hover:text-[#d3bc8e]"
                    : disabled
                  ? "cursor-not-allowed opacity-50"
                  : act
                    ? danger
                      ? delArmed
                        ? "cursor-pointer text-[#ef7474] hover:bg-[rgb(145_12_12_/_15%)]"
                        : "cursor-pointer hover:bg-[#24304a] hover:text-[#d86a6a]"
                      : "cursor-pointer hover:bg-[#24304a] hover:text-[#d3bc8e]"
                    : "cursor-pointer hover:bg-[#24304a] hover:text-[#d3bc8e]") +
                (i > 0 ? " border-l border-[#2f3d59]" : "")
              }
            >
              <Icon
                className="h-4 w-4 transition-colors"
                fill={fill ?? "none"}
                aria-hidden
              />
              </span>
            );
            return tip ? (
              <Tip key={aria} label={tip}>
                {item}
              </Tip>
            ) : (
              item
            );
          })}
        </div>
      )}
    </div>
  );
});
