
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
  if (abs % 1 < 1e-9) {
    return sign + Math.round(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  const s = abs.toFixed(1);
  const [int, frac] = s.split(".");
  return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + frac;
}

export function parseSlot(slot: string): { row: number; col: number } | null {
  const m = /^R(\d+)·C(\d+)$/.exec(slot || "");
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
}

export function splitCons(name: string): { cons: string | null; base: string } {
  const m = /^(C[0-6])\s+(.*)$/.exec(name);
  return m ? { cons: m[1], base: m[2] } : { cons: null, base: name };
}

export function charNameParts(c: {
  name: string;
  constellation?: string | null;
}): { cons: string | null; base: string } {
  if (c.constellation != null && c.constellation !== "") {
    return { cons: c.constellation, base: c.name };
  }
  return splitCons(c.name);
}

export function charBaseName(name: string): string {
  const { base } = splitCons(name);
  return base.trim() || name;
}

export function fmtCardDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[1]}/${m[2]}/${m[3]}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
