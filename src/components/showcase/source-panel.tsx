"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { WorkbookSheets } from "@/lib/showcase/xlsx";

interface SourcePanelProps {
  onFile: (file: File) => void;
  onLink: (url: string) => void;
  onDemo: () => void;
  onPickSheet: (name: string) => void;
  busy: string | null;
  error: string | null;
  notice: string | null;
  sourceLabel: string;
  pendingSheets: WorkbookSheets | null;
}

export function SourcePanel({
  onFile,
  onLink,
  onDemo,
  onPickSheet,
  busy,
  error,
  notice,
  sourceLabel,
  pendingSheets,
}: SourcePanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [dragOver, setDragOver] = useState(false);

  return (
    <section
      aria-label="Источник данных"
      className="rounded-xl border border-[#2f3d59] bg-[#1d2739] p-4 sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. Загрузка файла (.xlsx / .csv) */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Загрузить файл xlsx или csv"
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
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
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
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <p className="text-[13.5px] text-[#e8e2d5]">
            Перетащите сюда файл <b className="text-[#d3bc8e]">.xlsx</b> или{" "}
            <b className="text-[#d3bc8e]">.csv</b>
          </p>
          <p className="text-[11.5px] text-[#9aa5b8]">
            либо{" "}
            <span className="underline decoration-dotted underline-offset-2">
              выберите файл вручную
            </span>
          </p>
          <p className="mt-1 text-[11px] text-[#9aa5b8]">
            xlsx — точные числа · csv — значения как на листе
          </p>
        </div>

        {/* 2. Ссылка на лист Google-таблицы */}
        <div className="flex flex-col justify-center gap-2">
          <Label htmlFor="sheet-link" className="text-[13px] text-[#e8e2d5]">
            Ссылка на лист Google-таблицы
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="sheet-link"
              type="url"
              inputMode="url"
              placeholder="https://docs.google.com/spreadsheets/d/…#gid=…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && link.trim()) onLink(link.trim());
              }}
              className="min-w-40 flex-1 border-[#2f3d59] bg-[#141c2b] text-[13px] text-[#e8e2d5] placeholder:text-[#6b7893] focus-visible:border-[#a68b5c] focus-visible:ring-0 focus-visible:shadow-none"
            />
            <Button
              onClick={() => link.trim() && onLink(link.trim())}
              disabled={busy != null}
              className="shrink-0 border border-[#a68b5c] bg-[#24304a] text-[#d3bc8e] hover:bg-[#2b3856]"
            >
              Загрузить
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-[#9aa5b8]">
            Таблица должна быть доступна по ссылке («Все, у кого есть ссылка — Читатель»).
            Фрагмент <code className="text-[#d3bc8e]">#gid=…</code> в ссылке указывает нужный лист.
            Лист скачивается в CSV и разбирается прямо в браузере.
          </p>
        </div>
      </div>

      {/* Выбор листа, если в xlsx нет листа Showcase* */}
      {pendingSheets && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-[#a68b5c]/50 bg-[#24304a] p-3">
          <span className="text-[13px] text-[#e8e2d5]">
            В книге нет листа «Showcase». Выберите лист вручную:
          </span>
          <Select onValueChange={(v) => onPickSheet(v)}>
            <SelectTrigger className="w-56 border-[#2f3d59] bg-[#141c2b] text-[13px] text-[#e8e2d5]">
              <SelectValue placeholder="Лист…" />
            </SelectTrigger>
            <SelectContent className="max-h-72 overflow-y-auto border-[#2f3d59] bg-[#1d2739] text-[#e8e2d5]">
              {pendingSheets.names.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Статус */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-[#9aa5b8]">
          Текущий источник:{" "}
          <b className="font-semibold text-[#e8e2d5]">{sourceLabel}</b>
          {notice && <span className="text-[#a6c96a]"> · {notice}</span>}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDemo}
          className="text-[12.5px] text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#d3bc8e]"
        >
          ↺ Демо-данные
        </Button>
      </div>

      <div aria-live="polite" className="mt-2 space-y-2">
        {busy && (
          <p className="flex items-center gap-2 text-[13px] text-[#d3bc8e]">
            <span
              aria-hidden
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#a68b5c] border-t-transparent"
            />
            {busy}
          </p>
        )}
        {error && (
          <Alert variant="destructive" className="text-[13px]">
            <AlertTitle>Не удалось загрузить данные</AlertTitle>
            <AlertDescription className="leading-relaxed whitespace-pre-line">
              {error}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </section>
  );
}
