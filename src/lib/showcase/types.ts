import type { ElementKey } from "./elements";

export type Cell = string | number | boolean | null;

export interface CharacterRow {
  name: string;
  constellation?: string | null;
  damage: number | null;
  damage_share: number | null;
  field_time_s: number | null;
  weapon: string | null;
  weapon_refinement?: number | null;
  artifact_set: string | null;
  er_requirement_p: number | null;
  element?: ElementKey | null;
  rarity?: 4 | 5 | null;
}

export interface ExtraDamage {
  name: string;
  damage: number | null;
  note: string | null;
  damage_percent?: number | null;
  recalc_total?: boolean;
  scale_visible?: boolean;
}

export interface TeamBlock {
  slot: string;
  anchor: string | null;
  range: string | null;
  team_name: string | null;
  characters: CharacterRow[];
  extra_damage?: ExtraDamage | null;
  total_dpr: number | null;
  dps: number | null;
  rotation_time_s: number | null;
  rotation: string | null;
  extra_info: string | null;
  author: string | null;
  date: string | null;
  is_empty: boolean;
}

export type SourceType = "xlsx" | "csv" | "demo" | "favorites";

export interface ShowcaseData {
  format: string;
  source: string;
  source_type: SourceType;
  sheet: string;
  extracted_at: string;
  grid: { rows: number; cols: number };
  slots_total: number;
  slots_filled: number;
  teams: TeamBlock[];
}
