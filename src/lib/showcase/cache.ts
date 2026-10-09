import { charBaseName } from "./format";
import { migrateShowcaseData } from "./parse";
import type { ShowcaseData } from "./types";

export interface CachedSource {
  key: string;
  label: string;
  name: string;
  seq: number;
  type: "xlsx" | "csv" | "favorites";
  saved_at: number;
  data: ShowcaseData;
}

export interface CacheState {
  sources: CachedSource[];
  activeKeys: string[];
}

const STORE_KEY = "showcase-cache-v2";
const STORE_KEY_V1 = "showcase-cache-v1";
export const CACHE_BUDGET_BYTES = 2 * 1024 * 1024;

const utf8 = new TextEncoder();

export function payloadBytes(sources: CachedSource[], activeKeys: string[]): number {
  return utf8.encode(JSON.stringify({ v: 2, activeKeys, sources })).length;
}

function isSource(v: unknown): v is CachedSource {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.key === "string" &&
    s.key.length > 0 &&
    typeof s.label === "string" &&
    (s.type === "xlsx" || s.type === "csv") &&
    typeof s.saved_at === "number" &&
    !!s.data &&
    typeof s.data === "object" &&
    Array.isArray((s.data as { teams?: unknown }).teams)
  );
}

function mostFrequent(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

export function autoName(data: ShowcaseData): string {
  const teams = data.teams.filter((t) => !t.is_empty && t.characters.length > 0);
  const parts: string[] = [];
  const author = mostFrequent(teams.map((t) => t.author));
  if (author) parts.push(author);
  const topChar = mostFrequent(
    teams.flatMap((t) => t.characters.map((c) => charBaseName(c.name))),
  );
  if (topChar) parts.push(topChar);
  return parts.join(" · ");
}

export function sourceName(s: CachedSource): string {
  return s.name ? `#${s.seq} · ${s.name}` : `#${s.seq}`;
}

function stripNumPrefix(name: string): string {
  return name.replace(/^#\d+\s*·\s*/, "");
}

function normalize(list: CachedSource[]): CachedSource[] {
  let next = list.reduce((m, s) => Math.max(m, s.seq), 0);
  return list.map((s) => {
    const seq = s.seq > 0 ? s.seq : ++next;
    const name = stripNumPrefix(s.name) || autoName(s.data);
    return s.seq === seq && s.name === name ? s : { ...s, seq, name };
  });
}

export function readCache(): CacheState {
  try {
    let raw = localStorage.getItem(STORE_KEY);
    let v1 = false;
    if (!raw) {
      raw = localStorage.getItem(STORE_KEY_V1);
      v1 = !!raw;
    }
    if (!raw) return { sources: [], activeKeys: [] };
    const parsed = JSON.parse(raw) as {
      v?: unknown;
      activeKey?: unknown;
      activeKeys?: unknown;
      sources?: unknown;
    };
    if (parsed.v !== 2 && parsed.v !== 1) return { sources: [], activeKeys: [] };
    if (!Array.isArray(parsed.sources)) return { sources: [], activeKeys: [] };
    let sources = (parsed.sources as unknown[]).filter(isSource) as CachedSource[];
    if (v1 || parsed.v === 1) {
      sources = sources
        .map((s) => ({ ...s, seq: 0, name: "" }))
        .sort((a, b) => a.saved_at - b.saved_at)
        .map((s, i) => ({ ...s, seq: i + 1 }));
    }
    sources = normalize(sources).sort((a, b) => a.seq - b.seq);
    for (const s of sources) migrateShowcaseData(s.data);
    const activeRaw = Array.isArray(parsed.activeKeys)
      ? (parsed.activeKeys as unknown[]).filter((k): k is string => typeof k === "string")
      : typeof parsed.activeKey === "string"
        ? [parsed.activeKey as string]
        : [];
    const activeKeys = activeRaw.filter((k) => sources.some((s) => s.key === k));
    return { sources, activeKeys };
  } catch {
    return { sources: [], activeKeys: [] };
  }
}

function dropOldest(list: CachedSource[], activeKeys: string[]): CachedSource[] {
  if (list.length === 0) return list;
  const idx = list.findIndex((s) => !activeKeys.includes(s.key));
  return list.slice(idx === -1 ? 1 : idx);
}

export function writeCache(sources: CachedSource[], activeKeys: string[]): CachedSource[] {
  let keep = [...sources].sort((a, b) => a.seq - b.seq);
  let keys = activeKeys.filter((k) => keep.some((s) => s.key === k));
  while (keep.length > 1 && payloadBytes(keep, keys) > CACHE_BUDGET_BYTES) {
    keep = dropOldest(keep, keys);
    keys = keys.filter((k) => keep.some((s) => s.key === k));
  }
  for (;;) {
    try {
      const renumbered = keep.map((s, i) => (s.seq === i + 1 ? s : { ...s, seq: i + 1 }));
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, activeKeys: keys, sources: renumbered }));
      return renumbered;
    } catch {
      if (keep.length === 0) return [];
      keep = dropOldest(keep, keys);
      keys = keys.filter((k) => keep.some((s) => s.key === k));
    }
  }
}
