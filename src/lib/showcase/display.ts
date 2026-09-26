/**
 * Отображение команды: сортировка персонажей и название с учётом порядка по урону.
 *
 * Все вычисления кэшируются в WeakMap — на команду выполняются ровно один раз
 * (при первом обращении), при повторных отрисовках берётся готовый результат.
 * Пока порядок персонажей на листе совпадает с порядком по урону, название
 * команды не пересобирается — используется исходное.
 */
import { charBaseName } from "./format";
import type { TeamBlock } from "./types";

type Character = TeamBlock["characters"][number];

/** Цвета персонажей по позиции в порядке урона (карточки и всплывающая подсказка). */
export const CHAR_COLORS = ["#e37b87", "#b08cff", "#6fc3df", "#a6c96a", "#f2a3a3", "#f2d16b"];

const sortedCache = new WeakMap<TeamBlock, Character[]>();

/** Персонажи команды по убыванию урона (как внутри карточки). */
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

/** Сумма урона персонажей команды (кэш). Нужна как знаменатель долей для
 *  таблиц, где нет ни колонки процентов, ни ячейки Total DPR. */
const damageSumCache = new WeakMap<TeamBlock, number>();
function teamDamageSum(team: TeamBlock): number {
  let sum = damageSumCache.get(team);
  if (sum === undefined) {
    sum = team.characters.reduce((acc, c) => acc + (c.damage ?? 0), 0);
    damageSumCache.set(team, sum);
  }
  return sum;
}

/** Доля урона персонажа в команде, %. Три уровня (просьба 20.09 — процент
 *  считается автоматически, если таблица его не содержит):
 *  1) явная damage_share из листа (колонка рядом с уроном);
 *  2) урон / Total DPR команды;
 *  3) урон / сумма урона персонажей команды (нет ни процентов, ни итога).
 *  На этих долях рисуются горизонтальные шкалы в карточке и тултип строки. */
export function charDamageShare(team: TeamBlock, c: Character): number {
  if (c.damage_share != null) return c.damage_share * 100;
  const tpr = team.total_dpr;
  const total = tpr != null && tpr > 0 ? tpr : teamDamageSum(team);
  return total > 0 ? ((c.damage ?? 0) / total) * 100 : 0;
}

const nameCache = new WeakMap<TeamBlock, string>();

/**
 * Название команды: если персонажей внутри карточки пришлось переставлять по урону
 * и название является перечнем этих же персонажей через «·» — персонажи в названии
 * переставляются в тот же порядок. Иначе возвращается исходное название как есть.
 */
export function teamDisplayName(team: TeamBlock): string {
  const name = team.team_name ?? "";
  const cached = nameCache.get(team);
  if (cached !== undefined) return cached;

  let result = name;
  const sorted = sortedCharacters(team);
  // понадобилась ли перестановка внутри карточки: порядок на листе уже совпадает с порядком по урону?
  const cardReordered = sorted.some((c, i) => c !== team.characters[i]);
  if (cardReordered && name) {
    const sortedBases = sorted.map((c) => charBaseName(c.name));
    // переставляем только если название — это те же персонажи через «·» (в другом порядке)
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
