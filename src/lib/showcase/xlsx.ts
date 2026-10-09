import * as XLSX from "xlsx";
import type { Cell } from "./types";

export const SHEET_CANDIDATES = ["Showcase", "Showcase 2", "Showcase 3"];

export interface WorkbookSheets {
  names: string[];
  getGrid(sheetName: string): Cell[][];
}

export function readWorkbook(buf: ArrayBuffer): WorkbookSheets {
  const wb = XLSX.read(buf, { type: "array" });
  return {
    names: wb.SheetNames,
    getGrid(sheetName: string): Cell[][] {
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error(`Лист «${sheetName}» не найден в книге`);
      return XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
        defval: null,
        blankrows: true,
      }) as Cell[][];
    },
  };
}

export function pickShowcaseSheet(names: string[]): string | null {
  for (const cand of SHEET_CANDIDATES) {
    if (names.includes(cand)) return cand;
  }
  return null;
}
