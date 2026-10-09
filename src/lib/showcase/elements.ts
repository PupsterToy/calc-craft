
export const ELEMENTS = {
  Pyro: { label: "Пиро", color: "#FF6640" },
  Hydro: { label: "Гидро", color: "#00C0FF" },
  Anemo: { label: "Анемо", color: "#32D7A0" },
  Electro: { label: "Электро", color: "#CC80FF" },
  Dendro: { label: "Дендро", color: "#90CC00" },
  Cryo: { label: "Крио", color: "#80FFFF" },
  Geo: { label: "Гео", color: "#FFAC00" },
} as const;

export type ElementKey = keyof typeof ELEMENTS;

const BY_ANY_KEY = new Map<string, ElementKey>();
for (const [k, v] of Object.entries(ELEMENTS)) {
  BY_ANY_KEY.set(k.toLowerCase(), k as ElementKey);
  BY_ANY_KEY.set(v.label.toLowerCase(), k as ElementKey);
}

export function normalizeElementKey(v: unknown): ElementKey | undefined {
  if (typeof v !== "string") return undefined;
  return BY_ANY_KEY.get(v.trim().toLowerCase());
}

export function normalizeRarity(v: unknown): 4 | 5 | undefined {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v)
        : NaN;
  return n === 4 ? 4 : n === 5 ? 5 : undefined;
}
