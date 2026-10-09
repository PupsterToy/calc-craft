import { splitCons } from "./format";
import { normalizeElementKey, normalizeRarity } from "./elements";
import type { Cell, CharacterRow, ShowcaseData, SourceType, TeamBlock } from "./types";

export function val(grid: Cell[][], r: number, c: number): Cell {
  const row = grid[r - 1];
  if (!row) return null;
  const v = row[c - 1];
  return v === undefined ? null : v;
}

export function cellText(v: Cell): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

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

export function toDate(v: Cell): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = cellText(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) {
    const [, a, b, y] = m;
    const tryDate = (mm: number, dd: number) =>
      new Date(Date.UTC(+y, mm - 1, dd)).toISOString().slice(0, 10);
    const md = tryDate(+a, +b);
    const [yy, mm2, dd2] = md.split("-").map(Number);
    if (yy === +y && mm2 === +a && dd2 === +b) return md;
    return tryDate(+b, +a);
  }
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return s;
}

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

export function isValidSlot(slot: string): boolean {
  const m = /^R(\d+)·C(\d+)$/.exec(slot);
  return !!m && Number(m[1]) >= 1 && Number(m[2]) >= 1;
}

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

export function erTextToNumber(v: Cell): number | null {
  const s = cellText(v);
  if (!s) return null;
  const m = /(\d+(?:[.,]\d+)?)/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parseBlock(
  grid: Cell[][],
  r: number,
  c: number,
  rowIndex: Map<number, number>,
  colIndex: Map<number, number>,
): TeamBlock {
  const bc = c - 8;

  const chars: CharacterRow[] = [];
  for (let i = 0; i < 4; i++) {
    const raw = cellText(val(grid, r + 1 + i, c));
    if (!raw || raw === "Total DPR") break;
    const { cons, base } = splitCons(raw);
    chars.push({
      name: base,
      constellation: cons,
      damage: toNum(val(grid, r + 1 + i, c + 2)),
      damage_share: toNum(val(grid, r + 1 + i, c + 3)),
      field_time_s: toNum(val(grid, r + 1 + i, c + 4)),
      weapon: cellText(val(grid, r + 4, bc + 2 * i)),
      artifact_set: cellText(val(grid, r + 5, bc + 2 * i)),
      er_requirement_p: erTextToNumber(val(grid, r + 6, bc + 2 * i)),
    });
  }

  let extra: string | null = null;
  for (let cc = c + 6; cc <= c + 9 && !extra; cc++) {
    for (let rr = r + 1; rr <= r + 8 && !extra; rr++) {
      extra = cellText(val(grid, rr, cc));
    }
  }

  return {
    slot: `R${rowIndex.get(r)}·C${colIndex.get(c)}`,
    anchor: `${colLetter(c)}${r}`,
    range: `${colLetter(bc)}${r}:${colLetter(c + 9)}${r + 8}`,
    team_name: chars.length ? chars.map((ch) => ch.name).join(" · ") : null,
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

export interface ParseGridOptions {
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
  const rows = [...new Set(anchors.map(([r]) => r))].sort((a, b) => a - b);
  const cols = [...new Set(anchors.map(([, c]) => c))].sort((a, b) => a - b);
  const rowIndex = new Map(rows.map((r, i) => [r, i + 1]));
  const colIndex = new Map(cols.map((c, i) => [c, i + 1]));

  const teams = anchors.map(([r, c]) => parseBlock(grid, r, c, rowIndex, colIndex));
  if (options.alignedRows === false) {
    for (const t of teams) {
      t.anchor = null;
      t.range = null;
    }
  }
  const valid = teams.filter((t) => isValidSlot(t.slot));
  const filled = valid.filter((t) => !t.is_empty);

  return {
    format: "showcase-simple/1",
    source,
    source_type: sourceType,
    sheet: "Showcase",
    extracted_at: new Date().toISOString().slice(0, 19),
    grid: { rows: rows.length, cols: cols.length },
    slots_total: valid.length,
    slots_filled: filled.length,
    teams: valid,
  };
}

export function migrateTeamBlock(team: TeamBlock): TeamBlock {
  for (const c of team.characters) {
    const legacyEr = (c as { er_requirement?: unknown }).er_requirement;
    if (legacyEr !== undefined) {
      if (c.er_requirement_p == null && legacyEr != null) {
        const n = erTextToNumber(legacyEr as Cell);
        if (n != null) c.er_requirement_p = n;
      }
      delete (c as { er_requirement?: unknown }).er_requirement;
    }
    if (c.constellation == null) {
      const { cons, base } = splitCons(c.name);
      if (cons) {
        c.name = base;
        c.constellation = cons;
      }
    }
    const el = normalizeElementKey(c.element);
    if (el === undefined) delete c.element;
    else c.element = el;
    const rar = normalizeRarity(c.rarity);
    if (rar === undefined) delete c.rarity;
    else c.rarity = rar;
  }
  return team;
}

export function migrateShowcaseData(data: ShowcaseData): ShowcaseData {
  for (const team of data.teams) migrateTeamBlock(team);
  return data;
}
