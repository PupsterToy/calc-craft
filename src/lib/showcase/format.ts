/** Форматирование чисел/дат (детерминированное — одинаково на сервере и в браузере). */

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const neg = n < 0;
  const s = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "−" : "") + s;
}

export function fmt1(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  // целые — без дробной части (21,0 -> 21)
  if (abs % 1 < 1e-9) {
    return sign + Math.round(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  const s = abs.toFixed(1);
  const [int, frac] = s.split(".");
  return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + frac;
}

/** «R2·C1» -> { row: 2, col: 1 } */
export function parseSlot(slot: string): { row: number; col: number } | null {
  const m = /^R(\d+)·C(\d+)$/.exec(slot || "");
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
}

/** «C0 Sandrone» -> [констелляция, имя] */
export function splitCons(name: string): { cons: string | null; base: string } {
  const m = /^(C\d+)\s+(.*)$/.exec(name);
  return m ? { cons: m[1], base: m[2] } : { cons: null, base: name };
}

/** Базовое имя персонажа без созвездия: «C6 Alyosha» -> «Alyosha».
 *  Для поиска и объединения вариантов (C6 Alyosha и C2 Alyosha — один персонаж). */
export function charBaseName(name: string): string {
  const { base } = splitCons(name);
  return base.trim() || name;
}
