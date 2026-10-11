"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, EyeOff, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tip } from "@/components/showcase/tip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sourceName, type CachedSource } from "@/lib/showcase/cache";
import { escapeHtml } from "@/lib/showcase/format";
import type { WorkbookSheets } from "@/lib/showcase/xlsx";

export interface NoticeInfo {
  text: string;
  kind: "ok" | "deleted";
  slot?: string;
}

interface SourcePanelProps {
  onFiles: (files: File[]) => void;
  onLink: (url: string) => Promise<boolean>;
  onLinkCleared: () => void;
  onDemo: () => void;
  onHideDemo: () => void;
  demoHidden: boolean;
  onPickSheet: (name: string) => void;
  onRemoveCached: (key: string) => void;
  busy: string | null;
  error: string | null;
  notice: NoticeInfo | null;
  onRestoreTrash: () => void;
  sourceLabel: string;
  pendingSheets: { sheets: WorkbookSheets; file: string }[];
  cachedSources: CachedSource[];
  activeKeys: string[];
  hoverSourceKey: string | null;
}

export function SourcePanel({
  onFiles,
  onLink,
  onLinkCleared,
  onDemo,
  onHideDemo,
  demoHidden,
  onPickSheet,
  onRemoveCached,
  busy,
  error,
  notice,
  onRestoreTrash,
  sourceLabel,
  pendingSheets,
  cachedSources,
  activeKeys,
  hoverSourceKey,
}: SourcePanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLTextAreaElement>(null);
  const [link, setLink] = useState("");
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    const el = linkRef.current;
    if (!el) return;
    if (!el.value) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 72)}px`;
  }, [link]);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      e.preventDefault();
      onFiles([...files]);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onFiles]);
  async function submitLink() {
    const url = link.trim();
    if (!url) return;
    if (await onLink(url)) setLink("");
  }
  async function pasteLink() {
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const el = linkRef.current;
    if (!el) return;
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      setLink(el.value.slice(0, start) + text + el.value.slice(end));
      requestAnimationFrame(() => {
        try {
          el.focus({ preventScroll: true });
          el.setSelectionRange(start + text.length, start + text.length);
        } catch {
        }
      });
    } catch {
    }
  }

  const [tipKey, setTipKey] = useState<string | null>(null);
  const tipTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!tipKey) return;
    const onDoc = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-cache-chip]")) setTipKey(null);
    };
    document.addEventListener("pointerdown", onDoc);
    tipTimerRef.current = window.setTimeout(() => setTipKey(null), 5000);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      if (tipTimerRef.current) window.clearTimeout(tipTimerRef.current);
    };
  }, [tipKey]);

  return (
    <section
      aria-label="Загрузка данных"
      className="rounded-xl border border-[#2f3d59] bg-[#1d2739] p-4 sm:p-5"
    >
      <p className="mb-4 text-[13px] leading-[20px] text-[#9aa5b8]">
        На данный момент обрабатываются только таблицы по шаблону Martin/Golden,
        строго с листа «Showcase»:{" "}
        <a
          href="https://docs.google.com/spreadsheets/d/1I8-CTerpK5_latJd6eWehWfm6KIY3d3aBHicGwslxq8/edit?gid=1280080482#gid=1280080482"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-2 transition-colors hover:text-[#d3bc8e] break-all"
        >
          https://docs.google.com/spreadsheets/d/1I8-CTerpK5_latJd6eWehWfm6KIY3d3aBHicGwslxq8/edit?gid=1280080482#gid=1280080482
        </a>
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div
          role="button"
          tabIndex={0}
          aria-label="Загрузить файлы xlsx или csv"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const files = [...(e.dataTransfer.files ?? [])];
            if (files.length > 0) onFiles(files);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-center transition-colors ${
            dragOver
              ? "border-[#a68b5c] bg-[#24304a]"
              : "border-[#3d4d6d] bg-black/15 hover:border-[#a68b5c]"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length > 0) onFiles(files);
              e.target.value = "";
            }}
          />
          <p className="text-[13.5px] leading-[20px] text-[#e8e2d5]">
            Перетащите сюда файл <b className="text-[#d3bc8e]">.xlsx</b> или{" "}
            <b className="text-[#d3bc8e]">.csv</b>
          </p>
          <p className="text-[11.5px] leading-[17px] text-[#9aa5b8]">
            либо <span className="underline decoration-dotted underline-offset-2">выберите файлы вручную</span>{" "}
            или вставьте из буфера — <b className="text-[#d3bc8e]">Ctrl+V</b>
          </p>
        </div>

        <div className="flex flex-col justify-center gap-2">
          <Label htmlFor="sheet-link" className="text-[13px] leading-[20px] text-[#e8e2d5]">
            Ссылка на лист Google-таблицы
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
            {link === "" && (
              <Tip label="Вставить из буфера">
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => void pasteLink()}
                  aria-label="Вставить ссылку из буфера"
                  className="absolute top-[9px] right-2 flex h-[18px] w-[18px] items-center justify-center text-[#9aa5b8] transition-colors hover:text-[#d3bc8e] [@media(pointer:coarse)]:hidden!"
                >
                  <ClipboardPaste className="size-3.5 -scale-x-100" aria-hidden />
                </button>
              </Tip>
            )}
            <textarea
              ref={linkRef}
              id="sheet-link"
              rows={1}
              aria-placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=…"
              value={link}
              onChange={(e) => {
                const v = e.target.value;
                setLink(v);
                if (!v.trim()) onLinkCleared();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  if (link) {
                    setLink("");
                    onLinkCleared();
                  } else {
                    e.currentTarget.blur();
                  }
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitLink();
                }
              }}
              className="block min-h-9 w-full resize-none rounded-md border border-[#2f3d59] bg-[#141c2b] px-3 py-2 pr-8 [touch-action:pan-y_pinch-zoom] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden text-[13px] leading-[18px] text-[#e8e2d5] focus-visible:border-[#a68b5c] focus-visible:outline-none"
            />
            {link === "" && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-3 right-8 flex items-center truncate text-[13px] leading-[18px] text-[#6b7893]"
              >
                https://docs.google.com/spreadsheets/d/…/edit#gid=…
              </span>
            )}
            {link.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setLink("");
                  onLinkCleared();
                }}
                aria-label="Очистить ссылку"
                className="absolute top-[9px] right-2 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[#2f3d59] text-[#9aa5b8] transition-colors after:absolute after:-inset-3 after:content-[''] hover:border-[#435680] hover:text-[#e8e2d5]"
              >
                <X className="h-[12px] w-[12px]" aria-hidden />
              </button>
            )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Tip label="Загрузить таблицу">
                <Button
                  onClick={() => void submitLink()}
                  disabled={busy != null}
                  aria-label="Загрузить"
                  className="shrink-0 border border-[#a68b5c] bg-[#24304a] text-[#d3bc8e] hover:bg-[#2b3856]"
                >
                  <Upload className="h-4 w-4" aria-hidden />
                </Button>
              </Tip>
            </div>
          </div>
          <p className="text-[11px] leading-[18px] text-[#9aa5b8]">
            Таблица должна быть доступна по ссылке («Все, у кого есть ссылка — Читатель»).
            Фрагмент <code className="text-[#d3bc8e]">#gid=…</code> в ссылке указывает нужный лист.
            Лист скачивается в CSV и разбирается прямо в браузере.
          </p>
        </div>
      </div>

      {pendingSheets.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-[#a68b5c]/50 bg-[#24304a] p-3">
          <span className="text-[13px] text-[#e8e2d5]">
            В книге «{pendingSheets[0].file}» нет листа «Showcase». Выберите лист вручную:
            {pendingSheets.length > 1 && (
              <span className="text-[#9aa5b8]"> (ещё в очереди: {pendingSheets.length - 1})</span>
            )}
          </span>
          <Select onValueChange={(v) => onPickSheet(v)}>
            <SelectTrigger className="w-56 border-[#2f3d59] bg-[#141c2b] text-[13px] text-[#e8e2d5]">
              <SelectValue placeholder="Лист…" />
            </SelectTrigger>
            <SelectContent className="max-h-72 overflow-y-auto border-[#2f3d59] bg-[#1d2739] text-[#e8e2d5]">
              {pendingSheets[0].sheets.names.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p data-source-label className="text-[12.5px] leading-[19px] text-[#9aa5b8]">
          Текущий источник:{" "}
          <b
            data-src-label
            suppressHydrationWarning
            className="font-semibold text-[#e8e2d5]"
            dangerouslySetInnerHTML={{ __html: escapeHtml(sourceLabel) }}
          />
          {notice?.kind === "deleted" ? (
            <>
              <span className="text-[#f27b7b]"> · </span>
              <Tip label="Восстановить">
                <button
                  type="button"
                  onClick={onRestoreTrash}
                  aria-label={`Восстановить ${notice.slot} из корзины`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[0.35rem] border border-[#7c3d3d] bg-[#291818] px-1.5 py-0.5 text-[11.5px] leading-[17px] text-[#e5887b] transition-colors hover:border-[#904747] hover:bg-[#331e1e]"
                >
                  <span className="truncate">{notice.slot}</span>
                  <span className="shrink-0 text-[#c56666]" aria-hidden>
                    ↺
                  </span>
                </button>
              </Tip>
              <span className="text-[#f27b7b]"> {notice.text}</span>
            </>
          ) : (
            <span
              data-notice-line
              suppressHydrationWarning
              className="text-[#a6c96a]"
              dangerouslySetInnerHTML={{
                __html: notice ? " · " + escapeHtml(notice.text) : "",
              }}
            />
          )}
        </p>
        <div className="flex items-center gap-1">
          {!demoHidden && (
            <Tip label="Скрыть демо-данные (показ вернётся кнопкой ↺)">
              <Button
                data-demo-hide
                variant="ghost"
                size="sm"
                onClick={onHideDemo}
                aria-label="Скрыть демо-данные"
                className="px-2.5 text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#d3bc8e]"
              >
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </Tip>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDemo}
            className="text-[12.5px] text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#d3bc8e]"
          >
            ↺ Демо-данные
          </Button>
        </div>
      </div>

      <div data-cache-row-slot>
        {cachedSources.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] leading-[17px] text-[#9aa5b8]">Кэш таблиц:</span>
          {cachedSources.map((s) => {
            const on = activeKeys.includes(s.key);
            const hi = hoverSourceKey === s.key;
            return (
              <span key={s.key} className="relative" data-cache-chip>
                <span
                  className={
                    "flex max-w-72 items-stretch overflow-hidden rounded text-[11.5px] leading-[17px] text-[#e8e2d5] transition-colors " +
                    (on ? "bg-[#2f3d59]" : "bg-[#24304a] hover:bg-[#2f3d59]") +
                    (hi ? " ring-1 ring-[#a68b5c]" : "")
                  }
                >
                  <button
                    type="button"
                    onClick={() => setTipKey(tipKey === s.key ? null : s.key)}
                    aria-label={`Источник: ${sourceName(s)} — информация`}
                    className="min-w-0 max-w-56 truncate px-1.5 py-0.5 text-left"
                  >
                    {sourceName(s)}
                  </button>
                  <Tip label="Удалить источник и кэша">
                    <button
                      type="button"
                      onClick={() => onRemoveCached(s.key)}
                      aria-label={`${sourceName(s)} — убрать из кэша`}
                      className="flex items-center border-l border-black/25 px-1 py-0.5 text-[#9aa5b8] transition-colors hover:text-[#e8e2d5]"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </Tip>
                </span>
                {tipKey === s.key && (
                  <span
                    role="tooltip"
                    className="absolute bottom-full left-0 z-50 mb-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-[#2f3d59] bg-[#1d2739] px-2.5 py-1.5 text-left text-[11.5px] leading-snug text-[#e8e2d5] shadow-md shadow-black/25 animate-in fade-in slide-in-from-bottom-2 animation-duration-150 will-change-transform"
                  >
                    <b className="block truncate font-semibold">{sourceName(s)}</b>
                    <span className="mt-0.5 block truncate text-[#9aa5b8]">{s.label}</span>
                    <span className="mt-0.5 block text-[#9aa5b8]">
                      Команд: {s.data.slots_filled} · {s.type}
                    </span>
                  </span>
                )}
              </span>
            );
          })}
        </div>
        )}
      </div>

      <div aria-live="polite" className="mt-2 space-y-2">
        {busy && (
          <p className="flex items-center gap-2 text-[13px] leading-[20px] text-[#d3bc8e]">
            <span
              aria-hidden
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#a68b5c] border-t-transparent"
            />
            {busy}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-[#8a5058] bg-[#2a2126] px-3.5 py-2.5"
          >
            <p className="text-[13px] leading-[19px] font-semibold text-[#e8a7a7]">
              Не удалось загрузить данные
            </p>
            <p className="mt-1 text-[12.5px] leading-[19px] whitespace-pre-line text-[#cba3a3]">
              {error}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
