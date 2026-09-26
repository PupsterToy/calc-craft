import type { Cell, CharacterRow, ShowcaseData, SourceType, TeamBlock } from "./types";

/**
 * TypeScript-порт «простых» скриптов (scripts/simple_xlsx.py / simple_csv.py).
 * Извлекает ТОЛЬКО видимые значения листа: формулы, имена расчётных листов
 * и гиперссылки не читаются.
 *
 * Формат командного блока (якорь — ячейка 'Team' в (r, c); bc = c - 8):
 *   r+1..r+4   col c — имена персонажей; c+2 — DPR; c+3 — доля урона; c+4 — время на поле
 *   r+4/r+5/r+6 cols bc+0/2/4/6 — оружие / сет артефактов / требования ER
 *   r+5: col c+2 — Total DPR, col c+3 — дата;  r+6: col c — длит. ротации,
 *        col c+2 — DPS, col c+3 — автор;  r+7: col bc+1 — текст ротации
 *   r+1..r+8, cols c+6..c+9 — примечания (Extra Information)
 *
 * Сетка листа: слоты 6x6, шаг 19 колонок / 10 строк. Слот пуст ⇢ нет имён персонажей.
 */

/** Значение ячейки сетки (r, c), координаты 1-based. */
export function val(grid: Cell[][], r: number, c: number): Cell {
  const row = grid[r - 1];
  if (!row) return null;
  const v = row[c - 1];
  return v === undefined ? null : v;
}

/** Строка без краёв или null. */
export function cellText(v: Cell): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** Число или null. Понимает отформатированные строки CSV:
 *  '1,959,082' -> 1959082; '51.09%' -> 0.5109; '14.5s' -> 14.5. */
export function toNum(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean" || v === null) return null;
  const s = cellText(v);
  if (!s) return null;
  const pct = s.includes("%");
  const cleaned = s.replace(/,/g, "").replace(/%/g, "").replace(/s+$/, "").trim();
  if (!/^[+-]?\d*\.?\d+(e[+-]?\d+)?$/i.test(cleaned)) return null;
  const x = Number(cleaned);
  if (!Number.isFinite(x)) return null;
  return pct ? x / 100 : x;
}

/** ISO-дата из serial-числа Excel или строки ('9/17/2026', '17.09.2026', ...). */
export function toDate(v: Cell): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) {
    // serial Excel -> UTC-дата (46282 -> 2026-09-17)
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = cellText(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) {
    const [, a, b, y] = m;
    const tryDate = (mm: number, dd: number) =>
      new Date(Date.UTC(+y, mm - 1, dd)).toISOString().slice(0, 10);
    const md = tryDate(+a, +b); // сначала трактуем как месяц/день (формат Google)
    const [yy, mm2, dd2] = md.split("-").map(Number);
    if (yy === +y && mm2 === +a && dd2 === +b) return md;
    return tryDate(+b, +a); // иначе день/месяц
  }
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return s;
}

