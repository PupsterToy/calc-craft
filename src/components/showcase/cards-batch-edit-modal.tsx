"use client";

import { useEffect, useRef, useState } from "react";
import { usePixelSnap, useScrollSnap } from "./pixel-snap";
import { parseCardDateText } from "./card-edit-modal";
import { fmtCardDate } from "@/lib/showcase/format";
import type { TeamBlock } from "@/lib/showcase/types";

export interface BatchEditCard {
  team: TeamBlock;
  favSrc: string | null;
}

export interface BatchEditValues {
  date: string | null;
  author: string | null;
  srcName: string | null;
}

function commonValue(values: (string | null | undefined)[]): string {
  if (values.length === 0) return "";
  const first = values[0] ?? "";
  return values.every((v) => (v ?? "") === first) ? first : "";
}

export function CardsBatchEditModal({
  cards,
  onApply,
  onClose,
}: {
  cards: BatchEditCard[];
  onApply: (values: BatchEditValues) => void;
  onClose: () => void;
}) {
  const allFav = cards.length > 0 && cards.every((c) => c.favSrc != null);

  const [dateText, setDateText] = useState(() =>
    fmtCardDate(commonValue(cards.map((c) => c.team.date))) ?? "",
  );
  const [authorText, setAuthorText] = useState(() =>
    commonValue(cards.map((c) => c.team.author)),
  );
  const [srcText, setSrcText] = useState(() =>
    allFav ? commonValue(cards.map((c) => c.favSrc)) : "",
  );

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  usePixelSnap(panelRef);
  useScrollSnap(overlayRef);

  useEffect(() => {
    const de = document.documentElement;
    const prevBody = document.body.style.overflow;
    const prevHtml = de.style.overflow;
    const prevPad = de.style.paddingRight;
    const probe = document.querySelector("header");
    const x0 = probe ? probe.getBoundingClientRect().left : null;
    document.body.style.overflow = "hidden";
    de.style.overflow = "hidden";
    if (probe && x0 != null) {
      const x1 = probe.getBoundingClientRect().left;
      if (x1 > x0) de.style.paddingRight = `${(x1 - x0) * 2}px`;
    }
    return () => {
      document.body.style.overflow = prevBody;
      de.style.overflow = prevHtml;
      de.style.paddingRight = prevPad;
    };
  }, []);

  useEffect(() => {
    let pushed = false;
    try {
      history.pushState({ batchEditGuard: true }, "");
      pushed = true;
    } catch {
    }
    const onPop = () => {
      if (!pushed || history.state?.batchEditGuard === true) return;
      try {
        history.pushState({ batchEditGuard: true }, "");
      } catch {
        pushed = false;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed && history.state?.batchEditGuard === true) {
        try {
          history.back();
        } catch {
        }
      }
    };
  }, []);

  const dateTrim = dateText.trim();
  const authorTrim = authorText.trim();
  const srcTrim = srcText.trim();
  const dateFilled = dateTrim !== "";
  const dateValid = !dateFilled || parseCardDateText(dateTrim) != null;
  const dirty = dateFilled || authorTrim !== "" || srcTrim !== "";

  const save = () => {
    if (!dirty || !dateValid) return;
    onApply({
      date: dateFilled ? parseCardDateText(dateTrim) : null,
      author: authorTrim !== "" ? authorText : null,
      srcName: srcTrim !== "" ? srcText : null,
    });
  };

  const field =
    "h-8 w-full rounded-md border bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:outline-none ";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] overflow-y-auto bg-[rgb(10_16_28_/_72%)] p-4 animate-in fade-in animation-duration-200"
    >
      <div className="flex min-h-full">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Редактирование карточек"
          className="cards-batch-edit-modal mx-auto my-auto w-full max-w-[480px] rounded-xl border border-[#2f3d59] bg-gradient-to-b from-[#24304a] to-[#1d2739] p-4 shadow-xl shadow-black/40 animate-in fade-in zoom-in-95 animation-duration-200 will-change-transform"
        >
          <div className="mb-3">
            <h2 className="text-[15px] font-semibold leading-tight text-[#e8e2d5]">
              Редактирование карточек
            </h2>
            <p className="mt-1 truncate text-[12px] leading-none text-[#9aa5b8]">
              Выбрано карточек: <span className="text-[#d3bc8e]">{cards.length}</span>
            </p>
          </div>

          <div>
            <div>
              <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Дата</p>
              <input
                type="text"
                aria-label="Дата"
                placeholder="2026/10/06"
                value={dateText}
                onChange={(e) => setDateText(e.target.value)}
                className={
                  field +
                  (dateValid
                    ? "border-[#2f3d59] focus:border-[#a68b5c]"
                    : "border-[#d86a6a]")
                }
              />
            </div>
            <div className="mt-2.5">
              <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Автор</p>
              <input
                type="text"
                aria-label="Автор"
                value={authorText}
                onChange={(e) => setAuthorText(e.target.value)}
                className={field + "border-[#2f3d59] focus:border-[#a68b5c]"}
              />
            </div>
            {allFav && (
              <div className="mt-2.5">
                <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Источник</p>
                <input
                  type="text"
                  aria-label="Источник"
                  value={srcText}
                  onChange={(e) => setSrcText(e.target.value)}
                  className={field + "border-[#2f3d59] focus:border-[#a68b5c]"}
                />
              </div>
            )}
            <p className="mt-2.5 text-[12px] leading-[17px] text-[#9aa5b8]">
              Заполненное поле применится ко всем выбранным карточкам. Пустое —
              останется без изменений.
            </p>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              aria-label="Отмена"
              onClick={onClose}
              className="h-8 cursor-pointer rounded-md border border-[#2f3d59] px-3 text-[13px] text-[#9aa5b8] transition-colors hover:border-[#435680] hover:text-[#e8e2d5]"
            >
              Отмена
            </button>
            <button
              type="button"
              aria-label="Сохранить"
              disabled={!dirty || !dateValid}
              onClick={save}
              className={
                "h-8 rounded-md px-3 text-[13px] font-semibold transition-colors " +
                (dirty && dateValid
                  ? "cursor-pointer bg-[#d3bc8e] text-[#1c2333] hover:bg-[#e0cc9e]"
                  : "cursor-not-allowed bg-[#d3bc8e]/50 text-[#1c2333] opacity-50")
              }
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
