"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ArrowUp, Check, ChevronDown, ClipboardPaste, Rows3, X } from "lucide-react";
import { longPress } from "@/components/showcase/long-press";
import { SourcePanel } from "@/components/showcase/source-panel";
import { SourcesMenu } from "@/components/showcase/sources-menu";
import { GeneralMenu } from "@/components/showcase/cards-general-menu";
import { TeamCard } from "@/components/showcase/team-card";
import { TeamCompactCard } from "@/components/showcase/team-compact-card";
import { TeamMenu } from "@/components/showcase/team-menu";
import { usePixelSnap, useScrollSnap } from "@/components/showcase/pixel-snap";
import { CardEditModal } from "@/components/showcase/card-edit-modal";
import {
  CardsBatchEditModal,
  type BatchEditCard,
  type BatchEditValues,
} from "@/components/showcase/cards-batch-edit-modal";
import { ExportModal } from "@/components/showcase/export-modal";
import type { ExportCardData } from "@/lib/showcase/export-file";
import { Tip, TipProvider } from "@/components/showcase/tip";
import { parseCsv } from "@/lib/showcase/csv";
import {
  CHAR_COLORS,
  EXTRA_COLOR,
  charDamageShare,
  characterGear,
  extraDamageOrNull,
  extraDamagePercent,
  sortedCharacters,
  teamDisplayName,
  teamDisplayDpr,
  teamDisplayDps,
} from "@/lib/showcase/display";
import { charBaseName, charNameParts, escapeHtml, fmt1, fmtInt, parseSlot } from "@/lib/showcase/format";
import { SORTS, slotOrder, type SortDir, type SortMode } from "@/lib/showcase/sorts";
import { fetchSheetCsv } from "@/lib/showcase/google";
import { clearHashSource, readHashSource, writeHashSource } from "@/lib/showcase/hash-source";
import { parseShowcaseGrid, isValidSlot, migrateShowcaseData, migrateTeamBlock } from "@/lib/showcase/parse";
import {
  autoName,
  readCache,
  sourceName,
  writeCache,
  CACHE_BUDGET_BYTES,
  payloadBytes,
  type CachedSource,
} from "@/lib/showcase/cache";
import type { ShowcaseData } from "@/lib/showcase/types";
import { readWorkbook, pickShowcaseSheet, type WorkbookSheets } from "@/lib/showcase/xlsx";
import demoRaw from "@/data/demo-teams.json";

const DEMO_LABEL = "Демо: Showcase · Timmie's Bird";

const STAMP_DATE = "2026-10-10 13:55";
const STAMP_COMMIT = process.env.NEXT_PUBLIC_STAMP_COMMIT ?? "dev";
const STAMP_ROUND = "R-128";
const STAMP_TASK = "T-166";

const demoData: ShowcaseData = migrateShowcaseData({
  ...(demoRaw as unknown as ShowcaseData),
  teams: (demoRaw as unknown as ShowcaseData).teams.filter((t) => isValidSlot(t.slot)),
  source_type: "demo",
  source: DEMO_LABEL,
});

type Team = ShowcaseData["teams"][number];
type ViewMode = "cards" | "rows" | "compact";

const SORT_CMP: Record<SortMode, (a: Team, b: Team) => number> = {
  order: (a, b) => slotOrder(a) - slotOrder(b),
  dpr: (a, b) => (teamDisplayDpr(a) ?? -Infinity) - (teamDisplayDpr(b) ?? -Infinity),
  dps: (a, b) => (teamDisplayDps(a) ?? -Infinity) - (teamDisplayDps(b) ?? -Infinity),
  time:
    (a, b) =>
      (a.rotation_time_s ?? 1e9) - (b.rotation_time_s ?? 1e9) ||
      (teamDisplayDps(a) ?? 0) - (teamDisplayDps(b) ?? 0),
};

const fmtKilo = (v: number | null) =>
  v != null && v >= 1000 ? `${Math.round(v / 1000)}k` : fmtInt(v);

function slotOptCmp(a: string, b: string): number {
  const sa = parseSlot(a);
  const sb = parseSlot(b);
  if (sa && sb) return sa.col * 100 + sa.row - (sb.col * 100 + sb.row) || a.localeCompare(b, "ru");
  if (sa) return -1;
  if (sb) return 1;
  return a.localeCompare(b, "ru");
}

const teamUid = new WeakMap<Team, string>();
const teamSeq = new WeakMap<Team, number>();
const teamSrc = new WeakMap<Team, string>();

function pluralSources(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return "источник";
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return "источника";
  return "источников";
}

const FAV_STORE = "showcase-favorites";
const FAV_KEY = "favorites";
interface FavEntry {
  uid: string;
  srcName: string;
  srcSnap?: string;
  team: Team;
}
function storedFavKey(uid: string): string {
  return uid.startsWith("fav::") ? uid.slice(5) : uid;
}

type Trash =
  | { kind: "favorites"; entry: FavEntry; index: number }
  | { kind: "source"; team: Team; srcKey: string; index: number };

interface NoticeInfo {
  text: string;
  kind: "ok" | "deleted";
  slot?: string;
}

type SearchParam = "all" | "team" | "char" | "weapon" | "set" | "author" | "src" | "slot";

const SEARCH_STICKY = false;

const SEARCH_PARAMS: Record<SearchParam, string> = {
  all: "Все",
  char: "Персонаж",
  weapon: "Оружие",
  set: "Сет",
  author: "Автор",
  src: "Источник",
  team: "Команда",
  slot: "Слот",
};

type ParamKey = Exclude<SearchParam, "all">;
const PARAM_KEYS: ParamKey[] = ["char", "weapon", "set", "author", "src", "team", "slot"];

const EMPTY_SEL: Record<ParamKey, string[]> = {
  char: [],
  team: [],
  weapon: [],
  set: [],
  author: [],
  src: [],
  slot: [],
};

