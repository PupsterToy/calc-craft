"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Star } from "lucide-react";
import { sourceName, type CachedSource } from "@/lib/showcase/cache";
import { escapeHtml } from "@/lib/showcase/format";
import { useScrollSnap } from "./pixel-snap";

interface SourcesMenuProps {
  sources: CachedSource[];
  activeKeys: string[];
  demoHidden: boolean;
  onToggle: (key: string) => void;
  onRename: (key: string, name: string) => void;
  onHover: (key: string | null) => void;
  favoritesCount: number;
  favoritesOn: boolean;
  onToggleFavorites: () => void;
}

export function SourcesMenu({
  sources,
  activeKeys,
  demoHidden,
  onToggle,
  onRename,
  onHover,
  favoritesCount,
  favoritesOn,
  onToggleFavorites,
}: SourcesMenuProps) {
  const [open, setOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  useScrollSnap(listRef, open);

  function closeMenu() {
    setOpen(false);
    setEditKey(null);
    onHover(null);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) closeMenu();
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (editKey) {
      const el = editInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [editKey]);

  function startEdit(s: CachedSource) {
    setEditKey(s.key);
    setEditValue(s.name);
  }

  function cancelEdit() {
    setEditKey(null);
  }

  function commitRename() {
    if (!editKey) return;
    const v = editValue.trim();
    const s = sources.find((x) => x.key === editKey);
    if (s && v && v !== s.name) onRename(editKey, v);
    setEditKey(null);
  }

  const checked = sources.filter((s) => activeKeys.includes(s.key));
  const parts: string[] = [];
  if (favoritesOn) parts.push("избранное");
  if (checked.length === 1 && !favoritesOn) {
    parts.push(sourceName(checked[0]));
  } else {
    for (const s of checked) parts.push(`#${s.seq}`);
  }
  const btnLabel =
    parts.length === 0
      ? demoHidden
        ? "—"
        : "демо"
      : parts.join(", ");

  return (
    <div ref={rootRef} className="relative flex w-full">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Источники данных"
        data-sources-btn
        onClick={() => (open ? closeMenu() : setOpen(true))}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[#2f3d59] bg-[#1d2739] px-3 text-[13.5px] text-[#e8e2d5] transition-colors hover:border-[#a68b5c] aria-expanded:border-[#a68b5c]"
      >
        <span className="min-w-0 truncate">
          Источники:{" "}
          <b
            data-chip-label
            suppressHydrationWarning
            className="font-semibold text-[#d3bc8e]"
            dangerouslySetInnerHTML={{ __html: escapeHtml(btnLabel) }}
          />
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </button>

      {open && (
        <div
          ref={listRef}
          className="absolute top-full left-0 z-50 mt-1.5 max-h-72 w-80 min-w-full overflow-y-auto rounded-lg border border-[#2f3d59] bg-[#1d2739] px-1 pt-1 pb-1 shadow-xl shadow-black/40 animate-in fade-in slide-in-from-top-2 animation-duration-150 will-change-transform"
        >
          {sources.length === 0 && favoritesCount === 0 ? (
            <p className="px-2.5 py-3 text-[12.5px] leading-[18px] text-[#9aa5b8]">
              Нет сохранённых источников. Загрузите xlsx, CSV или ссылку на лист
              Google-таблицы — таблица появится в этом списке.
            </p>
          ) : (
            <>
              {favoritesCount > 0 && (
                <div className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-[#24304a]">
                  <button
                    type="button"
                    onClick={onToggleFavorites}
                    aria-label={`Избранное — ${favoritesOn ? "скрыть" : "показать"}`}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                  >
                    <span
                      className={
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors " +
                        (favoritesOn
                          ? "border-[#d3bc8e] bg-[#d3bc8e] text-[#1c2333]"
                          : "border-[#4a5878]")
                      }
                    >
                      {favoritesOn && <Check className="h-3 w-3" aria-hidden />}
                    </span>
                    <Star className="h-3.5 w-3.5 shrink-0 text-[#74ba95]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[#e8e2d5]">
                      Избранное
                    </span>
                    <span className="shrink-0 text-[11px] text-[#9aa5b8] tabular-nums">
                      {favoritesCount}
                    </span>
                  </button>
                </div>
              )}
              {sources.map((s) => {
                const on = activeKeys.includes(s.key);
                const editing = editKey === s.key;
                return (
                  <div
                    key={s.key}
                    onMouseEnter={() => onHover(s.key)}
                    onMouseLeave={() => onHover(null)}
                    className={
                      "flex items-center gap-1 rounded-md px-1.5 py-1" +
                      (editing ? "" : " transition-colors hover:bg-[#24304a]")
                    }
                  >
                    {editing ? (
                      <>
                        <span className="shrink-0 text-[13px] leading-none text-[#e8e2d5]">
                          #{s.seq} ·
                        </span>
                        <input
                          ref={editInputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitRename();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              cancelEdit();
                            }
                          }}
                          onBlur={cancelEdit}
                          aria-label="Название источника"
                          className="h-7 min-w-0 flex-1 rounded border border-[#435680] bg-[#141c2b] px-2 text-[13px] leading-none text-[#e8e2d5] outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Сохранить название"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={commitRename}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#d3bc8e] transition-colors hover:bg-[#2f3d59]"
                        >
                          <Check className="h-4 w-4" aria-hidden />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onToggle(s.key)}
                          aria-label={`${sourceName(s)} — ${on ? "скрыть" : "показать"}`}
                          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                        >
                          <span
                            className={
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors " +
                              (on
                                ? "border-[#d3bc8e] bg-[#d3bc8e] text-[#1c2333]"
                                : "border-[#4a5878]")
                            }
                          >
                            {on && <Check className="h-3 w-3" aria-hidden />}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] text-[#e8e2d5]">
                            {sourceName(s)}
                          </span>
                          <span className="shrink-0 text-[11px] text-[#9aa5b8] tabular-nums">
                            {s.data.slots_filled}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`${sourceName(s)} — переименовать`}
                          onClick={() => startEdit(s)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#9aa5b8] transition-colors hover:bg-[#2f3d59] hover:text-[#e8e2d5]"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
