"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Star, ToggleLeft, ToggleRight, Trash2, X, ChevronRight, Eye, Pencil } from "lucide-react";
import { ExportIcon } from "./export-icon";
import { ElementIcon, RarityStar } from "./element-icon";
import { ELEMENTS, type ElementKey } from "@/lib/showcase/elements";
import { longPress } from "./long-press";
import { Tip } from "@/components/showcase/tip";

interface GeneralMenuProps {
  selectedCount: number;
  onClearSelection: () => void;
  multiSelect: boolean;
  onToggleMultiSelect: () => void;
  onSelectAll: () => void;
  onFavoriteAll: () => void;
  onDeleteAll: () => void;
  onExportAll: () => void;
  onEditAll: () => void;
  canDelete?: boolean;
  favSourceOnly?: boolean;
}

const ELEMENT_ON_CLASS: Record<ElementKey, string> = {
  Pyro: "h-4 w-4 transition-colors text-[#FF6640] group-hover:text-[#FF9479]",
  Hydro: "h-4 w-4 transition-colors text-[#00C0FF] group-hover:text-[#4CD3FF]",
  Anemo: "h-4 w-4 transition-colors text-[#32D7A0] group-hover:text-[#70E3BC]",
  Electro: "h-4 w-4 transition-colors text-[#CC80FF] group-hover:text-[#DBA6FF]",
  Dendro: "h-4 w-4 transition-colors text-[#90CC00] group-hover:text-[#B1DB4C]",
  Cryo: "h-4 w-4 transition-colors text-[#80FFFF] group-hover:text-[#A6FFFF]",
  Geo: "h-4 w-4 transition-colors text-[#FFAC00] group-hover:text-[#FFC54C]",
};

