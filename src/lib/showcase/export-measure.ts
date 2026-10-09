import type { TeamBlock } from "./types";
import {
  charDamageShare,
  characterGear,
  extraDamageOrNull,
  extraDamagePercent,
  extraScaleVisible,
  rotationArrows,
  sortedCharacters,
  teamDisplayName,
} from "./display";
import { fmt1, fmtInt } from "./format";

export const EXPORT_PAGE_GAP = 16;
export const EXPORT_CARD_W = {
  cards: (1104 - EXPORT_PAGE_GAP) / 2,
  compact: (1104 - EXPORT_PAGE_GAP * 2) / 3,
} as const;

export function exportStageWidth(
  kind: "cards" | "compact",
  cols: number,
  padLeft: number,
  padRight: number,
): number {
  const cardW = kind === "compact" ? EXPORT_CARD_W.compact : EXPORT_CARD_W.cards;
  return padLeft + cols * cardW + (cols - 1) * EXPORT_PAGE_GAP + padRight;
}

let ctx2d: CanvasRenderingContext2D | null = null;
let bodyFontFamily = "";

function metricsCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!ctx2d) {
    const c = document.createElement("canvas");
    c.width = 0;
    c.height = 0;
    ctx2d = c.getContext("2d");
    if (ctx2d && !bodyFontFamily) {
      bodyFontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
    }
  }
  return ctx2d;
}

function textWidth(text: string, weight: number, size: number): number {
  const ctx = metricsCtx();
  if (!ctx) return text.length * size * 0.56;
  ctx.font = `${weight} ${size}px ${bodyFontFamily}`;
  return ctx.measureText(text).width;
}

function wrapLines(text: string, width: number, weight: number, size: number): number {
  if (width <= 0) return 1;
  const spaceW = textWidth(" ", weight, size);
  let lines = 1;
  let x = 0;
  const words = text.split(/\s+/).filter(Boolean);
  for (const word of words) {
    const parts = word.split(/(?<=-)/).filter(Boolean);
    let firstPart = true;
    for (const part of parts) {
      const pw = textWidth(part, weight, size);
      if (firstPart) {
        const lead = x > 0 ? spaceW : 0;
        if (x > 0 && x + lead + pw > width) {
          lines++;
          x = pw;
        } else {
          x += lead + pw;
        }
        firstPart = false;
      } else if (x + pw > width) {
        lines++;
        x = pw;
      } else {
        x += pw;
      }
    }
  }
  return lines;
}

function preLineLines(text: string, width: number, weight: number, size: number): number {
  return text
    .split("\n")
    .reduce((sum, seg) => sum + wrapLines(seg, width, weight, size), 0);
}

