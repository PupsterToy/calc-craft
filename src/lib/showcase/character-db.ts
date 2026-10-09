import { CHARACTERS_DB_RAW } from "@/data/characters-db";
import { normalizeElementKey, type ElementKey } from "./elements";

export interface DbCharacter {
  id: number;
  shortId: string;
  nameEn: string;
  nameRu: string;
  nameZhCn: string;
  nameZhTw: string;
  nameJa: string;
  element: ElementKey | null;
  weapon: string;
  rarity: 4 | 5;
}

export const CHARACTERS_DB: readonly DbCharacter[] = CHARACTERS_DB_RAW.map(
  ([id, shortId, nameEn, nameRu, nameZhCn, nameZhTw, nameJa, element, weapon, rarity]) => ({
    id,
    shortId,
    nameEn,
    nameRu,
    nameZhCn,
    nameZhTw,
    nameJa,
    element: (element === "" ? null : (element as ElementKey)),
    weapon,
    rarity,
  }),
);

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^c[0-6]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_NAME = new Map<string, DbCharacter>();
{
  const words = new Map<string, Set<DbCharacter>>();
  for (const c of CHARACTERS_DB) {
    for (const n of [c.nameEn, c.nameRu, c.nameZhCn, c.nameZhTw, c.nameJa]) {
      const k = norm(n);
      if (!k) continue;
      BY_NAME.set(k, c);
      if (k.includes(" ")) {
        for (const w of k.split(" ")) {
          const clean = w.replace(/[()·]/g, "");
          if (clean.length < 2) continue;
          if (!words.has(clean)) words.set(clean, new Set());
          words.get(clean)!.add(c);
        }
      }
    }
  }
  for (const [w, set] of words) {
    if (set.size === 1 && !BY_NAME.has(w)) BY_NAME.set(w, set.values().next().value!);
  }
}

const TRAVELER_RE = /^(.+?)[\s-]+(travel{1,2}er|путешественник|путешественница|путешественн)$/i;

const MC_ALIASES: Readonly<Record<string, ElementKey>> = {
  amc: "Anemo",
  gmc: "Geo",
  emc: "Electro",
  dmc: "Dendro",
  hmc: "Hydro",
  pmc: "Pyro",
  cmc: "Cryo",
};

const GG_RE = /^(.+?)[\s-]*(гг|gg)$/;

function travelerWith(el: ElementKey): DbCharacter | undefined {
  const traveler = BY_NAME.get("путешественник") ?? BY_NAME.get("traveler (male)");
  return traveler ? { ...traveler, element: el } : undefined;
}

export function lookupCharacter(name: string): DbCharacter | undefined {
  const k = norm(name);
  if (!k) return undefined;
  const direct = BY_NAME.get(k);
  if (direct) return direct;
  const m = TRAVELER_RE.exec(k);
  if (m) {
    const el = normalizeElementKey(m[1]);
    if (el) return travelerWith(el);
  }
  const mc = MC_ALIASES[k];
  if (mc) return travelerWith(mc);
  const gg = GG_RE.exec(k);
  if (gg) {
    const el = normalizeElementKey(gg[1]);
    if (el) return travelerWith(el);
  }
  return undefined;
}
