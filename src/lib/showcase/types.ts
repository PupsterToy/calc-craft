/** Типы «простого» формата showcase-simple/1 (только видимые значения листа). */

/** Значение ячейки сетки: как в xlsx (число/строка/булево/serial-дата) или строка из CSV. */
export type Cell = string | number | boolean | null;

export interface CharacterRow {
  name: string;
  damage: number | null;
  damage_share: number | null;
  field_time_s: number | null;
  weapon: string | null;
  artifact_set: string | null;
  er_requirement: string | null;
}

export interface TeamBlock {
  /** Метка слота в сетке листа, напр. "R2·C1" (ряд·колонка). */
  slot: string;
  /** Адрес якоря «Team», напр. "J14" (для xlsx; в CSV может быть null). */
  anchor: string | null;
  /** Диапазон карточки, напр. "B14:S22" (для xlsx; в CSV может быть null). */
  range: string | null;
  /** Имя команды, собранное из видимых имён персонажей (расчётный лист недоступен). */
  team_name: string | null;
  characters: CharacterRow[];
  total_dpr: number | null;
  dps: number | null;
  rotation_time_s: number | null;
  rotation: string | null;
  extra_info: string | null;
  author: string | null;
  date: string | null;
  is_empty: boolean;
}

export type SourceType = "xlsx" | "csv" | "demo";

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
