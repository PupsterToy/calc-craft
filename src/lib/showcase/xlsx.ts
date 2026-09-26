import * as XLSX from "xlsx";
import type { Cell } from "./types";

export const SHEET_CANDIDATES = ["Showcase", "Showcase 2", "Showcase 3"];

/** Открытая xlsx-книга: имена листов + извлечение сетки значений по имени листа. */
export interface WorkbookSheets {
  names: string[];
  getGrid(sheetName: string): Cell[][];
}

/**
 * Читает xlsx (ArrayBuffer) в сетки «сырых» значений.
 * cellDates не включаем: даты остаются serial-числами Excel —
 * парсер сам конвертирует их в ISO без сюрпризов с часовыми поясами.
 * blankrows: true — пустые строки сохраняются, выравнивание 1:1 как на листе.
 */
export function readWorkbook(buf: ArrayBuffer): WorkbookSheets {
  const wb = XLSX.read(buf, { type: "array" });
  return {
    names: wb.SheetNames,
    getGrid(sheetName: string): Cell[][] {
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error(`Лист «${sheetName}» не найден в книге`);
      return XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      }) as Cell[][];
    },
  };
}

/** Автовыбор листа: Showcase / Showcase 2 / Showcase 3, иначе null. */
export function pickShowcaseSheet(names: string[]): string | null {
  for (const cand of SHEET_CANDIDATES) {
    if (names.includes(cand)) return cand;
  }
  return null;
}