function largeCardHeight(team: TeamBlock, pins: ExportPinsModel, sm: boolean): number {
  const pad = sm ? 20 : 16;
  const content = 544 - 2 - pad * 2;
  const chars = sortedCharacters(team);
  const extra = extraDamageOrNull(team);
  const scaleOn = extraScaleVisible(team);

  let h = 2 + pad * 2;

  if (pins.dispTeam) {
    const nameLines = Math.max(
      1,
      wrapLines(teamDisplayName(team), content, 600, sm ? 16 : 15),
    );
    h += (sm ? 22 : 21) * nameLines + 12;
  }

  let col2 = 0;
  for (const c of chars) {
    col2 = Math.max(col2, textWidth(fmtInt(c.damage), 600, 13));
    col2 = Math.max(col2, textWidth(shareLine(team, c), 400, 11));
  }
  if (extra) {
    col2 = Math.max(col2, textWidth(fmtInt(extra.damage), 600, 13));
    const pct = extraDamagePercent(team);
    if (pct != null) col2 = Math.max(col2, textWidth(`${pct.toFixed(1)}%`, 400, 11));
  }
  const col1 = Math.max(0, content - 12 - col2);

  const hideTeam = !pins.dispTeam;
  chars.forEach((c, i) => {
    const gear = characterGear(c);
    const r5 = gear
      ? 17 * Math.max(1, wrapLines(gear, col1, 400, 11))
      : 17;
    h += (i === 0 && hideTeam ? 0 : 1) + 16 + 13 + 9 + 6 + 8 + r5;
  });

  if (extra) {
    const pct = extraDamagePercent(team);
    const tailLines =
      extra.note || pct != null
        ? 17 * Math.max(1, extra.note ? wrapLines(extra.note, col1, 400, 11) : 1)
        : 0;
    h += 1 + 16 + (scaleOn ? 13 + 9 + 6 + 8 + tailLines : 13 + 6 + tailLines);
  }

  h += 10;

  if (pins.dispDps) h += 19 + 10;
  h += 8 + 12;

  if (team.rotation) {
    const body = rotationArrows(team.rotation);
    let rotLines = 0;
    for (const seg of body.split("\n")) {
      if (seg.trim() === "") {
        rotLines += 1;
        continue;
      }
      let lines = 1;
      let x = 0;
      for (const w of seg.split(" → ").filter(Boolean)) {
        const ww = textWidth(w, 400, 12.5);
        const lead = x > 0 ? 22 : 0;
        if (x > 0 && x + lead + ww > content - 24) {
          lines++;
          x = ww;
        } else {
          x += lead + ww;
        }
      }
      rotLines += lines;
    }
    h += 16 + 16 + 4 + 20 * rotLines;
  }

  if (team.extra_info) {
    h += 12 + 1 + 8 + 19 * preLineLines(team.extra_info, content, 400, 11.5);
  }

  if (pins.showFooter) h += 16 + 17;

  return h;
}

function shareLine(team: TeamBlock, c: (typeof team)["characters"][number]): string {
  return (
    `${charDamageShare(team, c).toFixed(1)}%` +
    (c.field_time_s != null ? ` · ${fmt1(c.field_time_s)}с` : "")
  );
}

function compactCardHeight(team: TeamBlock, pins: ExportPinsModel): number {
  const chars = sortedCharacters(team);
  const extra = extraDamageOrNull(team);
  let h = 2 + 32;
  chars.forEach((_, i) => {
    h += (i === 0 ? 0 : 1) + 12 + 13 + 2 + 16;
  });
  if (extra) h += 1 + 12 + 13 + 2 + 16;
  h += 8 + (pins.dispDps ? 17 : 0) + 8 + 8;
  if (pins.showFooter) h += 12 + 17;
  return h;
}

export interface ExportPinsModel {
  dispTeam: boolean;
  dispDps: boolean;
  showFooter: boolean;
}

export interface ExportStageMeasureInputs {
  cards: readonly { team: TeamBlock }[];
  kind: "cards" | "compact";
  cols: number;
  rows: number;
  padTop: number;
  padBottom: number;
  padLeft: number;
  padRight: number;
  pins: ExportPinsModel;
  sm: boolean;
}

export interface ExportStageMeasure {
  w: number;
  h: number;
  wInt: number;
  hInt: number;
  rowHeights: number[];
  cardHeights: number[];
}

export function measureExportStage(inp: ExportStageMeasureInputs): ExportStageMeasure {
  const w = exportStageWidth(inp.kind, inp.cols, inp.padLeft, inp.padRight);
  const cardHeights = inp.cards.map((c) =>
    inp.kind === "compact"
      ? compactCardHeight(c.team, inp.pins)
      : largeCardHeight(c.team, inp.pins, inp.sm),
  );
  const rowHeights: number[] = [];
  for (let r = 0; r < inp.rows; r++) {
    let rowH = 0;
    for (let i = r * inp.cols; i < Math.min((r + 1) * inp.cols, cardHeights.length); i++) {
      rowH = Math.max(rowH, cardHeights[i]);
    }
    rowHeights.push(rowH);
  }
  const h =
    inp.padTop +
    rowHeights.reduce((a, b) => a + b, 0) +
    (inp.rows - 1) * EXPORT_PAGE_GAP +
    inp.padBottom;
  return {
    w,
    h,
    wInt: Math.round(w),
    hInt: Math.round(h),
    rowHeights,
    cardHeights,
  };
}
