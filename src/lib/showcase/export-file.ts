import * as XLSX from "xlsx";
import type { CharacterRow, TeamBlock } from "./types";
import { type ElementKey } from "./elements";
import { lookupCharacter } from "./character-db";
import { exportStrings, type ExportLang } from "./export-i18n";

export interface ExportCardData {
  team: TeamBlock;
  source?: string;
}

export type ExportFileFormat = "json" | "csv" | "xlsx";

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function defaultExportName(
  cards: ExportCardData[],
  kind: "file" | "image",
  opts?: { compact?: boolean; cols?: number; rows?: number },
): string {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}-${String(d.getMinutes()).padStart(2, "0")}`;
  const one = cards.length === 1;
  const teamPart = one
    ? abbrevTeam(cards[0].team.team_name) || cards[0].team.slot.replace(/·/g, "")
    : `Cards-${cards.length}`;
  const segs = [teamPart];
  if (kind === "image") {
    if (opts?.compact) segs.push("c");
    if (!one && opts?.cols && opts?.rows) segs.push(`${opts.cols}x${opts.rows}`);
  }
  segs.push(date, time);
  return sanitizeFileName(segs.join("_"));
}

function abbrevTeam(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .split(/\s*·\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.slice(0, 3))
    .join("");
}

export function sanitizeFileName(name: string): string {
  let s = name
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .replace(/^[. ]+/g, "");
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(s)) s = `_${s}`;
  if (s.length > 100) {
    s = s.slice(0, 100).trimEnd().replace(/[. ]+$/g, "");
  }
  return s;
}

export function exportJson(cards: ExportCardData[]): Blob {
  return new Blob([JSON.stringify(cards.map((c) => c.team), null, 2)], {
    type: "application/json;charset=utf-8",
  });
}

type Row = (string | number | null)[];

function elementLabel(c: CharacterRow, lang: ExportLang): string {
  const elKey = (c.element ?? lookupCharacter(c.name)?.element ?? null) as ElementKey | null;
  return elKey != null ? exportStrings(lang).elementLabel(elKey) : "";
}

function teamColumns(t: TeamBlock, source: string | undefined): Row {
  return [
    t.slot,
    t.team_name ?? "",
    source ?? "",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    t.dps,
    t.total_dpr,
    t.rotation_time_s,
    t.rotation ?? "",
    t.extra_info ?? "",
    t.author ?? "",
    t.date ?? "",
    null,
  ];
}

function buildTable(cards: ExportCardData[], lang: ExportLang = "ru"): Row[] {
  const strings = exportStrings(lang);
  const rows: Row[] = [[...strings.headers]];
  for (const { team, source } of cards) {
    const teamCols = teamColumns(team, source);
    const chars = [...team.characters].sort(
      (a, b) => (b.damage ?? -Infinity) - (a.damage ?? -Infinity),
    );
    for (const c of chars) {
      rows.push([
        ...teamCols.slice(0, 3),
        strings.typeCharacter,
        c.name,
        c.constellation ?? "",
        c.damage,
        c.damage_share,
        c.field_time_s,
        c.weapon ?? "",
        c.weapon_refinement ?? null,
        c.artifact_set ?? "",
        c.er_requirement_p,
        elementLabel(c, lang),
        c.rarity ?? "",
        ...teamCols.slice(15),
      ]);
    }
    const extra = team.extra_damage;
    if (extra && (extra.name || extra.damage != null)) {
      rows.push([
        ...teamCols.slice(0, 3),
        strings.typeExtraDamage,
        extra.name,
        "",
        extra.damage,
        extra.damage_percent ?? null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        ...teamCols.slice(15, 22),
        extra.note ?? "",
      ]);
    }
  }
  return rows;
}

function csvField(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(cards: ExportCardData[], lang: ExportLang = "ru"): Blob {
  const body = buildTable(cards, lang)
    .map((row) => row.map(csvField).join(","))
    .join("\r\n");
  return new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" });
}

const COL_WIDTHS = [8, 22, 18, 11, 16, 9, 11, 7, 8, 16, 7, 20, 10, 9, 8, 11, 11, 9, 32, 32, 14, 11, 24];

export function exportXlsx(cards: ExportCardData[], lang: ExportLang = "ru"): Blob {
  const ws = XLSX.utils.aoa_to_sheet(buildTable(cards, lang));
  ws["!cols"] = COL_WIDTHS.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, exportStrings(lang).sheetName);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadExportFile(
  cards: ExportCardData[],
  format: ExportFileFormat,
  base: string,
  lang: ExportLang = "ru",
): void {
  if (format === "json") downloadBlob(exportJson(cards), `${base}.json`);
  else if (format === "csv") downloadBlob(exportCsv(cards, lang), `${base}.csv`);
  else downloadBlob(exportXlsx(cards, lang), `${base}.xlsx`);
}