function normSlot(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function teamValues(t: Team, p: SearchParam): string[] {
  switch (p) {
    case "team":
      return t.team_name ? [t.team_name] : [];
    case "char":
      return t.characters.map((c) => charBaseName(c.name));
    case "weapon":
      return t.characters.map((c) => c.weapon).filter((v): v is string => !!v);
    case "set":
      return t.characters.map((c) => c.artifact_set).filter((v): v is string => !!v);
    case "author":
      return t.author ? [t.author] : [];
    case "src": {
      const n = teamSrc.get(t);
      return n ? [n] : [];
    }
    case "slot":
      return [t.slot];
    default:
      return t.characters.map((c) => charBaseName(c.name));
  }
}

function matchesParam(t: Team, p: SearchParam, q: string): boolean {
  if (p === "slot") {
    const nq = normSlot(q);
    return teamValues(t, p).some((v) => normSlot(v).includes(nq));
  }
  if (p === "all") {
    const hay = [t.team_name, t.rotation, t.author, t.slot, normSlot(t.slot), teamSrc.get(t) ?? ""]
      .concat(t.characters.flatMap((c) => [charBaseName(c.name), c.weapon, c.artifact_set]))
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }
  return teamValues(t, p).some((v) => v.toLowerCase().includes(q));
}

export default function Home() {
  const [notice, setNotice] = useState<NoticeInfo | null>(null);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [editFavSrc, setEditFavSrc] = useState<string | null>(null);
  const [editBatch, setEditBatch] = useState<BatchEditCard[] | null>(null);
  const [exportCards, setExportCards] = useState<ExportCardData[] | null>(null);
  const [trash, setTrash] = useState<Trash | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingSheets, setPendingSheets] = useState<{ sheets: WorkbookSheets; file: string }[]>([]);
  const [demoHidden, setDemoHidden] = useState(false);
  const [restored, setRestored] = useState(false);
  const [cache, setCache] = useState<CachedSource[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const cacheRef = useRef<CachedSource[]>([]);
  const activeKeysRef = useRef<string[]>([]);
  const [hoverSrcKey, setHoverSrcKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchParam, setSearchParam] = useState<SearchParam>("all");
  const [sel, setSel] = useState<Record<ParamKey, string[]>>({ ...EMPTY_SEL });
  const [selOrder, setSelOrder] = useState<[ParamKey, string][]>([]);
  const [optsOpen, setOptsOpen] = useState(false);
  const [optsStuck, setOptsStuck] = useState(false);
  useEffect(() => {
    if (!optsOpen) setOptsStuck(false);
  }, [optsOpen]);
  const [sortOpen, setSortOpen] = useState(false);
  const [paramOpen, setParamOpen] = useState(false);
  const sortRootRef = useRef<HTMLDivElement | null>(null);
  const paramRootRef = useRef<HTMLDivElement | null>(null);
  const [selMode, setSelMode] = useState<"or" | "and">("or");
  const [view, setView] = useState<ViewMode>("cards");
  const [viewFading, setViewFading] = useState(false);
  const viewPendingRef = useRef<ViewMode | null>(null);
  const viewFadeTimerRef = useRef<number | null>(null);
  const switchView = (v: ViewMode) => {
    if (v === view) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setView(v);
      return;
    }
    viewPendingRef.current = v;
    setViewFading(true);
    if (viewFadeTimerRef.current !== null)
      window.clearTimeout(viewFadeTimerRef.current);
    viewFadeTimerRef.current = window.setTimeout(() => {
      viewFadeTimerRef.current = null;
      const pending = viewPendingRef.current;
      viewPendingRef.current = null;
      if (pending !== null) setView(pending);
      setViewFading(false);
    }, 150);
  };
  useEffect(
    () => () => {
      if (viewFadeTimerRef.current !== null)
        window.clearTimeout(viewFadeTimerRef.current);
    },
    [],
  );
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [slotPopupUid, setSlotPopupUid] = useState<string | null>(null);
  const [slotPopupUp, setSlotPopupUp] = useState(false);
  const rowSlotPanelRef = useRef<HTMLSpanElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const upd = () => setIsMobile(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  useEffect(() => {
    if (!slotPopupUid) return;
    const onDoc = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (t instanceof Element && t.closest("[data-row-slot]")) return;
      setSlotPopupUid(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSlotPopupUid(null);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [slotPopupUid]);
  useLayoutEffect(() => {
    if (!slotPopupUid) return;
    const panel = rowSlotPanelRef.current;
    const chip = panel?.parentElement;
    if (!panel || !chip) return;
    const h = panel.offsetHeight;
    const ar = chip.getBoundingClientRect();
    const sec = document.querySelector<HTMLElement>('section[aria-label="Поиск"]');
    const limit = Math.max(8, sec ? sec.getBoundingClientRect().bottom + 4 : 8);
    const vh = document.documentElement.clientHeight;
    const upOk = ar.top - h - 4 >= limit;
    const downOk = ar.bottom + h + 4 <= vh - 8;
    setSlotPopupUp(upOk || !downOk);
  }, [slotPopupUid]);
  const [favorites, setFavorites] = useState<FavEntry[]>([]);
  const [favAddedAt, setFavAddedAt] = useState<Record<string, number>>({});
  const favoritesRef = useRef<FavEntry[]>([]);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);
  const [favOn, setFavOn] = useState(false);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [multiSelect, setMultiSelect] = useState(false);
  const statsRef = useRef<HTMLElement | null>(null);
  const searchRootRef = useRef<HTMLDivElement | null>(null);
  const topBtnRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const optsPanelRef = useRef<HTMLDivElement | null>(null);
  const optsAnchorRef = useRef<{ ids: string[]; delta: number } | null>(null);
  const [hoverTip, setHoverTip] = useState<{ team: Team; top: number; left: number } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  usePixelSnap(pageContainerRef);
  useScrollSnap(optsPanelRef, optsOpen);

  useEffect(() => {
    const onScroll = () => {
      const el = topBtnRef.current;
      if (!el) return;
      const stats = statsRef.current;
      const on = !!stats && stats.getBoundingClientRect().top < -100;
      el.dataset.show = on ? "true" : "false";
      el.inert = !on;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [searchStuck, setSearchStuck] = useState(false);
  const searchSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!SEARCH_STICKY) return;
    const el = searchSentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      setSearchStuck(!entry.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let v: string | null = null;
    try {
      v = localStorage.getItem("showcase-view");
    } catch {
    }
    if (v === "rows" || v === "compact") setView(v);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("showcase-view", view);
    } catch {
    }
  }, [view]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("showcase-sort");
      if (!raw) return;
      const v = JSON.parse(raw) as { mode?: unknown; dir?: unknown };
      if (typeof v.mode === "string" && v.mode in SORTS) setSortMode(v.mode as SortMode);
      if (v.dir === "asc" || v.dir === "desc") setSortDir(v.dir);
    } catch {
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("showcase-sort", JSON.stringify({ mode: sortMode, dir: sortDir }));
    } catch {
    }
  }, [sortMode, sortDir]);

  useEffect(() => {
    if (view !== "cards") document.documentElement.removeAttribute("data-flash-view");
  }, [view]);

  useEffect(() => {
    const { sources, activeKeys: savedKeys } = readCache();
    cacheRef.current = sources;
    activeKeysRef.current = savedKeys;
    if (sources.length > 0) setCache(sources);
    if (savedKeys.length > 0) {
      setActiveKeys(savedKeys);
      setNotice({ text: "восстановлено из кэша — работает офлайн", kind: "ok" });
    }
    try {
      if (localStorage.getItem("showcase-demo-hidden") === "1") setDemoHidden(true);
    } catch {
    }
    try {
      const rawFav = localStorage.getItem(FAV_STORE);
      if (rawFav) {
        const j = JSON.parse(rawFav) as { v?: unknown; on?: unknown; items?: unknown };
        if (j && j.v === 1 && Array.isArray(j.items)) {
          const items = (j.items as unknown[]).filter(
            (f): f is FavEntry =>
              !!f &&
              typeof f === "object" &&
              typeof (f as FavEntry).uid === "string" &&
              (f as FavEntry).uid.length > 0 &&
              typeof (f as FavEntry).srcName === "string" &&
              !!(f as FavEntry).team &&
              typeof (f as FavEntry).team === "object" &&
              Array.isArray((f as FavEntry).team.characters) &&
              typeof (f as FavEntry).team.slot === "string" &&
              isValidSlot((f as FavEntry).team.slot),
          );
          for (const f of items) {
            migrateTeamBlock(f.team);
            if (typeof f.srcSnap !== "string") f.srcSnap = f.srcName;
          }
          setFavorites(items);
          setFavOn(j.on === true && items.length > 0);
        }
      }
    } catch {
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) {
      document.documentElement.removeAttribute("data-prehide");
      document.documentElement.removeAttribute("data-demo-off");
      document.documentElement.removeAttribute("data-cache-row");
    }
  }, [restored]);

  const hashSourceDoneRef = useRef(false);
  useEffect(() => {
    if (hashSourceDoneRef.current) return;
    hashSourceDoneRef.current = true;
    const url = readHashSource();
    if (!url) return;
    void onLink(url, { fromHash: true });
  }, []);

  const favPersistedRef = useRef(false);
  useEffect(() => {
    if (!favPersistedRef.current) {
      favPersistedRef.current = true;
      return;
    }
    try {
      localStorage.setItem(FAV_STORE, JSON.stringify({ v: 1, on: favOn, items: favorites }));
    } catch {
    }
  }, [favorites, favOn]);

  useEffect(() => {
    if (favorites.length === 0 && favOn) setFavOn(false);
  }, [favorites, favOn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const input = searchInputRef.current;
      if (!input) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        input.focus({ preventScroll: true });
        setOptsOpen(true);
        return;
      }
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable) ||
        (el instanceof HTMLElement &&
          el.closest('[role="menu"], [role="listbox"], [role="dialog"]'))
      )
        return;
      e.preventDefault();
      input.focus({ preventScroll: true });
      setOptsOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function pasteIntoSearch() {
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const input = searchInputRef.current;
    if (!input) return;
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      setQuery(input.value.slice(0, start) + text + input.value.slice(end));
      setOptsOpen(true);
      pendingCaretRef.current = start + text.length;
    } catch {
    }
  }

  useEffect(() => {
    const pos = pendingCaretRef.current;
    if (pos == null) return;
    pendingCaretRef.current = null;
    const input = searchInputRef.current;
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
      input.setSelectionRange(pos, pos);
    } catch {
    }
  }, [query]);

  useEffect(() => {
    if (!hoverTip) return;
    const hide = () => setHoverTip(null);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("resize", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [hoverTip]);

  useEffect(() => {
    if (!optsOpen) return;
    const onDoc = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (
        searchRootRef.current &&
        e.composedPath().includes(searchRootRef.current)
      )
        return;
      if (searchRootRef.current?.contains(t)) return;
      setOptsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOptsOpen(false);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [optsOpen]);

  useEffect(() => {
    if (!sortOpen && !paramOpen) return;
    const onDoc = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (sortOpen && !sortRootRef.current?.contains(t)) setSortOpen(false);
      if (paramOpen && !paramRootRef.current?.contains(t)) setParamOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSortOpen(false);
        setParamOpen(false);
      }
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortOpen, paramOpen]);

  useEffect(() => {
    optsPanelRef.current?.scrollTo({ top: 0 });
  }, [query, searchParam, optsOpen]);

  useLayoutEffect(() => {
    const anchor = optsAnchorRef.current;
    optsAnchorRef.current = null;
    const panel = optsPanelRef.current;
    if (!anchor || !panel || anchor.ids.length === 0) return;
    const sticky = panel.querySelector<HTMLElement>(".sticky");
    const stickyH = sticky ? sticky.offsetHeight : 0;
    for (const id of anchor.ids) {
      const el = panel.querySelector<HTMLElement>(`[data-opt-id="${CSS.escape(id)}"]`);
      if (!el) continue;
      panel.scrollTop = Math.max(0, el.offsetTop - stickyH - anchor.delta);
      return;
    }
  }, [selMode]);

  const favSet = useMemo(() => new Set(favorites.map((f) => f.uid)), [favorites]);
  const favSnapMap = useMemo(
    () => new Map(favorites.map((f) => [f.uid, f.srcSnap ?? f.srcName])),
    [favorites],
  );
  const favSource = useMemo<CachedSource | null>(() => {
    if (favorites.length === 0) return null;
    const favTeams = favorites.map((f) => f.team);
    return {
      key: FAV_KEY,
      label: "Избранное",
      name: "Избранное",
      seq: 0,
      type: "favorites",
      saved_at: 0,
      data: {
        format: "showcase-simple/1",
        source: "Избранное",
        source_type: "favorites",
        sheet: "",
        extracted_at: "",
        grid: { rows: favTeams.length, cols: 0 },
        slots_total: favTeams.length,
        slots_filled: favTeams.length,
        teams: favTeams,
      },
    };
  }, [favorites]);
  const activeSources = useMemo(() => {
    const list = cache.filter((s) => activeKeys.includes(s.key)).sort((a, b) => a.seq - b.seq);
    return favOn && favSource ? [favSource, ...list] : list;
  }, [cache, activeKeys, favOn, favSource]);
  const favSourceOnly = activeSources.length === 1 && activeSources[0].key === FAV_KEY;

  const { data, sourceLabel } = useMemo(() => {
    if (activeSources.length === 0) {
      if (demoHidden) {
        const empty: ShowcaseData = {
          format: "showcase-simple/1",
          source: "",
          source_type: "demo",
          sheet: "",
          extracted_at: "",
          grid: { rows: 0, cols: 0 },
          slots_total: 0,
          slots_filled: 0,
          teams: [],
        };
        return { data: empty, sourceLabel: "демо скрыто" };
      }
      for (const t of demoData.teams) {
        teamUid.set(t, t.slot);
        teamSeq.set(t, 0);
        teamSrc.set(t, "Демо");
      }
      return { data: demoData, sourceLabel: DEMO_LABEL };
    }
    if (activeSources.length === 1 && activeSources[0].key === FAV_KEY) {
      for (const f of favorites) {
        teamUid.set(f.team, `fav::${f.uid}`);
        teamSeq.set(f.team, 0);
        teamSrc.set(f.team, f.srcName);
      }
      return { data: activeSources[0].data, sourceLabel: activeSources[0].label };
    }
    if (activeSources.length === 1) {
      const src = activeSources[0];
      for (const t of src.data.teams) {
        teamUid.set(t, `${src.key}::${t.slot}`);
        teamSeq.set(t, src.seq);
        teamSrc.set(t, sourceName(src));
      }
      return { data: src.data, sourceLabel: src.label };
    }
    const teams = activeSources.flatMap((s) => s.data.teams);
    for (const s of activeSources) {
      if (s.key === FAV_KEY) {
        for (const f of favorites) {
          teamUid.set(f.team, `fav::${f.uid}`);
          teamSeq.set(f.team, 0);
          teamSrc.set(f.team, f.srcName);
        }
        continue;
      }
      for (const t of s.data.teams) {
        teamUid.set(t, `${s.key}::${t.slot}`);
        teamSeq.set(t, s.seq);
        teamSrc.set(t, sourceName(s));
      }
    }
    const merged: ShowcaseData = {
      format: "showcase-simple/1",
      source: activeSources.map((s) => s.label).join(" · "),
      source_type: activeSources[0].data.source_type,
      sheet: "",
      extracted_at: "",
      grid: {
        rows: activeSources.reduce((n, s) => n + s.data.grid.rows, 0),
        cols: activeSources.reduce((m, s) => Math.max(m, s.data.grid.cols), 0),
      },
      slots_total: activeSources.reduce((n, s) => n + s.data.slots_total, 0),
      slots_filled: activeSources.reduce((n, s) => n + s.data.slots_filled, 0),
      teams,
    };
    const ordinals = activeSources
      .map((s) => (s.key === FAV_KEY ? "избранное" : `#${s.seq}`))
      .join(", ");
    return { data: merged, sourceLabel: `${activeSources.length} ${pluralSources(activeSources.length)}: ${ordinals}` };
  }, [activeSources, demoHidden, favorites]);

  const teams = useMemo(
    () => data.teams.filter((t) => !t.is_empty && t.characters.length > 0),
    [data],
  );

  const teamByUid = useMemo(() => {
    const m = new Map<string, Team>();
    for (const t of teams) {
      const uid = teamUid.get(t);
      if (uid) m.set(uid, t);
    }
    return m;
  }, [teams]);

  useEffect(() => {
    setSelectedUids((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const u of prev) {
        if (teamByUid.has(u)) next.add(u);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [teamByUid]);

  useEffect(() => {
    setSel((prev) => {
      const next = {} as Record<ParamKey, string[]>;
      let changed = false;
      for (const p of PARAM_KEYS) {
        const alive = prev[p].filter((v) => teams.some((t) => teamValues(t, p).includes(v)));
        if (alive.length !== prev[p].length) changed = true;
        next[p] = alive;
      }
      return changed ? next : prev;
    });
    setSelOrder((prev) => {
      const alive = prev.filter(([p, v]) => teams.some((t) => teamValues(t, p).includes(v)));
      return alive.length === prev.length ? prev : alive;
    });
  }, [teams]);

  const optionsByParam = useMemo(() => {
    let pool = teams;
    if (selMode === "and") {
      const activeAny = PARAM_KEYS.filter((p) => sel[p].length > 0);
      if (activeAny.length > 0) {
        pool = teams.filter((t) =>
          activeAny.every((p) => sel[p].every((v) => teamValues(t, p).includes(v))),
        );
      }
    }
    const q = query.trim().toLowerCase();
    const nq = normSlot(q);
    const res = {} as Record<ParamKey, [string, number][]>;
    for (const p of PARAM_KEYS) {
      const counts = new Map<string, number>();
      for (const t of pool) {
        for (const v of new Set(teamValues(t, p))) {
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }
      res[p] = [...counts.entries()]
        .filter(([v]) => !q || (p === "slot" ? normSlot(v).includes(nq) : v.toLowerCase().includes(q)))
        .sort((a, b) => (p === "slot" ? slotOptCmp(a[0], b[0]) : a[0].localeCompare(b[0], "ru")))
        .slice(0, 100);
    }
    return res;
  }, [teams, query, sel, selMode]);

  const selCount =
    searchParam === "all"
      ? PARAM_KEYS.reduce((n, p) => n + sel[p].length, 0)
      : sel[searchParam].length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = PARAM_KEYS.filter((p) => sel[p].length > 0);
    const list = teams.filter((t) => {
      const selOk =
        selMode === "and"
          ? active.every((p) => sel[p].every((v) => teamValues(t, p).includes(v)))
          : active.every((p) => teamValues(t, p).some((v) => sel[p].includes(v)));
      const qOk = !q || matchesParam(t, searchParam, q);
      return selOk && qOk;
    });
    const bySrc = (a: Team, b: Team) => (teamSeq.get(a) ?? 0) - (teamSeq.get(b) ?? 0);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => bySrc(a, b) || dir * SORT_CMP[sortMode](a, b));
  }, [teams, query, sortMode, sortDir, searchParam, sel, selMode]);

  const toggleFavoriteByTeam = useCallback((team: Team) => {
    const uid = teamUid.get(team);
    if (!uid) return;
    const key = storedFavKey(uid);
    if (favoritesRef.current.some((f) => f.uid === key)) return;
    const src = teamSrc.get(team) ?? "—";
    setFavorites((prev) =>
      prev.some((f) => f.uid === key)
        ? prev
        : [...prev, { uid: key, srcName: src, srcSnap: src, team: structuredClone(team) }],
    );
    setFavAddedAt((prev) => ({ ...prev, [key]: Date.now() }));
  }, []);

  const toggleSelectByTeam = useCallback((team: Team) => {
    const uid = teamUid.get(team);
    if (!uid) return;
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const deleteTeamByTeam = useCallback((team: Team) => {
    const uid = teamUid.get(team);
    if (!uid) return;
    if (uid.startsWith("fav::")) {
      const key = storedFavKey(uid);
      const idx = favoritesRef.current.findIndex((f) => f.uid === key);
      if (idx >= 0)
        setTrash({ kind: "favorites", entry: favoritesRef.current[idx], index: idx });
      setFavorites((prev) => prev.filter((f) => f.uid !== key));
      setNotice({ text: "удалено из избранного", kind: "deleted", slot: team.slot });
      return;
    }
    const src = cacheRef.current.find((s) => s.data.teams.includes(team));
    if (!src) return;
    setTrash({ kind: "source", team, srcKey: src.key, index: src.data.teams.indexOf(team) });
    const teams = src.data.teams.filter((t) => t !== team);
    const written = writeCache(
      cacheRef.current.map((s) => (s.key === src.key ? { ...s, data: { ...s.data, teams } } : s)),
      activeKeysRef.current,
    );
    const nextKeys = activeKeysRef.current.filter((k) => written.some((w) => w.key === k));
    cacheRef.current = written;
    activeKeysRef.current = nextKeys;
    setCache(written);
    setActiveKeys(nextKeys);
    setNotice({ text: `удалено из источника «${sourceName(src)}»`, kind: "deleted", slot: team.slot });
  }, []);

  const editTeamByTeam = useCallback(
    (team: Team, updated: Team, favSrc?: string) => {
      const uid = teamUid.get(team);
      if (!uid) return;
      if (uid.startsWith("fav::")) {
        const key = storedFavKey(uid);
        setFavorites((prev) =>
          prev.map((f) => (f.uid === key ? { ...f, team: updated, srcName: favSrc ?? f.srcName } : f)),
        );
        setNotice({ text: `${team.slot} обновлено в избранном`, kind: "ok" });
        return;
      }
      const src = cacheRef.current.find((s) => s.data.teams.includes(team));
      if (!src) return;
      const teams = src.data.teams.map((t) => (t === team ? updated : t));
      const written = writeCache(
        cacheRef.current.map((s) => (s.key === src.key ? { ...s, data: { ...s.data, teams } } : s)),
        activeKeysRef.current,
      );
      cacheRef.current = written;
      setCache(written);
      setNotice({ text: `${team.slot} обновлено в источнике «${sourceName(src)}»`, kind: "ok" });
    },
    [],
  );

  const openEditByTeam = useCallback((team: Team) => {
    const uid = teamUid.get(team);
    let favSrc: string | null = null;
    if (uid?.startsWith("fav::")) {
      const key = storedFavKey(uid);
      favSrc = favoritesRef.current.find((f) => f.uid === key)?.srcName ?? "";
    }
    setEditFavSrc(favSrc);
    setEditTeam(team);
  }, []);

  const restoreFromTrash = useCallback(() => {
    if (!trash) return;
    if (trash.kind === "favorites") {
      setFavorites((prev) => {
        if (prev.some((f) => f.uid === trash.entry.uid)) return prev;
        const next = [...prev];
        next.splice(Math.min(trash.index, next.length), 0, trash.entry);
        return next;
      });
    } else {
      const src = cacheRef.current.find((s) => s.key === trash.srcKey);
      if (!src) {
        setTrash(null);
        setNotice({ text: "источник удаления больше не доступен", kind: "ok" });
        return;
      }
      if (!src.data.teams.includes(trash.team)) {
        const teams = [...src.data.teams];
        teams.splice(Math.min(trash.index, teams.length), 0, trash.team);
        const written = writeCache(
          cacheRef.current.map((s) =>
            s.key === trash.srcKey ? { ...s, data: { ...s.data, teams } } : s,
          ),
          activeKeysRef.current,
        );
        cacheRef.current = written;
        setCache(written);
      }
    }
    setTrash(null);
    setNotice(null);
  }, [trash]);

  const menuDelete = activeSources.length > 0 ? deleteTeamByTeam : undefined;
  const menuEdit = activeSources.length > 0 ? openEditByTeam : undefined;

  const selectedTeams = useMemo(() => {
    const out: Team[] = [];
    for (const uid of selectedUids) {
      const t = teamByUid.get(uid);
      if (t) out.push(t);
    }
    return out;
  }, [selectedUids, teamByUid]);

  const openExportByTeam = useCallback(
    (t: Team) => setExportCards([{ team: t, source: teamSrc.get(t) }]),
    [teamSrc],
  );
  const menuExport = openExportByTeam;
  const exportAllSelected = useCallback(() => {
    if (selectedTeams.length === 0) return;
    setExportCards(selectedTeams.map((t) => ({ team: t, source: teamSrc.get(t) })));
  }, [selectedTeams, teamSrc]);
  const editAllSelected = useCallback(() => {
    if (selectedTeams.length === 0) return;
    setEditBatch(
      selectedTeams.map((t) => {
        const uid = teamUid.get(t);
        let favSrc: string | null = null;
        if (uid?.startsWith("fav::")) {
          const key = storedFavKey(uid);
          favSrc = favoritesRef.current.find((f) => f.uid === key)?.srcName ?? "";
        }
        return { team: t, favSrc };
      }),
    );
  }, [selectedTeams]);
  const applyBatchEdit = useCallback(
    (values: BatchEditValues) => {
      if (!editBatch) return;
      let n = 0;
      for (const { team, favSrc } of editBatch) {
        const updated: Team = {
          ...team,
          ...(values.date != null ? { date: values.date } : {}),
          ...(values.author != null ? { author: values.author } : {}),
        };
        editTeamByTeam(team, updated, values.srcName != null ? values.srcName : undefined);
        n++;
      }
      if (n > 0) setNotice({ text: `Обновлено карточек: ${n}`, kind: "ok" });
      setEditBatch(null);
    },
    [editBatch, editTeamByTeam],
  );
  const sortForExport = useCallback(
    (list: ExportCardData[], mode: SortMode, dir: SortDir) => {
      const d = dir === "asc" ? 1 : -1;
      const bySrc = (a: ExportCardData, b: ExportCardData) =>
        (teamSeq.get(a.team) ?? 0) - (teamSeq.get(b.team) ?? 0);
      return [...list].sort((a, b) => bySrc(a, b) || d * SORT_CMP[mode](a.team, b.team));
    },
    [teamSeq],
  );

  const toggleMultiSelect = useCallback(() => setMultiSelect((v) => !v), []);

  const selectAllVisible = useCallback(() => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      for (const t of visible) {
        const uid = teamUid.get(t);
        if (uid) next.add(uid);
      }
      return next;
    });
  }, [visible]);

  const clearSelection = useCallback(() => {
    setSelectedUids(new Set());
    setMultiSelect(false);
  }, []);

  const dropSelectionOnSourceSwitch = useCallback(() => {
    setSelectedUids((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const favoriteAllSelected = useCallback(() => {
    const now = Date.now();
    const fresh: Record<string, number> = {};
    for (const t of selectedTeams) {
      const uid = teamUid.get(t);
      if (!uid) continue;
      const key = storedFavKey(uid);
      if (!favoritesRef.current.some((f) => f.uid === key)) fresh[key] = now;
    }
    setFavorites((prev) => {
      const has = new Set(prev.map((f) => f.uid));
      const adds: FavEntry[] = [];
      for (const t of selectedTeams) {
        const uid = teamUid.get(t);
        if (!uid) continue;
        const key = storedFavKey(uid);
        if (has.has(key)) continue;
        has.add(key);
        const src = teamSrc.get(t) ?? "—";
        adds.push({ uid: key, srcName: src, srcSnap: src, team: structuredClone(t) });
      }
      return adds.length ? [...prev, ...adds] : prev;
    });
    if (Object.keys(fresh).length > 0) setFavAddedAt((prev) => ({ ...prev, ...fresh }));
  }, [selectedTeams]);

  const deleteAllSelected = useCallback(() => {
    const gone = new Set<string>();
    for (const t of selectedTeams) {
      const uid = teamUid.get(t);
      if (uid) gone.add(uid);
      deleteTeamByTeam(t);
    }
    setSelectedUids((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((u) => !gone.has(u)));
      return next;
    });
  }, [selectedTeams, deleteTeamByTeam]);

  function toggleSel(v: string, p: ParamKey) {
    setSel((s) => {
      const cur = s[p];
      return { ...s, [p]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });
    setSelOrder((o) =>
      o.some(([op, ov]) => op === p && ov === v)
        ? o.filter(([op, ov]) => !(op === p && ov === v))
        : [...o, [p, v]],
    );
  }

  const renderOptions = (p: ParamKey, opts: [string, number][]) =>
    opts.map(([v, cnt]) => {
      const on = sel[p].includes(v);
      return (
        <button
          key={`${p}:${v}`}
          type="button"
          data-opt-id={`${p}:${v}`}
          onClick={() => {
            toggleSel(v, p);
            setQuery("");
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-[#e8e2d5] transition-colors hover:bg-[#24304a]"
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${on ? "border-[#d3bc8e] bg-[#d3bc8e] text-[#1c2333]" : "border-[#4a5878]"}`}
          >
            {on && <Check className="h-3 w-3" aria-hidden />}
          </span>
          <span className="flex-1 truncate">{v}</span>
          <span className="shrink-0 text-[11px] text-[#9aa5b8] tabular-nums">{cnt}</span>
        </button>
      );
    });

  function removeSel(p: ParamKey, v: string) {
    setSel((s) => ({ ...s, [p]: s[p].filter((x) => x !== v) }));
    setSelOrder((o) => o.filter(([op, ov]) => !(op === p && ov === v)));
  }

  function clearSelAll() {
    if (searchParam === "all") {
      setSel({ ...EMPTY_SEL });
      setSelOrder([]);
    } else {
      setSel((s) => ({ ...s, [searchParam]: [] }));
      setSelOrder((o) => o.filter(([op]) => op !== searchParam));
    }
  }

  function toggleSelMode() {
    const panel = optsPanelRef.current;
    if (panel) {
      const sticky = panel.querySelector<HTMLElement>(".sticky");
      const stickyBottom = sticky ? sticky.getBoundingClientRect().bottom : panel.getBoundingClientRect().top;
      const all = [...panel.querySelectorAll<HTMLElement>("[data-opt-id]")];
      const firstIdx = all.findIndex((el) => el.getBoundingClientRect().bottom > stickyBottom + 1);
      if (firstIdx >= 0) {
        optsAnchorRef.current = {
          ids: all.slice(firstIdx, firstIdx + 6).map((el) => el.dataset.optId!),
          delta: all[firstIdx].getBoundingClientRect().top - stickyBottom,
        };
      }
    }
    setSelMode((m) => (m === "or" ? "and" : "or"));
  }

  function startTip(e: MouseEvent, t: Team, align: "left" | "right" = "left") {
    if (!window.matchMedia("(hover: hover)").matches) return;
    const el = e.currentTarget as HTMLElement;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const left =
        align === "right"
          ? Math.max(8, r.right - 320)
          : Math.max(8, Math.min(r.left, vw - 328));
      setHoverTip({ team: t, top: Math.round(r.bottom + 8), left: Math.round(left) });
    }, 500);
  }

  function cancelTip() {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    setHoverTip(null);
  }

  function scrollToStats() {
    const el = statsRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  function onSortPick(mode: SortMode) {
    if (mode === sortMode) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortMode(mode);
      setSortDir(SORTS[mode].defaultDir);
    }
  }

  function applyGrid(
    grid: ReturnType<typeof parseCsv>,
    label: string,
    type: "xlsx" | "csv",
    alignedRows = true,
    cacheKey?: string,
    batch = false,
  ): boolean {
    const parsed = parseShowcaseGrid(grid, label, type, { alignedRows });
    setPendingSheets([]);
    setError(null);
    const applied = upsertCache(cacheKey ?? label, label, type, parsed, batch);
    if (applied && cacheKey === undefined) clearHashSource();
    return applied;
  }

  function upsertCache(
    key: string,
    label: string,
    type: "xlsx" | "csv",
    parsed: ShowcaseData,
    batch = false,
  ): boolean {
    const cache = cacheRef.current;
    const activeKeys = activeKeysRef.current;
    const prev = cache.find((s) => s.key === key);
    const seq = prev ? prev.seq : cache.reduce((m, s) => Math.max(m, s.seq), 0) + 1;
    const name = prev ? prev.name : autoName(parsed);
    const entry: CachedSource = { key, label, name, seq, type, saved_at: Date.now(), data: parsed };
    const candidate = [entry, ...cache.filter((s) => s.key !== key)];
    const keys = [...new Set([...activeKeys, key])];
    const newToDisplay = !activeKeys.includes(key);
    if (batch && payloadBytes(candidate, keys) > CACHE_BUDGET_BYTES) return false;
    const written = writeCache(candidate, keys);
    const nextKeys = keys.filter((k) => written.some((w) => w.key === k));
    cacheRef.current = written;
    activeKeysRef.current = nextKeys;
    setCache(written);
    setActiveKeys(nextKeys);
    if (newToDisplay) dropSelectionOnSourceSwitch();
    return true;
  }

  function onToggleSource(key: string) {
    const cur = activeKeysRef.current;
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    const written = writeCache(cacheRef.current, next);
    const nextKeys = next.filter((k) => written.some((w) => w.key === k));
    cacheRef.current = written;
    activeKeysRef.current = nextKeys;
    setCache(written);
    setActiveKeys(nextKeys);
    setNotice(null);
    dropSelectionOnSourceSwitch();
  }

  function onRenameSource(key: string, name: string) {
    const written = writeCache(
      cacheRef.current.map((s) => (s.key === key ? { ...s, name } : s)),
      activeKeysRef.current,
    );
    const nextKeys = activeKeysRef.current.filter((k) => written.some((w) => w.key === k));
    cacheRef.current = written;
    activeKeysRef.current = nextKeys;
    setCache(written);
    setActiveKeys(nextKeys);
  }

  function onRemoveCached(key: string) {
    const wasActive = activeKeysRef.current.includes(key);
    const keys = activeKeysRef.current.filter((k) => k !== key);
    const written = writeCache(
      cacheRef.current.filter((s) => s.key !== key),
      keys,
    );
    const nextKeys = keys.filter((k) => written.some((w) => w.key === k));
    cacheRef.current = written;
    activeKeysRef.current = nextKeys;
    setCache(written);
    setActiveKeys(nextKeys);
    if (wasActive) dropSelectionOnSourceSwitch();
  }

  async function onFiles(list: File[]) {
    if (list.length === 0) return;
    setError(null);
    setNotice(null);
    setPendingSheets([]);
    const manual: { sheets: WorkbookSheets; file: string }[] = [];
    let done = 0;
    let skipped = 0;
    const batch = list.length > 1;
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const tag = batch ? `файл ${i + 1} из ${list.length}: ` : "";
      const name = file.name.toLowerCase();
      try {
        if (name.endsWith(".csv") || file.type === "text/csv") {
          setBusy(`${tag}Читаю ${file.name}…`);
          const text = await file.text();
          if (applyGrid(parseCsv(text), file.name, "csv", true, undefined, batch)) done++;
          else skipped++;
        } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          setBusy(`${tag}Читаю ${file.name}…`);
          const buf = await file.arrayBuffer();
          const sheets = readWorkbook(buf);
          const auto = pickShowcaseSheet(sheets.names);
          if (auto) {
            if (applyGrid(sheets.getGrid(auto), `${file.name} · лист «${auto}»`, "xlsx", true, undefined, batch)) done++;
            else skipped++;
          } else if (sheets.names.length === 1) {
            if (
              applyGrid(
                sheets.getGrid(sheets.names[0]),
                `${file.name} · «${sheets.names[0]}»`,
                "xlsx",
                true,
                undefined,
                batch,
              )
            )
              done++;
            else skipped++;
          } else {
            manual.push({ sheets, file: file.name });
          }
        } else {
          setError(`«${file.name}»: поддерживаются только файлы .xlsx и .csv.`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    if (skipped > 0) {
      setNotice({
        text: `бюджет кэша (${CACHE_BUDGET_BYTES / (1024 * 1024)} МиБ) исчерпан — загружено ${done}, пропущено ${skipped}`,
        kind: "ok",
      });
    }
    if (manual.length > 0) {
      setPendingSheets(manual);
      const m = manual[0];
      setError(
        `В книге «${m.file}» ${m.sheets.names.length} листов, но листа «Showcase» среди них нет. ` +
          "Выберите нужный лист вручную." +
          (manual.length > 1 ? ` Ещё в очереди на выбор: ${manual.length - 1}.` : ""),
      );
    }
    setBusy(null);
  }

  async function onLink(url: string, opts?: { fromHash?: boolean }): Promise<boolean> {
    setError(null);
    setNotice(null);
    setPendingSheets([]);
    try {
      setBusy("Скачиваю лист по ссылке…");
      const { text, via, sid, gid } = await fetchSheetCsv(url);
      applyGrid(
        parseCsv(text),
        `Google Sheets · ${via === "export" ? "CSV" : "gviz CSV"} · ${gid ?? sid.slice(-4)}`,
        "csv",
        via === "export",
        url,
      );
      if (opts?.fromHash) {
        writeHashSource(url);
      } else {
        const cur = readHashSource();
        if (cur !== null && cur !== url) clearHashSource();
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  function onPickSheet(name: string) {
    const head = pendingSheets[0];
    if (!head) return;
    const rest = pendingSheets.slice(1);
    try {
      applyGrid(
        head.sheets.getGrid(name),
        `${head.file} · лист «${name}»`,
        "xlsx",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (rest.length > 0) setPendingSheets(rest);
    }
  }

  function onDemo() {
    setHiddenDemo(false);
    setNotice(null);
    setError(null);
    setPendingSheets([]);
    setQuery("");
    clearHashSource();
    setFavOn(false);
    const written = writeCache(cacheRef.current, []);
    cacheRef.current = written;
    activeKeysRef.current = [];
    setCache(written);
    setActiveKeys([]);
    dropSelectionOnSourceSwitch();
  }

  function onToggleFavorites() {
    setFavOn((v) => !v);
    setNotice(null);
    dropSelectionOnSourceSwitch();
  }

  function onHideDemo() {
    setHiddenDemo(true);
    setNotice(null);
    dropSelectionOnSourceSwitch();
  }

  function setHiddenDemo(hidden: boolean) {
    setDemoHidden(hidden);
    try {
      if (hidden) localStorage.setItem("showcase-demo-hidden", "1");
      else localStorage.removeItem("showcase-demo-hidden");
    } catch {
    }
  }

  const hasChips = PARAM_KEYS.some((p) => sel[p].length > 0);

  return (
    <TipProvider>
      <div className="flex min-h-screen flex-col bg-[#141c2b] text-[#e8e2d5]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(1200px_360px_at_50%_-120px,#1e2c47_0%,transparent_70%)]"
      />
      <div ref={pageContainerRef} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-12 sm:px-6">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <Tip label="Проект в активной разработке: интерфейс и данные могут меняться">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#8a6d3b] bg-[#2a2113] px-3 py-1 text-[11px] leading-[16px] font-semibold tracking-widest text-[#e5c07b] uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e5c07b] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#e5c07b]" />
                </span>
                WIP — Alpha
              </span>
            </Tip>
          </div>
          <h1 className="mt-3 text-2xl leading-snug font-semibold tracking-wide text-[#d3bc8e]">
            CalcCraft{" "}
            <span className="text-[#e8e2d5]">
              — Удобная визуализация, сортировка и генерация эстетичных карточек из ваших расчетных
              таблиц Genshin Impact.
            </span>
          </h1>
          <p className="mt-2 text-[13.5px] leading-[20px] text-[#9aa5b8]">
            Загрузите CSV, xlsx или ссылку на лист Google-таблицы — команды будут извлечены
            автоматически. Если данные распознаны неверно, вы сможете отредактировать их или
            создать свой шаблон.
          </p>
        </header>

        <SourcePanel
          onFiles={onFiles}
          onLink={onLink}
          onDemo={onDemo}
          onHideDemo={onHideDemo}
          demoHidden={demoHidden}
          onPickSheet={onPickSheet}
          onRemoveCached={onRemoveCached}
          onLinkCleared={() => setError(null)}
          cachedSources={cache}
          activeKeys={activeKeys}
          hoverSourceKey={hoverSrcKey}
          busy={busy}
          error={error}
          notice={notice}
          onRestoreTrash={restoreFromTrash}
          sourceLabel={sourceLabel}
          pendingSheets={pendingSheets}
        />

        <section
          ref={statsRef}
          aria-label="Настройка контента"
          className="stats-sec mt-5 flex flex-wrap items-center gap-3"
        >
          <div className="stats-cells">
            <SourcesMenu
              sources={cache}
              activeKeys={activeKeys}
              demoHidden={demoHidden}
              onToggle={onToggleSource}
              onRename={onRenameSource}
              onHover={setHoverSrcKey}
              favoritesCount={favorites.length}
              favoritesOn={favOn}
              onToggleFavorites={onToggleFavorites}
            />
          </div>

          <div className="stats-controls flex items-center gap-2.5">
            <div
              ref={sortRootRef}
              className="stats-sort relative flex min-w-0"
            >
              <Tip label="Повторный выбор того же пункта меняет направление сортировки">
                <button
                  type="button"
                  aria-label="Сортировка"
                  aria-haspopup="menu"
                  aria-expanded={sortOpen}
                  onClick={() => {
                    setOptsOpen(false);
                    setParamOpen(false);
                    setSortOpen((o) => !o);
                  }}
                  className={
                    "stats-sort-btn flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-[#1d2739] px-3 text-[13.5px] text-[#e8e2d5] transition-colors hover:border-[#a68b5c] " +
                    (sortOpen ? "border-[#a68b5c]" : "border-[#2f3d59]")
                  }
                >
                  <span className="truncate">
                    Сортировка:{" "}
                    <b
                      data-sort-label
                      suppressHydrationWarning
                      className="font-normal"
                      dangerouslySetInnerHTML={{
                        __html: escapeHtml(
                          `${SORTS[sortMode].label} ${sortDir === "asc" ? "↑" : "↓"}`,
                        ),
                      }}
                    />
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                </button>
              </Tip>
              {sortOpen && (
                <div
                  data-sort-menu
                  role="menu"
                  aria-label="Сортировка"
                  className="absolute top-full left-0 z-50 mt-1 w-56 rounded-md border border-[#2f3d59] bg-[#1d2739] p-1 shadow-xl shadow-black/40 animate-in fade-in slide-in-from-top-2 animation-duration-150 will-change-transform"
                >
                  {(Object.keys(SORTS) as SortMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSortPick(m);
                        setSortOpen(false);
                      }}
                      className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-[13.5px] text-[#e8e2d5] transition-colors hover:bg-[#24304a] focus-visible:bg-[#24304a] focus-visible:outline-none"
                    >
                      <span className="flex-1">{SORTS[m].label}</span>
                      {m === sortMode && <Check className="h-4 w-4 shrink-0 text-[#d3bc8e]" aria-hidden />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              role="group"
              aria-label="Вид отображения"
              className="flex h-9 shrink-0 overflow-hidden rounded-md border border-[#2f3d59]"
            >
              <Tip label="Крупные">
                <button
                  type="button"
                  onClick={() => switchView("cards")}
                  aria-pressed={view === "cards"}
                  aria-label="Карточки"
                  className={
                    "view-toggle-cards flex w-9 items-center justify-center transition-colors duration-300 ease-out " +
                    (view === "cards"
                      ? "bg-[#d3bc8e] text-[#1c2333]"
                      : "text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#d3bc8e]")
                  }
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
                    <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
                    <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
                    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
                  </svg>
                </button>
              </Tip>
              <Tip label="Компактные">
                <button
                  type="button"
                  onClick={() => switchView("compact")}
                  aria-pressed={view === "compact"}
                  aria-label="Компактные карточки"
                  className={
                    "view-toggle-compact flex w-9 items-center justify-center border-l border-[#2f3d59] transition-colors duration-300 ease-out " +
                    (view === "compact"
                      ? "bg-[#d3bc8e] text-[#1c2333]"
                      : "text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#d3bc8e]")
                  }
                >
                  <svg
                    viewBox="0 0 25 16"
                    className="h-4 w-[25px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="3.5" y="2.5" width="4" height="4" rx="1" />
                    <rect x="10.5" y="2.5" width="4" height="4" rx="1" />
                    <rect x="17.5" y="2.5" width="4" height="4" rx="1" />
                    <rect x="3.5" y="9.5" width="4" height="4" rx="1" />
                    <rect x="10.5" y="9.5" width="4" height="4" rx="1" />
                    <rect x="17.5" y="9.5" width="4" height="4" rx="1" />
                  </svg>
                </button>
              </Tip>
              <Tip label="Список">
                <button
                  type="button"
                  onClick={() => switchView("rows")}
                  aria-pressed={view === "rows"}
                  aria-label="Список"
                  className={
                    "view-toggle-rows flex w-9 items-center justify-center border-l border-[#2f3d59] transition-colors duration-300 ease-out " +
                    (view === "rows"
                      ? "bg-[#d3bc8e] text-[#1c2333]"
                      : "text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#d3bc8e]")
                  }
                >
                  <Rows3 className="h-4 w-4" aria-hidden />
                </button>
              </Tip>
            </div>
          </div>
        </section>

        <div
          ref={searchSentinelRef}
          aria-hidden
          className="h-px -mb-px"
        />
        <section
          aria-label="Поиск"
          className={`${SEARCH_STICKY ? "sticky top-0 " : ""}${searchStuck ? "z-[60]" : "z-30"} -mx-4 mt-1.5 bg-[#141c2b]/95 px-4 pt-1.5 sm:-mx-6 sm:px-6`}
        >
          {searchStuck && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-full h-3.5 bg-gradient-to-b from-[#141c2b]/95 to-transparent"
            />
          )}
          <div
            ref={searchRootRef}
            className="relative flex w-full items-start gap-1.5 rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 py-1.5 focus-within:border-[#a68b5c]"
          >
            <Tip label="Вставить из буфера">
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => void pasteIntoSearch()}
                aria-label="Вставить в поиск"
                className="flex h-[21px] shrink-0 items-center justify-center text-[#9aa5b8] transition-colors hover:text-[#d3bc8e] [@media(pointer:coarse)]:hidden!"
              >
                <ClipboardPaste className="size-3.5" aria-hidden />
              </button>
            </Tip>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 max-h-[calc(5*21px+4*6px)] overflow-y-auto">
              {selOrder.map(([p, v]) => (
                <button
                  key={`${p}:${v}`}
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeSel(p, v)}
                  aria-label={`${SEARCH_PARAMS[p]} — убрать фильтр`}
                  className="flex max-w-40 shrink-0 items-center gap-1 rounded bg-[#24304a] px-1.5 py-0.5 text-[11.5px] leading-[17px] text-[#e8e2d5] transition-colors hover:bg-[#2f3d59]"
                >
                  <span className="truncate">{v}</span>
                  <X className="h-3 w-3 shrink-0 text-[#9aa5b8]" aria-hidden />
                </button>
              ))}
              <Tip
                side="top"
                sideOffset={13}
                label={
                  <>
                    • Enter – выбор
                    <br />• Ctrl + Backspace – удаляет крайний правый чип
                    <br />• Ctrl + Delete – стирает все чипы
                  </>
                }
              >
                <span className="flex min-w-24 flex-1">
                  <input
                    ref={searchInputRef}
                    type="search"
                    aria-label="Поиск по командам"
                    placeholder={hasChips ? "" : "Поиск: Ctrl+K или /"}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setOptsOpen(true);
                    }}
                    onClick={() => {
                      setOptsOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        if (optsOpen) {
                          setOptsOpen(false);
                        } else {
                          setQuery("");
                          e.currentTarget.blur();
                        }
                        return;
                      }
                      if (!e.altKey && (e.ctrlKey || e.metaKey) && !e.currentTarget.value) {
                        if (e.key === "Backspace" || e.key === "Delete") {
                          e.preventDefault();
                          if (e.key === "Delete") {
                            setSel({ ...EMPTY_SEL });
                            setSelOrder([]);
                          } else {
                            if (selOrder.length > 0) {
                              const [lp, lv] = selOrder[selOrder.length - 1];
                              setSelOrder((o) => o.slice(0, -1));
                              setSel((s) => ({ ...s, [lp]: s[lp].filter((x) => x !== lv) }));
                            }
                          }
                          return;
                        }
                      }
                      if (e.key !== "Enter") return;
                      if (!query.trim()) return;
                      let pickP: ParamKey | null = null;
                      let pickV: string | null = null;
                      if (searchParam === "all") {
                        for (const p of PARAM_KEYS) {
                          if (optionsByParam[p].length > 0) {
                            pickP = p;
                            pickV = optionsByParam[p][0][0];
                            break;
                          }
                        }
                      } else if (optionsByParam[searchParam].length > 0) {
                        pickP = searchParam;
                        pickV = optionsByParam[searchParam][0][0];
                      }
                      if (pickP === null || pickV === null) return;
                      const p = pickP;
                      const v = pickV;
                      setSel((s) => (s[p].includes(v) ? s : { ...s, [p]: [...s[p], v] }));
                      setSelOrder((o) =>
                        o.some(([op, ov]) => op === p && ov === v) ? o : [...o, [p, v]],
                      );
                      setQuery("");
                    }}
                    onFocus={(e) => {
                      e.stopPropagation();
                      setOptsOpen(true);
                    }}
                    onBlur={(e) => {
                      e.stopPropagation();
                    }}
                    className="w-full [touch-action:pan-y_pinch-zoom] bg-transparent text-[13.5px] leading-[21px] text-[#e8e2d5] outline-none placeholder:text-[#6b7893] [&::-webkit-search-cancel-button]:hidden"
                  />
                </span>
              </Tip>
            </div>
            {(query.length > 0 || hasChips) && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setQuery("");
                  setSel({ ...EMPTY_SEL });
                  setSelOrder([]);
                  setOptsOpen(false);
                }}
                aria-label="Очистить поиск: текст и все фильтры"
                className="mt-[2.5px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#2f3d59] text-[#9aa5b8] transition-colors hover:border-[#435680] hover:text-[#e8e2d5]"
              >
                <X className="h-2.5 w-2.5" aria-hidden />
              </button>
            )}
            <div ref={paramRootRef} className="shrink-0">
              <Tip label="Параметр поиска">
                <button
                  type="button"
                  aria-label="Параметр поиска"
                  aria-haspopup="menu"
                  aria-expanded={paramOpen}
                  onClick={() => {
                    setSortOpen(false);
                    setParamOpen((o) => !o);
                  }}
                  className="flex h-[21px] items-center gap-1 border-l border-[#2f3d59] pl-2.5 text-[12px] whitespace-nowrap text-[#9aa5b8] transition-colors hover:text-[#e8e2d5]"
                >
                  {SEARCH_PARAMS[searchParam]}
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </button>
              </Tip>
              {paramOpen && (
                <div
                  data-param-menu
                  role="menu"
                  aria-label="Параметр поиска"
                  className="absolute top-full right-0 z-[55] mt-1 w-32 rounded-md border border-[#2f3d59] bg-[#1d2739] p-1 shadow-xl shadow-black/40 animate-in fade-in slide-in-from-top-2 animation-duration-150 will-change-transform"
                >
                  {(Object.keys(SEARCH_PARAMS) as SearchParam[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSearchParam(p);
                        setOptsOpen(true);
                        setParamOpen(false);
                      }}
                      className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-[13px] text-[#e8e2d5] transition-colors hover:bg-[#24304a] focus-visible:bg-[#24304a] focus-visible:outline-none"
                    >
                      <span className="flex-1 truncate">{SEARCH_PARAMS[p]}</span>
                      {p === searchParam && <Check className="h-4 w-4 shrink-0 text-[#d3bc8e]" aria-hidden />}
                    </button>
                  ))}
                </div>
              )}
            </div>

              {optsOpen && (
                <div
                  ref={optsPanelRef}
                  data-opts-panel
                  onScroll={(e) => setOptsStuck(e.currentTarget.scrollTop > 0)}
                  className="absolute top-full right-0 left-0 z-50 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-[#2f3d59] bg-[#1d2739] px-1 pb-1 shadow-xl shadow-black/40 animate-in fade-in slide-in-from-top-2 animation-duration-150 will-change-transform"
                >
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#1d2739] px-2.5 pt-2.5 pb-1.5">
                    {optsStuck && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-full h-3.5 bg-gradient-to-b from-[#1d2739] to-transparent"
                      />
                    )}
                    <span className="mr-auto flex min-w-0 shrink-0 items-center gap-1.5">
                      <span className="text-[11.5px] leading-none whitespace-nowrap text-[#9aa5b8]">
                        Выбрано:
                      </span>
                      {selCount > 0 ? (
                        <Tip label="Убрать все выбранные варианты">
                          <button
                            type="button"
                            onClick={clearSelAll}
                            aria-label="Убрать всё"
                            className="flex shrink-0 items-center gap-1 rounded bg-[#24304a] px-1.5 py-[calc(var(--spacing)*0.8)] text-[11.5px] leading-none text-[#e8e2d5] transition-colors hover:bg-[#2f3d59]"
                          >
                            {selCount}
                            <X className="h-3 w-3 shrink-0 text-[#9aa5b8]" aria-hidden />
                          </button>
                        </Tip>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1 rounded px-1.5 py-[calc(var(--spacing)*0.8)] text-[11.5px] leading-none text-[#e8e2d5]">
                          0
                          <X className="h-3 w-3 shrink-0 invisible" aria-hidden />
                        </span>
                      )}
                    </span>
                    <span
                      role="group"
                      aria-label="Режим выбора вариантов"
                      className="flex shrink-0 overflow-hidden rounded border border-[#4a5878] text-[10px] font-semibold leading-none"
                    >
                      <Tip label="Есть хотя бы один выбранный вариант">
                        <button
                          type="button"
                          onClick={toggleSelMode}
                          aria-pressed={selMode === "or"}
                          className={
                            selMode === "or"
                              ? "bg-[#d3bc8e] px-1.5 py-1 text-[#1c2333] transition-colors duration-300 ease-out"
                              : "px-1.5 py-1 text-[#9aa5b8] transition-colors hover:bg-[#24304a] hover:text-[#e8e2d5] duration-300 ease-out"
                          }
                        >
                          Любое
                        </button>
                      </Tip>
                      <Tip label="Есть все выбранные варианты одновременно">
                        <button
                          type="button"
                          onClick={toggleSelMode}
                          aria-pressed={selMode === "and"}
                          className={
                            selMode === "and"
                              ? "bg-[#d3bc8e] px-1.5 py-1 text-[#1c2333] transition-colors duration-300 ease-out"
                              : "px-1.5 py-1 text-[#9aa5b8] transition-colors hover:bg-[#24304a] hover:text-[#e8e2d5] duration-300 ease-out"
                          }
                        >
                          Только
                        </button>
                      </Tip>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-1.5">
                    <span className="text-[10.5px] leading-none tracking-wider whitespace-nowrap text-[#6b7893] uppercase">
                      {searchParam === "all" ? "Персонаж" : SEARCH_PARAMS[searchParam]}
                    </span>
                    <span className="h-px min-w-0 flex-1 bg-[#2f3d59]" aria-hidden />
                  </div>
                  {searchParam === "all" ? (
                    <>
                      {PARAM_KEYS.map((p, i) => {
                        const opts = optionsByParam[p];
                        if (opts.length === 0) return null;
                        return (
                          <Fragment key={p}>
                            {i > 0 && (
                              <div className="flex items-center gap-2 px-2.5 pt-4 pb-1.5">
                                <span className="text-[10.5px] leading-none tracking-wider whitespace-nowrap text-[#6b7893] uppercase">
                                  {SEARCH_PARAMS[p]}
                                </span>
                                <span className="h-px min-w-0 flex-1 bg-[#2f3d59]" aria-hidden />
                              </div>
                            )}
                            {renderOptions(p, opts)}
                          </Fragment>
                        );
                      })}
                      {PARAM_KEYS.every((p) => optionsByParam[p].length === 0) && (
                        <div className="px-2.5 py-3 text-center text-[12.5px] text-[#6b7893]">
                          Нет вариантов
                        </div>
                      )}
                    </>
                  ) : optionsByParam[searchParam].length > 0 ? (
                    renderOptions(searchParam, optionsByParam[searchParam])
                  ) : (
                    <div className="px-2.5 py-3 text-center text-[12.5px] text-[#6b7893]">
                      Нет вариантов
                    </div>
                  )}
                </div>
              )}
          </div>
          <div className="h-2.5 border-b border-[#2f3d59]/70" />
        </section>

        <div className="relative mt-3 flex items-center">
          <p
            data-teams-count
            className="min-w-0 flex-1 pl-[15px] pr-3 text-[12.5px] leading-[19px] text-[#9aa5b8]"
            aria-live="polite"
          >
            Показано команд: {visible.length} из {teams.length}
            {data.slots_total > teams.length && ` (слотов в сетке: ${data.slots_total})`}
          </p>
          <GeneralMenu
            selectedCount={selectedUids.size}
            onClearSelection={clearSelection}
            multiSelect={multiSelect}
            onToggleMultiSelect={toggleMultiSelect}
            onSelectAll={selectAllVisible}
            onFavoriteAll={favoriteAllSelected}
            onDeleteAll={deleteAllSelected}
            onExportAll={exportAllSelected}
            onEditAll={editAllSelected}
            canDelete={menuDelete !== undefined}
            favSourceOnly={favSourceOnly}
          />
        </div>

        <main
          data-teams-main
          aria-label="Команды"
          className={
            "transition-opacity duration-150 motion-reduce:transition-none " +
            (viewFading ? "opacity-0" : "opacity-100")
          }
        >
          {visible.length > 0 ? (
            <>
              <div
                data-view-cards
                className={
                  view === "cards"
                    ? "mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(420px,100%),1fr))] gap-4"
                    : "hidden"
                }
              >
                {visible.map((t) => {
                  const uid = teamUid.get(t) ?? t.slot;
                  const favKey = storedFavKey(uid);
                  return (
                    <TeamCard
                      key={uid}
                      team={t}
                      source={teamSrc.get(t)}
                      favorite={favSet.has(favKey)}
                      favSrc={uid.startsWith("fav::") ? favSnapMap.get(favKey) : undefined}
                      favAddedAt={favAddedAt[favKey]}
                      selected={selectedUids.has(uid)}
                      onToggleFavorite={toggleFavoriteByTeam}
                      onToggleSelect={toggleSelectByTeam}
                      onEdit={menuEdit}
                      onDelete={menuDelete}
                      onExport={menuExport}
                      multiSelect={multiSelect}
                    />
                  );
                })}
              </div>
              <div
                data-view-compact
                className={
                  view === "compact"
                    ? "mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    : "hidden"
                }
              >
                {visible.map((t) => {
                  const uid = teamUid.get(t) ?? t.slot;
                  const favKey = storedFavKey(uid);
                  return (
                    <TeamCompactCard
                      key={uid}
                      team={t}
                      source={teamSrc.get(t)}
                      favorite={favSet.has(favKey)}
                      favSrc={uid.startsWith("fav::") ? favSnapMap.get(favKey) : undefined}
                      favAddedAt={favAddedAt[favKey]}
                      selected={selectedUids.has(uid)}
                      onToggleFavorite={toggleFavoriteByTeam}
                      onToggleSelect={toggleSelectByTeam}
                      onEdit={menuEdit}
                      onDelete={menuDelete}
                      onExport={menuExport}
                      multiSelect={multiSelect}
                    />
                  );
                })}
              </div>
              <div
                data-view-rows
                className={view === "rows" ? "mt-3 flex flex-col gap-1.5" : "hidden"}
              >
                {visible.map((t) => {
                  const uid = teamUid.get(t) ?? t.slot;
                  const open = openUid === uid;
                  const favKey = storedFavKey(uid);
                  const fav = favSet.has(favKey);
                  const favSrc = uid.startsWith("fav::") ? favSnapMap.get(favKey) : undefined;
                  const favAdded = favAddedAt[favKey];
                  const sel = selectedUids.has(uid);
                  const chipHold = longPress(fav ? undefined : () => toggleFavoriteByTeam(t));
                  const chevHold = longPress(
                    isMobile && !fav ? () => toggleFavoriteByTeam(t) : undefined,
                  );
                  const slotInfo = parseSlot(t.slot);
                  const chipTip: ReactNode = !slotInfo
                    ? "—"
                    : favSrc != null
                      ? (
                          <>
                            • {`Ряд ${slotInfo.row}, колонка ${slotInfo.col}.`}
                            {t.range ? ` Диапазон ${t.range}.` : ""}
                            <br />• {`В избранном. Источник: «${favSrc}».`}
                          </>
                        )
                      : `Ряд ${slotInfo.row}, колонка ${slotInfo.col}.` +
                        (t.range ? ` Диапазон ${t.range}.` : "") +
                        (fav ? " В избранном." : "");
                  return (
                    <Fragment key={uid}>
                      <button
                        type="button"
                        onClick={(e) => {
                          if (e.target instanceof Element && e.target.closest(".team-menu, [data-row-slot]")) return;
                          if (
                            multiSelect &&
                            !(e.target instanceof Element && e.target.closest("[data-row-chevron]"))
                          ) {
                            toggleSelectByTeam(t);
                            return;
                          }
                          setOpenUid(open ? null : uid);
                          cancelTip();
                        }}
                        aria-expanded={open}
                        className={
                          "team-row flex w-full items-center gap-3 rounded-lg border px-3.5 py-2 text-left leading-[20px] transition-colors " +
                          (sel
                            ? "border-dashed border-[#cd890b] hover:border-[#f1a10d] " +
                              (open ? "bg-[#24304a]" : "bg-[#1d2739] hover:bg-[#24304a]")
                            : open
                              ? "border-[#a68b5c] bg-[#24304a]"
                              : "border-[#2f3d59] bg-[#1d2739] hover:border-[#a68b5c] hover:bg-[#24304a]")
                        }
                      >
                        <span className="flex min-w-0 flex-1 items-center overflow-hidden text-[13px] sm:text-[13.5px] [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]">
                          <span
                            onMouseEnter={(e) => startTip(e, t)}
                            onMouseLeave={cancelTip}
                            className="team-row-name max-w-full whitespace-nowrap text-[#e8e2d5]"
                          >
                            {teamDisplayName(t) || "—"}
                          </span>
                        </span>
                        <span
                          onMouseEnter={(e) => startTip(e, t, "right")}
                          onMouseLeave={cancelTip}
                          className="shrink-0 text-[12.5px] tabular-nums text-[#d3bc8e] sm:text-[13px]"
                        >
                          <span className="sm:hidden">{fmtKilo(teamDisplayDps(t))}</span>
                          <span className="hidden sm:inline">{fmtInt(teamDisplayDps(t))}</span>
                        </span>
                        <span
                          {...chipHold}
                          data-row-slot
                          tabIndex={0}
                          role="button"
                          aria-label={`Слот ${t.slot}: подробности`}
                          aria-haspopup="dialog"
                          aria-expanded={slotPopupUid === uid}
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setSlotPopupUp(window.innerHeight - r.bottom < 84);
                            setSlotPopupUid((cur) => (cur === uid ? null : uid));
                          }}
                          className={
                            "relative hidden shrink-0 cursor-pointer rounded px-1.5 text-[11px] leading-[16px] whitespace-nowrap tabular-nums transition-colors sm:inline-block select-none [-webkit-touch-callout:none] [touch-action:pan-y_pinch-zoom] " +
                            (fav
                              ? "py-0.5 bg-[#1e3729] text-[#6dab8a] hover:bg-[#233f2f] hover:text-[#73b592]"
                              : "py-0.5 bg-[#24304a] text-[#9aa5b8] hover:bg-[#2c3b5c]")
                          }
                        >
                          {t.slot}
                          {slotPopupUid === uid && (
                            <span
                              ref={(n) => {
                                rowSlotPanelRef.current = n;
                              }}
                              role="dialog"
                              aria-label={`Слот ${t.slot}: подробности`}
                              className={
                                "absolute right-0 z-50 w-max max-w-[calc(100vw-2rem)] whitespace-normal rounded-md border border-[#2f3d59] bg-[#1d2739] p-3 text-left text-xs leading-relaxed text-[#e8e2d5] shadow-md select-text cursor-auto animate-in fade-in animation-duration-150 will-change-transform " +
                                (slotPopupUp ? "bottom-full mb-1 slide-in-from-bottom-2 " : "top-full mt-1 slide-in-from-top-2 ")
                              }
                            >
                              {chipTip}
                            </span>
                          )}
                        </span>
                        <TeamMenu
                          size="row"
                          team={t}
                          favorite={fav}
                          favAddedAt={favAdded}
                          selected={sel}
                          onToggleFavorite={toggleFavoriteByTeam}
                          onToggleSelect={toggleSelectByTeam}
                          onEdit={menuEdit}
                          onDelete={menuDelete}
                          onExport={menuExport}
                        />
                        <span
                          data-row-chevron
                          {...chevHold}
                          className="-my-2 -mx-2 flex shrink-0 items-center justify-center py-2 pl-2 pr-3 select-none [-webkit-touch-callout:none] [touch-action:pan-y_pinch-zoom]"
                        >
                          <ChevronDown
                            className={
                              "h-4 w-4 shrink-0 text-[#9aa5b8] transition-transform duration-200 " +
                              (open ? "rotate-180 " : "") +
                              (fav ? "max-sm:text-[#74ba95]" : "")
                            }
                            aria-hidden
                          />
                        </span>
                      </button>
                      {open && (
                        <div className="animate-in fade-in slide-in-from-top-2 animation-duration-200 will-change-transform">
                          <TeamCard
                            team={t}
                            highlight
                            source={teamSrc.get(t)}
                            favorite={fav}
                            favSrc={favSrc}
                            favAddedAt={favAdded}
                            selected={sel}
                            onToggleFavorite={toggleFavoriteByTeam}
                            onToggleSelect={toggleSelectByTeam}
                            onEdit={menuEdit}
                            onDelete={menuDelete}
                            multiSelect={multiSelect}
                          />
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </>
          ) : teams.length === 0 ? (
            <div className="mt-3 rounded-xl border border-[#2f3d59] bg-[#1d2739] p-10 text-center">
              <p className="text-[15px] leading-[22px] text-[#e8e2d5]">Демо-показ скрыт</p>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-[19px] text-[#9aa5b8]">
                Загрузите xlsx, CSV или ссылку на лист Google-таблицы, отметьте сохранённые
                источники в списке «Источники» — или верните демо кнопкой «↺ Демо-данные».
              </p>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-[#2f3d59] bg-[#1d2739] p-10 text-center text-[15px] text-[#9aa5b8]">
              Ничего не найдено
            </p>
          )}
        </main>

        {hoverTip && (
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 w-80 max-w-[calc(100vw-16px)] rounded-lg border border-[#435680] bg-[#1d2739] p-2.5 shadow-xl shadow-black/40 animate-in fade-in slide-in-from-top-2 animation-duration-150 will-change-transform"
            style={{ top: hoverTip.top, left: hoverTip.left }}
          >
            {sortedCharacters(hoverTip.team).map((c, i) => {
              const color = CHAR_COLORS[i % CHAR_COLORS.length];
              const share = charDamageShare(hoverTip.team, c);
              const { cons, base } = charNameParts(c);
              const gear = characterGear(c);
              return (
                <div key={c.name} className="border-t border-black/25 py-1.5 first:border-t-0">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold leading-none text-[#e8e2d5]">
                    {cons && <span className="text-[11px] text-[#d3bc8e]">{cons} </span>}
                      {base}
                    </span>
                    <span className="shrink-0 font-semibold text-[#e8e2d5] tabular-nums">
                      {fmtInt(c.damage)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 pl-4 text-[10.5px] text-[#9aa5b8]">
                    <span className="min-w-0 truncate">{gear || "—"}</span>
                    <span className="shrink-0 tabular-nums">
                      {share.toFixed(1)}%{c.field_time_s != null ? ` · ${fmt1(c.field_time_s)}с` : ""}
                    </span>
                  </div>
                </div>
              );
            })}
            {(() => {
              const tipExtra = extraDamageOrNull(hoverTip.team);
              if (!tipExtra) return null;
              const tipExtraPct = extraDamagePercent(hoverTip.team);
              return (
                <div className="border-t border-black/25 py-1.5">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: EXTRA_COLOR }}
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold leading-none text-[#e8e2d5]">
                      {tipExtra.name}
                    </span>
                    <span className="shrink-0 font-semibold text-[#e8e2d5] tabular-nums">
                      {fmtInt(tipExtra.damage)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 pl-4 text-[10.5px] text-[#9aa5b8]">
                    <span className="min-w-0 truncate">{tipExtra.note ?? ""}</span>
                    <span className="shrink-0 tabular-nums">
                      {tipExtraPct != null ? `${tipExtraPct.toFixed(1)}%` : ""}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <button
        ref={topBtnRef}
        type="button"
        data-show="false"
        data-menu-open={optsOpen || sortOpen || paramOpen ? "true" : "false"}
        onClick={scrollToStats}
        aria-label="Наверх"
        className="pointer-events-none fixed right-5 bottom-5 z-40 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full border border-[#a68b5c] bg-[#1d2739] text-[#d3bc8e] opacity-0 shadow-lg shadow-black/40 transition-all duration-200 hover:bg-[#24304a] data-[show=true]:pointer-events-auto data-[show=true]:translate-y-0 data-[show=true]:opacity-100"
      >
        <ArrowUp className="h-5 w-5" aria-hidden />
      </button>

      {editTeam && (
        <CardEditModal
          team={editTeam}
          favSrcName={editFavSrc}
          onApply={(updated, favSrc) => {
            editTeamByTeam(editTeam, updated, favSrc);
            setEditTeam(null);
            setEditFavSrc(null);
          }}
          onClose={() => {
            setEditTeam(null);
            setEditFavSrc(null);
          }}
        />
      )}

      {editBatch && editBatch.length > 0 && (
        <CardsBatchEditModal
          cards={editBatch}
          onApply={applyBatchEdit}
          onClose={() => setEditBatch(null)}
        />
      )}

      {exportCards && exportCards.length > 0 && (
        <ExportModal
          cards={exportCards}
          pageSort={{ mode: sortMode, dir: sortDir }}
          pageView={view}
          sortForExport={sortForExport}
          onClose={() => setExportCards(null)}
        />
      )}

      <footer className="mt-auto border-t border-[#2f3d59] bg-[#101724] py-4 text-center text-[11.5px] text-[#9aa5b8]">
        Последнее обновление {STAMP_DATE} UTC

        {!process.env.NEXT_PUBLIC_BASE_PATH && (
          <>
            <br />
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    const res = await fetch("/showcase-site-source.zip", { cache: "no-store" });
                    if (!res.ok) throw new Error(String(res.status));
                    const blob = await res.blob();
                    const d = new Date();
                    const p = (n: number) => String(n).padStart(2, "0");
                    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `CalcCraft_${stamp}_${STAMP_COMMIT}_${STAMP_ROUND}_${STAMP_TASK}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
                  } catch {
                    const a = document.createElement("a");
                    a.href = "/showcase-site-source.zip";
                    a.download = "";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }
                })();
              }}
              className="mt-1 inline-block rounded-md border border-[#2f3d59] bg-[#1d2739] px-3 py-1.5 text-[12px] text-[#d3bc8e] hover:border-[#d3bc8e]"
            >
              ⬇ Скачать исходники сайта (CalcCraft_дата_время_коммит_R-T.zip)
            </button>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    const res = await fetch("/api/bundle", { cache: "no-store" });
                    if (!res.ok) throw new Error(String(res.status));
                    const blob = await res.blob();
                    const d = new Date();
                    const p = (n: number) => String(n).padStart(2, "0");
                    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `CalcCraft_repo_${stamp}_${STAMP_COMMIT}_${STAMP_ROUND}_${STAMP_TASK}.bundle`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
                  } catch {
                    const a = document.createElement("a");
                    a.href = "/api/bundle";
                    a.download = "";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }
                })();
              }}
              className="ml-2 mt-1 inline-block rounded-md border border-[#2f3d59] bg-[#1d2739] px-3 py-1.5 text-[12px] text-[#d3bc8e] hover:border-[#d3bc8e]"
            >
              ⬇ Скачать git-бандл — вся история коммитов (~39 МБ)
            </button>
            <input
              ref={uploadRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                void (async () => {
                  setUploadStatus("…");
                  try {
                    const fd = new FormData();
                    fd.append("file", f);
                    const res = await fetch("/api/upload", { method: "POST", body: fd });
                    const j: { ok?: boolean; name?: string; size?: number; error?: string } =
                      await res.json();
                    if (!res.ok || !j.ok) throw new Error(j.error || String(res.status));
                    setUploadStatus(
                      `✓ ${j.name} (${Math.max(1, Math.round((j.size ?? 0) / 1024))} КБ) — передано`,
                    );
                  } catch (err) {
                    setUploadStatus(`✗ не передано: ${err instanceof Error ? err.message : "ошибка"}`);
                  }
                })();
              }}
            />
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="ml-2 mt-1 inline-block rounded-md border border-[#2f3d59] bg-[#1d2739] px-3 py-1.5 text-[12px] text-[#d3bc8e] hover:border-[#d3bc8e]"
            >
              ⬆ Передать файл агенту
            </button>
            {uploadStatus && (
              <span className="ml-2 inline-block align-middle text-[11px] leading-snug text-[#9aa5b8]">
                {uploadStatus}
              </span>
            )}
          </>
        )}
      </footer>
      </div>
    </TipProvider>
  );
}
