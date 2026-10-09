import type { TeamBlock } from "./types";
import { parseSlot } from "./format";

export type SortMode = "order" | "dpr" | "dps" | "time";

export type SortDir = "asc" | "desc";

export const SORTS: Record<SortMode, { label: string; defaultDir: SortDir }> = {
  order: { label: "по порядку", defaultDir: "asc" },
  dps: { label: "DPS", defaultDir: "desc" },
  dpr: { label: "DPR", defaultDir: "desc" },
  time: { label: "время ротации", defaultDir: "asc" },
};

export function slotOrder(t: TeamBlock): number {
  const s = parseSlot(t.slot);
  return s ? s.col * 100 + s.row : Number.MAX_SAFE_INTEGER;
}