/** Буквенное обозначение колонки (1 -> A, 10 -> J, 29 -> AC). */
export function colLetter(c: number): string {
  let s = "";
  let n = c;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Все ячейки 'Team' — якоря командных блоков (координаты 1-based, сортировка). */
export function findTeamAnchors(grid: Cell[][]): Array<[number, number]> {
  const anchors: Array<[number, number]> = [];
  grid.forEach((row, ri) => {
    row.forEach((v, ci) => {
      if (typeof v === "string" && v.trim() === "Team") anchors.push([ri + 1, ci + 1]);
    });
  });
  anchors.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return anchors;
}

/** Один командный блок: только видимые значения. */
export function parseBlock(
  grid: Cell[][],
  r: number,
  c: number,
  rowIndex: Map<number, number>,
  colIndex: Map<number, number>,
): TeamBlock {
  const bc = c - 8; // колонка B блока

  const chars: CharacterRow[] = [];
  for (let i = 0; i < 4; i++) {
    const name = cellText(val(grid, r + 1 + i, c));
    if (!name || name === "Total DPR") break;
    chars.push({
      name,
      damage: toNum(val(grid, r + 1 + i, c + 2)),
      damage_share: toNum(val(grid, r + 1 + i, c + 3)),
      field_time_s: toNum(val(grid, r + 1 + i, c + 4)),
      weapon: cellText(val(grid, r + 4, bc + 2 * i)),
      artifact_set: cellText(val(grid, r + 5, bc + 2 * i)),
      er_requirement: cellText(val(grid, r + 6, bc + 2 * i)),
    });
  }

  let extra: string | null = null;
  for (let cc = c + 6; cc <= c + 9 && !extra; cc++) {
    for (let rr = r + 1; rr <= r + 8 && !extra; rr++) {
      extra = cellText(val(grid, rr, cc));
    }
  }

  const baseName = (n: string) => n.replace(/^C\d+\s+/, "");

  return {
    slot: `R${rowIndex.get(r)}·C${colIndex.get(c)}`,
    anchor: `${colLetter(c)}${r}`,
    range: `${colLetter(bc)}${r}:${colLetter(c + 9)}${r + 8}`,
    team_name: chars.length ? chars.map((ch) => baseName(ch.name)).join(" · ") : null,
    characters: chars,
    total_dpr: toNum(val(grid, r + 5, c + 2)),
    dps: toNum(val(grid, r + 6, c + 2)),
    rotation_time_s: toNum(val(grid, r + 6, c)),
    rotation: cellText(val(grid, r + 7, bc + 1)),
    extra_info: extra,
    author: cellText(val(grid, r + 6, c + 3)),
    date: toDate(val(grid, r + 5, c + 3)),
    is_empty: chars.length === 0,
  };
}

/** Сетка -> простой JSON (все слоты, включая пустые). */
export interface ParseGridOptions {
  /** false для источников, пропускающих пустые строки (gviz): абсолютные адреса
   *  якорей/диапазонов будут неверными, поэтому они не вычисляются. По умолчанию true. */
  alignedRows?: boolean;
}

export function parseShowcaseGrid(
  grid: Cell[][],
  source: string,
  sourceType: SourceType,
  options: ParseGridOptions = {},
): ShowcaseData {
  const anchors = findTeamAnchors(grid);
  if (anchors.length === 0) {
    throw new Error(
      "Якоря «Team» не найдены: это не Showcase-лист (или на листе нет ни одной команды).",
    );
  }
  // Метки слотов считаем ПО ПОЗИЦИИ ЯКОРЯ в сетке, а не по абсолютным координатам:
  // так не важно, есть ли над листом лишние строки (gviz-экспорт, например,
  // пропускает пустые строки — позиционный расчёт от этого не ломается).
  const rows = [...new Set(anchors.map(([r]) => r))].sort((a, b) => a - b);
  const cols = [...new Set(anchors.map(([, c]) => c))].sort((a, b) => a - b);
  const rowIndex = new Map(rows.map((r, i) => [r, i + 1]));
  const colIndex = new Map(cols.map((c, i) => [c, i + 1]));

  const teams = anchors.map(([r, c]) => parseBlock(grid, r, c, rowIndex, colIndex));
  if (options.alignedRows === false) {
    // строки сетки не соответствуют строкам листа (gviz) — адреса не вычисляем
    for (const t of teams) {
      t.anchor = null;
      t.range = null;
    }
  }
  const filled = teams.filter((t) => !t.is_empty);

  return {
    format: "showcase-simple/1",
    source,
    source_type: sourceType,
    sheet: "Showcase",
    extracted_at: new Date().toISOString().slice(0, 19),
    grid: { rows: rows.length, cols: cols.length },
    slots_total: teams.length,
    slots_filled: filled.length,
    teams,
  };
}
