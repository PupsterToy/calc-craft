import { charBaseName } from "./format";
import type { TeamBlock } from "./types";

type Character = TeamBlock["characters"][number];

export const CHAR_COLORS = ["#e37b87", "#9f80e1", "#7fc0d6", "#accb79", "#f2a3a3", "#f2d16b"];

export function characterGear(c: Character): string {
  const parts: string[] = [];
  if (c.weapon) {
    parts.push(
      c.weapon_refinement != null && c.weapon_refinement >= 1 && c.weapon_refinement <= 5
        ? `${c.weapon} R${c.weapon_refinement}`
        : c.weapon,
    );
  }
  if (c.artifact_set) parts.push(c.artifact_set);
  if (c.er_requirement_p != null) parts.push(`${c.er_requirement_p}% ER`);
  return parts.join(" · ");
}

export const EXTRA_COLOR = "#d3caaf";

const sortedCache = new WeakMap<TeamBlock, Character[]>();

export function sortedCharacters(team: TeamBlock): Character[] {
  let sorted = sortedCache.get(team);
  if (!sorted) {
    sorted = [...team.characters].sort(
      (a, b) => (b.damage ?? -Infinity) - (a.damage ?? -Infinity),
    );
    sortedCache.set(team, sorted);
  }
  return sorted;
}

const damageSumCache = new WeakMap<TeamBlock, number>();
function teamDamageSum(team: TeamBlock): number {
  let sum = damageSumCache.get(team);
  if (sum === undefined) {
    sum = team.characters.reduce((acc, c) => acc + (c.damage ?? 0), 0);
    damageSumCache.set(team, sum);
  }
  return sum;
}

export function extraRecalcOn(team: TeamBlock): boolean {
  return team.extra_damage?.recalc_total !== false;
}

export function extraScaleVisible(team: TeamBlock): boolean {
  return team.extra_damage?.scale_visible !== false;
}

function teamCountedTotal(team: TeamBlock): number {
  if (extraRecalcOn(team)) {
    return teamDamageSum(team) + (team.extra_damage?.damage ?? 0);
  }
  const tpr = team.total_dpr;
  return tpr != null && tpr > 0 ? tpr : teamDamageSum(team);
}

function teamBarBase(team: TeamBlock): number {
  return extraRecalcOn(team) ? teamCountedTotal(team) : teamDamageSum(team);
}

export function extraDamageShare(team: TeamBlock): number {
  if (team.extra_damage == null) return 0;
  const total = teamBarBase(team);
  return total > 0 ? ((team.extra_damage.damage ?? 0) / total) * 100 : 0;
}

export function extraDamagePercent(team: TeamBlock): number | null {
  const e = team.extra_damage;
  if (e == null) return null;
  if (extraRecalcOn(team)) return extraDamageShare(team);
  return e.damage_percent ?? null;
}

export function extraDamageOrNull(team: TeamBlock): TeamBlock["extra_damage"] {
  const e = team.extra_damage;
  return e != null && e.name.trim() !== "" && e.damage != null ? e : null;
}

export function teamDisplayDpr(team: TeamBlock): number | null {
  if (team.extra_damage != null && extraRecalcOn(team)) {
    return teamCountedTotal(team);
  }
  return team.total_dpr;
}

export function teamDisplayDps(team: TeamBlock): number | null {
  if (team.extra_damage != null && extraRecalcOn(team)) {
    const dpr = teamDisplayDpr(team);
    const t = team.rotation_time_s;
    if (dpr != null && t != null && t > 0) return dpr / t;
  }
  return team.dps;
}

export function charDamageShare(team: TeamBlock, c: Character): number {
  if (team.extra_damage != null) {
    const total = extraRecalcOn(team)
      ? teamCountedTotal(team)
      : teamDamageSum(team);
    return total > 0 ? ((c.damage ?? 0) / total) * 100 : 0;
  }
  if (c.damage_share != null) return c.damage_share * 100;
  const tpr = team.total_dpr;
  const total = tpr != null && tpr > 0 ? tpr : teamDamageSum(team);
  return total > 0 ? ((c.damage ?? 0) / total) * 100 : 0;
}

export function rotationArrows(s: string): string {
  const sep = /\s*(?:->|=>|[,;\-–—>→])+\s*/g;
  const one = (line: string): string => {
    if (/(?:->|=>|[,;\-–—>→])/.test(line)) return line.replace(sep, " → ").trim();
    return line.split(/\s+/).filter(Boolean).join(" → ");
  };
  return s.split("\n").map(one).join("\n");
}

const nameCache = new WeakMap<TeamBlock, string>();

export function teamDisplayName(team: TeamBlock): string {
  const name = team.team_name ?? "";
  const cached = nameCache.get(team);
  if (cached !== undefined) return cached;

  let result = name;
  const sorted = sortedCharacters(team);
  const cardReordered = sorted.some((c, i) => c !== team.characters[i]);
  if (cardReordered && name) {
    const sortedBases = sorted.map((c) => charBaseName(c.name));
    const parts = name
      .split(/\s*·\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    const byAlpha = (arr: string[]) => [...arr].sort((a, b) => a.localeCompare(b, "en"));
    const sameSet =
      parts.length === sortedBases.length &&
      byAlpha(parts).every((v, i) => v === byAlpha(sortedBases)[i]);
    if (sameSet) result = sortedBases.join(" · ");
  }
  nameCache.set(team, result);
  return result;
}