export function GeneralMenu({
  selectedCount,
  onClearSelection,
  multiSelect,
  onToggleMultiSelect,
  onSelectAll,
  onFavoriteAll,
  onDeleteAll,
  onExportAll,
  onEditAll,
  canDelete = false,
  favSourceOnly = false,
}: GeneralMenuProps) {
  const [open, setOpen] = useState(false);
  const [delArmed, setDelArmed] = useState(false);
  useEffect(() => {
    if (!open) {
      setDelArmed(false);
      setSubOpen(false);
    }
  }, [open]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trigRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [subOpen, setSubOpen] = useState(false);
  const [randEl, setRandEl] = useState<ElementKey>("Cryo");
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);
  const dispRowRef = useRef<HTMLSpanElement | null>(null);

  const [elOn, setElOn] = useState(true);
  const [rarOn, setRarOn] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("showcase-display");
      if (raw) {
        const v = JSON.parse(raw) as { el?: unknown; rar?: unknown };
        if (typeof v.el === "boolean") setElOn(v.el);
        if (typeof v.rar === "boolean") setRarOn(v.rar);
      }
    } catch {
    }
  }, []);
  const flipDisplay = (which: "el" | "rar") => {
    const next = which === "el" ? !elOn : !rarOn;
    document.documentElement.setAttribute(which === "el" ? "data-el" : "data-rar", next ? "on" : "off");
    try {
      localStorage.setItem(
        "showcase-display",
        JSON.stringify(which === "el" ? { el: next, rar: rarOn } : { el: elOn, rar: next }),
      );
    } catch {
    }
    if (which === "el") setElOn(next);
    else setRarOn(next);
  };

  const ELEMENT_KEYS = Object.keys(ELEMENTS) as ElementKey[];
  const toggleSub = () => {
    if (!subOpen) setRandEl(ELEMENT_KEYS[Math.floor(Math.random() * ELEMENT_KEYS.length)]);
    setSubOpen(!subOpen);
  };

  useLayoutEffect(() => {
    if (!subOpen) {
      setSubPos(null);
      return;
    }
    const sub = subRef.current;
    const panel = panelRef.current;
    const root = rootRef.current;
    if (!sub || !panel || !root) return;
    const pl = panel.offsetLeft;
    const pw = panel.offsetWidth;
    const pRight = pl + pw;
    const pTop = panel.offsetTop;
    const rt = root.getBoundingClientRect();
    const w = sub.offsetWidth;
    const h = sub.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let left = pl - w - 4;
    if (rt.left + left < 8) left = 8 - rt.left;
    let top = pTop;
    const maxTop = vh - 8 - h - rt.top;
    if (top > maxTop) top = Math.max(0, maxTop);
    setSubPos({ left, top });
  }, [subOpen]);

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
      if (subRef.current && e.composedPath().includes(subRef.current)) return;
      if (panelRef.current?.contains(t)) return;
      if (subRef.current?.contains(t)) return;
      if (trigRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (subOpen) setSubOpen(false);
        else setOpen(false);
      }
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, subOpen]);

  const toggle = () => setOpen((o) => !o);

  const [favFlash, setFavFlash] = useState(false);
  const favFlashTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (favFlashTimerRef.current != null) window.clearTimeout(favFlashTimerRef.current);
    },
    [],
  );
  const fireFavoriteAll = () => {
    onFavoriteAll();
    if (favFlashTimerRef.current != null) return;
    setFavFlash(true);
    favFlashTimerRef.current = window.setTimeout(() => {
      favFlashTimerRef.current = null;
      setFavFlash(false);
    }, 1000);
  };

  const holdAll = longPress(onSelectAll);

  const onTrigKey = (e: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    toggle();
  };

  const act = (fn: () => void, disabled: boolean) => (disabled ? undefined : fn);
  const onKey =
    (fn: () => void, disabled: boolean) =>
    (e: ReactKeyboardEvent<HTMLSpanElement>) => {
      if (disabled || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      e.stopPropagation();
      fn();
    };

  const delDisabled = selectedCount === 0 || !canDelete;
  const fireDelete = () => {
    if (delDisabled) return;
    if (!delArmed) {
      setDelArmed(true);
      return;
    }
    setDelArmed(false);
    setOpen(false);
    onDeleteAll();
  };

  const grpDisabled = selectedCount === 0;
  const editDisabled = grpDisabled || !canDelete;
  const favDisabled = grpDisabled || favSourceOnly;

  const base =
    "flex items-center gap-2 rounded-md px-2 py-2 text-[13px] transition-colors ";

  const mselItem = (
    <Tip
      label={
        <>
          • Кликните по карточке, чтобы выбрать её.
          <br />• Зажмите эту кнопку, чтобы выбрать все.
        </>
      }
    >
      <span
        role="menuitem"
        tabIndex={0}
        aria-label="Мультивыбор"
        {...holdAll}
        onClick={() => {
          setSubOpen(false);
          onToggleMultiSelect();
        }}
        onKeyDown={onKey(() => {
          setSubOpen(false);
          onToggleMultiSelect();
        }, false)}
        className={
          base +
          "group cursor-pointer select-none [-webkit-touch-callout:none] [touch-action:pan-y_pinch-zoom] text-[#e8e2d5] hover:bg-[#24304a]"
        }
      >
        <span
          aria-hidden
          className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center"
        >
          <ToggleRight
            className={
              "absolute h-4 w-4 transition-[color,opacity,scale] duration-150 text-[#cd890b] group-hover:text-[#f1a10d] " +
              (multiSelect ? "scale-100 opacity-100" : "scale-90 opacity-0")
            }
          />
          <ToggleLeft
            className={
              "absolute h-4 w-4 transition-[color,opacity,scale] duration-150 text-[#9aa5b8] group-hover:text-[#d3bc8e] " +
              (multiSelect ? "scale-90 opacity-0" : "scale-100 opacity-100")
            }
          />
        </span>
        Мультивыбор
      </span>
    </Tip>
  );

  return (
    <div
      ref={rootRef}
      data-menu-open={open ? "true" : undefined}
      className="cards-general-menu relative mr-[15px] shrink-0"
    >
      <span
        data-menu-chip
        className="flex h-6 items-stretch gap-[3px] overflow-hidden rounded bg-[#24304a] transition-colors hover:bg-[#2f3d59] select-none"
      >
        {selectedCount > 0 && (
          <Tip label="Снять выбор со всех карточек">
            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Снять выбор со всех карточек"
              className="flex items-center border-r border-black/25 px-1 text-[#7182a8] transition-colors hover:text-[#e8e2d5] animate-in fade-in slide-in-from-right-2 duration-150 will-change-transform"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </Tip>
        )}
        <span
          ref={trigRef}
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Общее меню"
          onClick={toggle}
          onKeyDown={onTrigKey}
            className="flex h-6 w-6 items-center justify-center text-[#9aa5b8] transition-colors hover:text-[#e8e2d5]"
          >
            <svg
              viewBox="0 0 16 14"
              className="h-3.5 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <line x1="1" y1="2" x2="15" y2="2" />
              <line x1="1" y1="7" x2="15" y2="7" />
              <line x1="1" y1="12" x2="15" y2="12" />
            </svg>
          </span>
      </span>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Общее меню"
          className={
            "absolute right-[-15px] z-50 flex w-44 flex-col overflow-hidden rounded-md border border-[#435680] bg-[#1d2739] px-1 pt-1 pb-1 shadow-md animate-in fade-in animation-duration-150 will-change-transform " +
            (up ? "bottom-full mb-1 slide-in-from-bottom-2" : "top-full mt-1 slide-in-from-top-2")
          }
        >
          <span
            ref={dispRowRef}
            role="menuitem"
            tabIndex={0}
            aria-label="Отображение"
            aria-haspopup="menu"
            aria-expanded={subOpen}
            onClick={toggleSub}
            onKeyDown={onKey(toggleSub, false)}
            className={
              base +
              "group cursor-pointer select-none text-[#e8e2d5] hover:bg-[#24304a]"
            }
          >
            <Eye
              className="h-4 w-4 transition-colors text-[#9aa5b8] group-hover:text-[#d3bc8e]"
              aria-hidden
            />
            Отображение
            <ChevronRight
              className="ml-auto h-4 w-4 transition-colors text-[#9aa5b8] group-hover:text-[#e8e2d5]"
              aria-hidden
            />
          </span>
          <div aria-hidden className="mx-1 my-0.5 border-t border-[#2f3d59]" />
          {mselItem}
          <span
            role="menuitem"
            tabIndex={0}
            aria-label="Экспорт"
            aria-disabled={grpDisabled || undefined}
            onClick={
              grpDisabled
                ? () => setSubOpen(false)
                : () => {
                    setSubOpen(false);
                    setOpen(false);
                    onExportAll();
                  }
            }
            onKeyDown={
              grpDisabled
                ? undefined
                : onKey(() => {
                    setSubOpen(false);
                    setOpen(false);
                    onExportAll();
                  }, false)
            }
            className={
              base +
              (grpDisabled
                ? "cursor-not-allowed opacity-50 text-[#e8e2d5]"
                : "group cursor-pointer text-[#e8e2d5] hover:bg-[#24304a]")
            }
          >
            <ExportIcon
              className={
                "h-4 w-4 transition-colors text-[#9aa5b8]" +
                (grpDisabled ? "" : " group-hover:text-[#d3bc8e]")
              }
              aria-hidden
            />
            Экспорт
          </span>
          <Tip label={<>Добавляет в источник «Избранное»</>}>
            <span
              role="menuitem"
              tabIndex={0}
              aria-label="В избранное"
              aria-disabled={favDisabled || undefined}
              onClick={act(() => {
                setSubOpen(false);
                fireFavoriteAll();
              }, favDisabled)}
              onKeyDown={onKey(() => {
                setSubOpen(false);
                fireFavoriteAll();
              }, favDisabled)}
              className={
                base +
                (favDisabled
                  ? "cursor-not-allowed opacity-50 text-[#e8e2d5]"
                  :
                    "group cursor-pointer text-[#e8e2d5] hover:bg-[#24304a]")
              }
            >
              <Star
                className={
                  "h-4 w-4 transition-colors text-[#9aa5b8]" +
                  (favDisabled ? "" : " group-hover:text-[#d3bc8e]")
                }
                fill={favFlash ? "currentColor" : "none"}
                aria-hidden
              />
              В избранное
            </span>
          </Tip>
          <span
            role="menuitem"
            tabIndex={0}
            aria-label="Редактировать"
            aria-disabled={editDisabled || undefined}
            onClick={
              editDisabled
                ? () => setSubOpen(false)
                : () => {
                    setSubOpen(false);
                    setOpen(false);
                    onEditAll();
                  }
            }
            onKeyDown={
              editDisabled
                ? undefined
                : onKey(() => {
                    setSubOpen(false);
                    setOpen(false);
                    onEditAll();
                  }, false)
            }
            className={
              base +
              (editDisabled
                ? "cursor-not-allowed opacity-50 text-[#e8e2d5]"
                : "group cursor-pointer text-[#e8e2d5] hover:bg-[#24304a]")
            }
          >
            <Pencil
              className={
                "h-4 w-4 transition-colors text-[#9aa5b8]" +
                (editDisabled ? "" : " group-hover:text-[#d3bc8e]")
              }
              aria-hidden
            />
            Редактировать
          </span>
          <Tip
            label={
              <>
                • Нажать дважды для удаления
                <br />• После удаления можно восстановить в верхней секции страницы
              </>
            }
          >
            <span
              role="menuitem"
              tabIndex={0}
              aria-label="Удалить"
              aria-disabled={delDisabled || undefined}
              onClick={act(() => {
                setSubOpen(false);
                fireDelete();
              }, delDisabled)}
              onKeyDown={onKey(() => {
                setSubOpen(false);
                fireDelete();
              }, delDisabled)}
              className={
                base +
                (delDisabled
                  ? "cursor-not-allowed opacity-50 text-[#e8e2d5]"
                  : delArmed
                    ?
                      "group cursor-pointer text-[#ef7474] hover:bg-[rgb(145_12_12_/_15%)]"
                    :
                      "group cursor-pointer text-[#e8e2d5] hover:bg-[#24304a] hover:text-[#d86a6a]")
              }
            >
              <Trash2
                className={
                  "h-4 w-4 transition-colors " +
                  (delDisabled
                    ? "text-[#9aa5b8]"
                    : delArmed
                      ? "text-[#ef7474]"
                      : "text-[#9aa5b8] group-hover:text-[#d86a6a]")
                }
                aria-hidden
              />
              Удалить
            </span>
          </Tip>
        </div>
      )}
      {open && subOpen && (
        <div
          ref={subRef}
          role="menu"
          aria-label="Отображение"
          data-display-submenu
          style={
            subPos
              ? { left: subPos.left, top: subPos.top }
              : { visibility: "hidden" }
          }
          className="absolute z-50 flex w-max flex-col overflow-hidden rounded-md border border-[#435680] bg-[#1d2739] px-1 pt-1 pb-1 shadow-md animate-in fade-in slide-in-from-right-2 animation-duration-150 will-change-transform"
        >
          <span
            role="menuitemcheckbox"
            tabIndex={0}
            aria-label="Элемент"
            aria-checked={elOn}
            onClick={() => flipDisplay("el")}
            onKeyDown={onKey(() => flipDisplay("el"), false)}
            className={
              base + "group cursor-pointer select-none text-[#e8e2d5] hover:bg-[#24304a]"
            }
          >
            <ElementIcon
              element={randEl}
              mono
              className={
                elOn
                  ? ELEMENT_ON_CLASS[randEl]
                  : "h-4 w-4 transition-colors text-[#9aa5b8] group-hover:text-[#d3bc8e]"
              }
            />
            Элемент
          </span>
          <span
            role="menuitemcheckbox"
            tabIndex={0}
            aria-label="Редкость"
            aria-checked={rarOn}
            onClick={() => flipDisplay("rar")}
            onKeyDown={onKey(() => flipDisplay("rar"), false)}
            className={
              base + "group cursor-pointer select-none text-[#e8e2d5] hover:bg-[#24304a]"
            }
          >
            <RarityStar
              filled={rarOn}
              className={
                rarOn
                  ? "h-4 w-4 transition-colors text-[#d3bc8e] group-hover:text-[#E0D0B0]"
                  : "h-4 w-4 transition-colors text-[#9aa5b8] group-hover:text-[#d3bc8e]"
              }
            />
            Редкость
          </span>
        </div>
      )}
    </div>
  );
}
