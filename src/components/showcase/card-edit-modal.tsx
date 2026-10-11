"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Plus, Swords } from "lucide-react";
import { ElementIcon, RarityStar } from "./element-icon";
import { Tip } from "./tip";
import { usePixelSnap, useScrollSnap } from "./pixel-snap";
import { ELEMENTS, type ElementKey } from "@/lib/showcase/elements";
import { CHARACTERS_DB, lookupCharacter } from "@/lib/showcase/character-db";
import { fmtCardDate, todayIso } from "@/lib/showcase/format";
import type { CharacterRow, ExtraDamage, TeamBlock } from "@/lib/showcase/types";

const CONS_OPTIONS = ["C0", "C1", "C2", "C3", "C4", "C5", "C6"] as const;
const REF_OPTIONS = [1, 2, 3, 4, 5] as const;

const groupInt = (intStr: string) =>
  intStr.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const numToText = (n: number | null, group: boolean): string => {
  if (n == null || !Number.isFinite(n)) return "";
  const s = String(Math.abs(n));
  const [i, f] = s.split(".");
  return (n < 0 ? "−" : "") + (group ? groupInt(i) : i) + (f ? "," + f : "");
};

const normalizeNumText = (raw: string, group: boolean): string => {
  const keep = raw.replace(/\s+/g, "").replace(/[^\d.,]/g, "");
  const m = /^(\d*)([.,])?/.exec(keep);
  const int = m?.[1] ?? "";
  const hasSep = Boolean(m?.[2]);
  const frac = keep.slice((m?.[0] ?? "").length).replace(/[^\d]/g, "");
  return (group ? groupInt(int) : int) + (hasSep ? "," + frac : "");
};

const textToNum = (t: string): number | null => {
  const clean = t.replace(/\s/g, "").replace(",", ".");
  if (!/\d/.test(clean)) return null;
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
};

const sumFieldTimes = (chars: CharacterRow[]): number =>
  Math.round(
    chars.reduce((a, ch) => a + (ch.field_time_s ?? 0), 0) * 1000,
  ) / 1000;

export const parseCardDateText = (t: string): string | null => {
  const s = t.trim();
  if (!s) return null;
  let m = /^(\d{4})[.\/ -](\d{1,2})[.\/ -](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[.\/ -](\d{1,2})[.\/ -](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
};

const normalizeDateIso = (s: string | null): string => {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return todayIso();
};

const normName = (s: string) =>
  s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

const DB_ROWS = CHARACTERS_DB.map((c) => ({
  c,
  label: c.nameRu || c.nameEn,
  en: c.nameEn,
  keys: [c.nameEn, c.nameRu, c.nameZhCn, c.nameZhTw, c.nameJa]
    .map(normName)
    .filter(Boolean),
})).sort((a, b) => a.label.localeCompare(b.label, "ru"));

type FieldKey = "name" | "cons" | "ref" | "rar" | "el" | "opts";

interface DropOption {
  key: string;
  aria: string;
  node: ReactNode;
  selected?: boolean;
  disabled?: boolean;
}

export type { DropOption };

export function useAutoHeight(switchKey: unknown) {
  const ref = useRef<HTMLDivElement | null>(null);
  const naturalH = useRef<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    stopRef.current?.();
    stopRef.current = null;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const locked = el.style.height !== "";
    const from = naturalH.current ?? (locked ? el.getBoundingClientRect().height : null);
    naturalH.current = null;
    if (from == null) return;
    el.style.height = "";
    const target = el.getBoundingClientRect().height;
    if (Math.abs(target - from) < 1) {
      el.style.overflow = "";
      naturalH.current = el.getBoundingClientRect().height;
      return;
    }
    el.style.height = `${from}px`;
    el.style.overflow = "hidden";
    void el.offsetHeight;
    el.style.height = `${target}px`;
    const stop = () => {
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
    const release = () => {
      stop();
      el.style.height = "";
      el.style.overflow = "";
      naturalH.current = el.getBoundingClientRect().height;
      stopRef.current = null;
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === "height") release();
    };
    el.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(release, 280);
    stopRef.current = stop;
  }, [switchKey]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.style.height === "") {
      naturalH.current = el.getBoundingClientRect().height;
    }
  });

  return ref;
}

export function EditDropdown({
  label,
  triggerAria,
  value,
  options,
  open,
  disabled = false,
  tip,
  align = "left",
  onToggle,
  onPick,
}: {
  label: string;
  triggerAria: string;
  value: ReactNode;
  options: DropOption[];
  open: boolean;
  disabled?: boolean;
  tip?: string;
  align?: "left" | "right";
  onToggle: () => void;
  onPick: (key: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [up, setUp] = useState(false);
  useLayoutEffect(() => {
    if (!open) {
      setUp(false);
      return;
    }
    const r = rootRef.current?.getBoundingClientRect();
    const list = listRef.current;
    if (!r || !list) return;
    setUp(r.bottom + list.offsetHeight + 4 > document.documentElement.clientHeight - 8);
  }, [open]);
  useScrollSnap(listRef, open);

  const trigger = (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={triggerAria}
      disabled={disabled}
      onClick={onToggle}
      className={
        "flex h-8 w-full items-center justify-between gap-1.5 rounded-md border bg-[#1d2739] px-2.5 text-[13px] transition-colors " +
        (disabled
          ? "cursor-not-allowed border-[#2f3d59] opacity-50"
          : "cursor-pointer border-[#2f3d59] text-[#e8e2d5] hover:border-[#a68b5c] aria-expanded:border-[#a68b5c]")
      }
    >
      <span className="min-w-0 truncate">{value}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
    </button>
  );
  return (
    <div ref={rootRef} data-dd-open={open ? "true" : undefined} className="relative">
      <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">{label}</p>
      {tip ? <Tip label={tip}>{trigger}</Tip> : trigger}
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={triggerAria}
          className={
            "absolute z-20 max-h-64 w-max min-w-full overflow-y-auto overscroll-contain rounded-md border border-[#2f3d59] bg-[#1d2739] px-1 pt-1 pb-1 shadow-xl shadow-black/40 animate-in fade-in animation-duration-150 will-change-transform " +
            (align === "right" ? "right-0 " : "left-0 ") +
            (up ? "bottom-full mb-1 slide-in-from-bottom-2" : "top-full mt-1 slide-in-from-top-2")
          }
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="option"
              aria-selected={o.selected || undefined}
              aria-label={o.aria}
              aria-disabled={o.disabled || undefined}
              disabled={o.disabled}
              onClick={() => onPick(o.key)}
              className={
                "flex h-[30px] w-full items-center gap-2 rounded px-2 text-left text-[13px] transition-colors " +
                (o.disabled
                  ? "cursor-not-allowed text-[#e8e2d5] opacity-50"
                  : "text-[#e8e2d5] hover:bg-[#24304a]")
              }
            >
              <span className="min-w-0 flex-1 truncate">{o.node}</span>
              {o.selected && <Check className="h-4 w-4 shrink-0 text-[#d3bc8e]" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  aria,
  value,
  group,
  invalid,
  onCommit,
  onBlurText,
  readOnly,
}: {
  label: string;
  aria: string;
  value: number | null;
  group: boolean;
  invalid: boolean;
  onCommit: (n: number | null) => void;
  onBlurText?: (t: string) => void;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(() => numToText(value, group));
  const lastEmitted = useRef<number | null>(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(numToText(value, group));
    }
  }, [value, group]);
  return (
    <div>
      <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">{label}</p>
      <input
        type="text"
        inputMode="decimal"
        aria-label={aria}
        value={text}
        readOnly={readOnly}
        onChange={(e) => {
          if (readOnly) return;
          const t = normalizeNumText(e.target.value, group);
          setText(t);
          const n = textToNum(t);
          lastEmitted.current = n;
          onCommit(n);
        }}
        onBlur={() => onBlurText?.(text)}
        className={
          "h-8 w-full rounded-md border bg-[#1d2739] px-2.5 text-[13px] transition-colors focus:outline-none " +
          (readOnly
            ? "cursor-default border-[#2f3d59] text-[#9aa5b8]"
            : invalid
              ? "border-[#d86a6a] text-[#e8e2d5]"
              : "border-[#2f3d59] text-[#e8e2d5] focus:border-[#a68b5c]")
        }
      />
    </div>
  );
}

function GrowArea({
  aria,
  value,
  maxLength,
  onChange,
}: {
  aria: string;
  value: string;
  maxLength: number;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(Math.max(el.scrollHeight + 2, 54), 160) + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      aria-label={aria}
      value={value}
      maxLength={maxLength}
      rows={2}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 py-1.5 text-[13px] leading-5 text-[#e8e2d5] transition-colors focus:border-[#a68b5c] focus:outline-none"
    />
  );
}

export function TabRail({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);
  const refresh = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const l = el.scrollLeft > 1;
    const r = el.scrollLeft < max - 1;
    setLeft((p) => (p === l ? p : l));
    setRight((p) => (p === r ? p : r));
  }, []);
  useLayoutEffect(refresh);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(refresh);
    ro.observe(el);
    return () => ro.disconnect();
  }, [refresh]);
  useScrollSnap(railRef);
  const nudge = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.max(96, el.clientWidth * 0.75),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  const revealTab = (e: { target: EventTarget | null }) => {
    const el = railRef.current;
    if (!el) return;
    const btn =
      e.target instanceof Element
        ? (e.target.closest("button") as HTMLElement | null)
        : null;
    if (!btn || !el.contains(btn)) return;
    const rr = el.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const EDGE = 44;
    let dx = 0;
    if (br.right > rr.right - EDGE) dx = br.right - (rr.right - EDGE);
    else if (br.left < rr.left + EDGE) dx = br.left - (rr.left + EDGE);
    if (!dx) return;
    const max = el.scrollWidth - el.clientWidth;
    const to = Math.min(max, Math.max(0, el.scrollLeft + dx));
    if (Math.abs(to - el.scrollLeft) < 1) return;
    el.scrollTo({
      left: to,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  return (
    <div className={"relative" + (className ? " " + className : "")}>
      <div
        ref={railRef}
        data-tab-rail
        role="group"
        aria-label={label}
        onScroll={refresh}
        onClick={revealTab}
        className={
          "flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden " +
          (left && right
            ? "[mask-image:linear-gradient(to_right,transparent,black_36px,black_calc(100%_-_36px),transparent)]"
            : right
              ? "[mask-image:linear-gradient(to_left,transparent,black_36px)]"
              : left
                ? "[mask-image:linear-gradient(to_right,transparent,black_36px)]"
                : "")
        }
      >
        {children}
      </div>
      {left && (
        <button
          type="button"
          aria-label="Прокрутить вкладки влево"
          onClick={() => nudge(-1)}
          className="absolute left-0 inset-y-0 z-10 flex w-9 items-center justify-start text-[#7182a8] transition-colors hover:text-[#e8e2d5] animate-in fade-in duration-150 will-change-transform"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
      )}
      {right && (
        <button
          type="button"
          aria-label="Прокрутить вкладки вправо"
          onClick={() => nudge(1)}
          className="absolute right-0 inset-y-0 z-10 flex w-9 items-center justify-end text-[#7182a8] transition-colors hover:text-[#e8e2d5] animate-in fade-in duration-150 will-change-transform"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function CardEditModal({
  team,
  favSrcName,
  onApply,
  onClose,
}: {
  team: TeamBlock;
  favSrcName?: string | null;
  onApply: (updated: TeamBlock, favSrcName?: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TeamBlock>(() => {
    const d = structuredClone(team);
    d.characters = d.characters.map((ch) => ({
      ...ch,
      constellation: ch.constellation ?? "C0",
    }));
    d.date = normalizeDateIso(d.date);
    if (d.rotation_time_s == null) {
      d.rotation_time_s = sumFieldTimes(d.characters);
    }
    return d;
  });
  const [orig] = useState<TeamBlock>(() => structuredClone(team));
  const [ci, setCi] = useState(0);
  const [extraSel, setExtraSel] = useState(false);
  const [openField, setOpenField] = useState<FieldKey | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [srcName, setSrcName] = useState(() => favSrcName ?? "");
  const [dateText, setDateText] = useState(
    () => fmtCardDate(normalizeDateIso(team.date)) ?? "",
  );
  const [totalMode, setTotalMode] = useState<"source" | "auto" | "manual">(
    team.rotation_time_s == null ? "auto" : "source",
  );
  const [tab, setTab] = useState<"rot" | "com" | "aut" | "date" | "src">("rot");
  const [, setHintRest] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const nameListRef = useRef<HTMLDivElement | null>(null);

  const c: CharacterRow | undefined = draft.characters[ci];

  const validChar = (ch: CharacterRow): boolean =>
    ch.name.trim() !== "" &&
    ch.damage != null &&
    ch.damage > 0 &&
    (ch.field_time_s == null || ch.field_time_s > 0) &&
    (ch.weapon ?? "").trim() !== "" &&
    (ch.artifact_set ?? "").trim() !== "" &&
    (ch.er_requirement_p ?? 100) >= 100;
  const dupKey = (ch: CharacterRow): number | string => {
    const id = lookupCharacter(ch.name)?.id;
    if (id != null) return id;
    const n = normName(ch.name);
    return n === "" ? "" : `t:${n}`;
  };
  const dupAt = (i: number): boolean => {
    const k = dupKey(draft.characters[i]);
    if (k === "") return false;
    return draft.characters.some((_, j) => j !== i && dupKey(draft.characters[j]) === k);
  };
  const validIdx = (i: number): boolean => validChar(draft.characters[i]) && !dupAt(i);
  const extraItem = draft.extra_damage ?? null;
  const extraFilled =
    extraItem != null &&
    (extraItem.name.trim() !== "" || extraItem.damage != null);
  const extraValid =
    !extraFilled ||
    (extraItem != null &&
      extraItem.name.trim() !== "" &&
      extraItem.damage != null &&
      extraItem.damage > 0 &&
      ((extraItem.recalc_total ?? true) !== false ||
        extraItem.damage_percent == null ||
        extraItem.damage_percent > 0));
  const valid =
    draft.characters.length > 0 &&
    draft.characters.every((_, i) => validIdx(i)) &&
    extraValid &&
    draft.rotation_time_s != null &&
    draft.rotation_time_s > 0;

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(orig) ||
    (favSrcName != null && srcName !== favSrcName);

  usePixelSnap(panelRef);

  useScrollSnap(overlayRef);
  useScrollSnap(nameListRef, openField === "name");

  useEffect(() => {
    const de = document.documentElement;
    const prevBody = document.body.style.overflow;
    const prevHtml = de.style.overflow;
    const prevPad = de.style.paddingRight;
    const probe = document.querySelector("header");
    const x0 = probe ? probe.getBoundingClientRect().left : null;
    document.body.style.overflow = "hidden";
    de.style.overflow = "hidden";
    if (probe && x0 != null) {
      const x1 = probe.getBoundingClientRect().left;
      if (x1 > x0) de.style.paddingRight = `${(x1 - x0) * 2}px`;
    }
    return () => {
      document.body.style.overflow = prevBody;
      de.style.overflow = prevHtml;
      de.style.paddingRight = prevPad;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !openField) return;
      setOpenField(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openField]);

  useEffect(() => {
    let pushed = false;
    try {
      history.pushState({ cardEditGuard: true }, "");
      pushed = true;
    } catch {
    }
    const onPop = () => {
      if (!pushed || history.state?.cardEditGuard === true) return;
      try {
        history.pushState({ cardEditGuard: true }, "");
      } catch {
        pushed = false;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed && history.state?.cardEditGuard === true) {
        try {
          history.back();
        } catch {
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!openField) return;
    const onDoc = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      const openRoot = panelRef.current?.querySelector('[data-dd-open="true"]');
      if (
        openRoot &&
        (e.composedPath().includes(openRoot) || openRoot.contains(t))
      )
        return;
      setOpenField(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [openField]);

  if (!c) return null;

  const setChar = (patch: Partial<CharacterRow>) => {
    setDraft((d) => {
      const chars = [...d.characters];
      chars[ci] = { ...chars[ci], ...patch };
      return { ...d, characters: chars };
    });
  };
  const unsetChar = (key: "element" | "rarity") => {
    setDraft((d) => {
      const chars = [...d.characters];
      const next = { ...chars[ci] } as CharacterRow;
      delete next[key];
      chars[ci] = next;
      return { ...d, characters: chars };
    });
  };

  const setExtra = (patch: Partial<ExtraDamage>) => {
    setDraft((d) => ({
      ...d,
      extra_damage: {
        ...(d.extra_damage ?? { name: "", damage: null, note: null }),
        ...patch,
      },
    }));
  };
  const extraRecalcOn = (draft.extra_damage?.recalc_total ?? true) !== false;
  const extraScaleVis = (draft.extra_damage?.scale_visible ?? true) !== false;
  const extraLivePct = (() => {
    if (!extraRecalcOn) return draft.extra_damage?.damage_percent ?? null;
    const d = draft.extra_damage?.damage ?? null;
    if (d == null || d <= 0) return null;
    const dmg = Math.round(d);
    const charSum = draft.characters.reduce(
      (a, ch) => a + Math.round(ch.damage ?? 0),
      0,
    );
    const denom = charSum + dmg;
    return denom > 0 ? Math.round((dmg / denom) * 1000) / 10 : null;
  })();
  const commitExtraDamage = (n: number | null) => {
    setExtra({ damage: n });
  };

  const db = lookupCharacter(c.name);
  const effEl = (c.element ?? db?.element ?? null) as ElementKey | null;
  const effRar = c.rarity ?? db?.rarity ?? null;
  const erNum = c.er_requirement_p;

  const toggle = (f: FieldKey) => setOpenField((cur) => (cur === f ? null : f));

  const nameQuery = normName(c.name);
  const otherKeys = new Set<number | string>();
  for (let j = 0; j < draft.characters.length; j++) {
    if (j === ci) continue;
    const k = dupKey(draft.characters[j]);
    if (k !== "") otherKeys.add(k);
  }
  const dbRows = DB_ROWS.filter((r) => !otherKeys.has(r.c.id));
  const nameRows = nameTouched && nameQuery
    ? dbRows.filter((r) => r.keys.some((k) => k.includes(nameQuery)))
    : dbRows;

  const consOptions: DropOption[] = CONS_OPTIONS.map((k) => ({
    key: k,
    aria: `Созвездие: ${k}`,
    node: <span>{k}</span>,
    selected: (c.constellation ?? "C0") === k,
  }));
  const refOptions: DropOption[] = [
    { key: "none", aria: "Пробуждение: не задано", node: <span className="text-[#9aa5b8]">Не задано</span>, selected: c.weapon_refinement == null },
    ...REF_OPTIONS.map((n) => ({
      key: `R${n}`,
      aria: `Пробуждение: R${n}`,
      node: <span>R{n}</span>,
      selected: c.weapon_refinement === n,
    })),
  ];
  const rarOptions: DropOption[] = [
    { key: "auto", aria: "Редкость: авто", node: <span className="text-[#9aa5b8]">Авто</span>, selected: c.rarity == null },
    {
      key: "5",
      aria: "Редкость: 5",
      node: (
        <span className="flex items-center gap-1">
          5 <RarityStar className="h-3.5 w-3.5 text-[#d3bc8e]" />
        </span>
      ),
      selected: c.rarity === 5,
    },
    {
      key: "4",
      aria: "Редкость: 4",
      node: (
        <span className="flex items-center gap-1">
          4 <RarityStar className="h-3.5 w-3.5 text-[#bc86ff]" />
        </span>
      ),
      selected: c.rarity === 4,
    },
  ];
  const elOptions: DropOption[] = [
    { key: "auto", aria: "Элемент: авто", node: <span className="text-[#9aa5b8]">Авто</span>, selected: !c.element },
    ...(Object.keys(ELEMENTS) as ElementKey[]).map((k) => ({
      key: k,
      aria: `Элемент: ${ELEMENTS[k].label}`,
      node: (
        <span className="flex items-center gap-1.5">
          <ElementIcon element={k} className="h-3.5 w-3.5" />
          {ELEMENTS[k].label}
        </span>
      ),
      selected: c.element === k,
    })),
  ];

  const consValue: ReactNode = (
    <span>{c.constellation ?? "C0"}</span>
  );
  const refValue: ReactNode = c.weapon_refinement ? (
    <span>R{c.weapon_refinement}</span>
  ) : (
    <span className="text-[#9aa5b8]">Не задано</span>
  );
  const rarValue: ReactNode = effRar == null ? (
    <span className="text-[#9aa5b8]">Авто</span>
  ) : (
    <span className="flex items-center gap-1">
      <span className={c.rarity == null ? "text-[#9aa5b8]" : undefined}>{effRar}</span>
      <RarityStar className={"h-3.5 w-3.5 " + (effRar === 4 ? "text-[#bc86ff]" : "text-[#d3bc8e]")} />
    </span>
  );
  const elValue: ReactNode = effEl == null ? (
    <span className="text-[#9aa5b8]">Авто</span>
  ) : (
    <span className="flex items-center gap-1.5">
      <ElementIcon element={effEl} className="h-3.5 w-3.5" />
      <span className={c.element == null ? "text-[#9aa5b8]" : ""}>{ELEMENTS[effEl].label}</span>
    </span>
  );

  const tabList: ReadonlyArray<
    readonly ["rot" | "com" | "aut" | "date" | "src", string]
  > = [
    ["rot", "Ротация"],
    ["com", "Комментарии"],
    ["date", "Дата"],
    ["aut", "Автор"],
    ...(favSrcName != null ? ([["src", "Источник"]] as const) : []),
  ];

  const processAndSave = () => {
    if (!dirty || !valid) return;
    const characters: CharacterRow[] = draft.characters.map((ch) => {
      const { damage_share: _derived, ...rest } = ch;
      void _derived;
      const next = rest as CharacterRow;
      if (next.damage != null) next.damage = Math.round(next.damage);
      if (next.er_requirement_p != null)
        next.er_requirement_p = Math.round(next.er_requirement_p);
      else next.er_requirement_p = null;
      return next;
    });
    const cutTails = (s: string | null): string | null =>
      s == null ? null : s.replace(/\s+$/, "");
    const rotation = cutTails(draft.rotation);
    const extra_info = cutTails(draft.extra_info);
    const extraHusk = draft.extra_damage ?? null;
    const extraFinal: ExtraDamage | null =
      extraHusk != null &&
      extraHusk.name.trim() !== "" &&
      extraHusk.damage != null
        ? (() => {
            const recalcOn = extraHusk.recalc_total !== false;
            const dmg = Math.round(extraHusk.damage);
            const charSumR = characters.reduce((a, ch) => a + (ch.damage ?? 0), 0);
            const pct =
              recalcOn && dmg > 0 && charSumR + dmg > 0
                ? Math.round((dmg / (charSumR + dmg)) * 1000) / 10
                : (extraHusk.damage_percent ?? null);
            return {
              name: extraHusk.name,
              note: extraHusk.note?.trim() ? extraHusk.note : null,
              damage: dmg,
              ...(pct != null
                ? { damage_percent: Math.round(pct * 100) / 100 }
                : {}),
              ...(extraHusk.recalc_total === false ? { recalc_total: false } : {}),
              ...(extraHusk.scale_visible === false ? { scale_visible: false } : {}),
            };
          })()
        : null;
    const recalc = extraFinal?.recalc_total !== false;
    const charSum = characters.reduce((a, ch) => a + (ch.damage ?? 0), 0);
    const extraDmg = extraFinal?.damage ?? 0;
    const total_dpr = recalc ? charSum : draft.total_dpr;
    const combined = recalc ? charSum + extraDmg : draft.total_dpr;
    const dps =
      combined != null &&
      draft.rotation_time_s != null &&
      draft.rotation_time_s > 0
        ? combined / draft.rotation_time_s
        : draft.dps;
    const wasAuto =
      orig.team_name != null &&
      orig.team_name === orig.characters.map((x) => x.name).join(" · ");
    const team_name = wasAuto
      ? characters.map((x) => x.name).join(" · ")
      : draft.team_name;
    onApply(
      {
        ...draft,
        characters,
        extra_damage: extraFinal,
        rotation,
        extra_info,
        total_dpr,
        dps,
        team_name,
        date: draft.date || todayIso(),
      },
      favSrcName != null ? srcName : undefined,
    );
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] overflow-y-auto bg-[rgb(10_16_28_/_72%)] p-4 animate-in fade-in animation-duration-200"
    >
      <div className="flex min-h-full">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Редактирование карточки"
          className="card-edit-modal mx-auto my-auto w-full max-w-[480px] rounded-xl border border-[#2f3d59] bg-gradient-to-b from-[#24304a] to-[#1d2739] p-4 shadow-xl shadow-black/40 animate-in fade-in zoom-in-95 animation-duration-200 will-change-transform"
        >
          <div className="mb-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-tight text-[#e8e2d5]">Редактирование карточки</h2>
              <p className="mt-1 truncate text-[12px] leading-none text-[#9aa5b8]">
                <span className="text-[#d3bc8e]">{team.slot}</span>
                {team.team_name ? ` · ${team.team_name}` : ""}
              </p>
            </div>
          </div>

          <TabRail label="Персонажи и добавочный урон" className="mb-3">
            {draft.characters.map((ch, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Персонаж: ${ch.name}`}
                aria-pressed={i === ci && !extraSel}
                onClick={() => {
                  setCi(i);
                  setNameTouched(false);
                  setExtraSel(false);
                }}
                className={
                  "h-8 max-w-[200px] shrink-0 rounded-md border px-2.5 text-[13px] transition-colors " +
                  (i === ci && !extraSel
                    ? "border-[#a68b5c] bg-[#4a391526] text-[#d3bc8e]"
                    : validIdx(i)
                      ? "border-[#2f3d59] bg-[#1921311f] text-[#9aa5b8] hover:border-[#435680] hover:text-[#e8e2d5]"
                      : "border-[#d86a6a] bg-[#1921311f] text-[#9aa5b8]")
                }
              >
                <span className="block truncate">{ch.name}</span>
              </button>
            ))}
            <button
              type="button"
              aria-label="Добавочный урон"
              aria-pressed={extraSel}
              onClick={() => {
                setOpenField(null);
                setExtraSel(true);
              }}
              className={
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors " +
                (extraSel
                  ? "border-[#a68b5c] text-[#d3bc8e]" +
                    (extraFilled ? " bg-[#4a391526]" : "")
                  : extraFilled && !extraValid
                    ? "border-[#d86a6a] bg-[#1921311f] text-[#9aa5b8]"
                    : extraFilled
                      ? "border-[#2f3d59] bg-[#1921311f] text-[#9aa5b8] hover:border-[#435680] hover:text-[#e8e2d5]"
                      : "border-dashed border-[#2f3d59] text-[#9aa5b8] hover:border-[#435680] hover:text-[#e8e2d5]")
              }
            >
              {extraFilled ? (
                <Swords className="h-4 w-4" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
            </button>
          </TabRail>

          <div data-stack="form" className="grid items-start">
          <div className={"col-start-1 row-start-1 " + (extraSel ? "" : "invisible")}>
              <div
                data-extra-hint
                aria-hidden={extraFilled ? true : undefined}
                onTransitionEnd={(e) => {
                  if (
                    e.target === e.currentTarget &&
                    e.propertyName === "grid-template-rows"
                  )
                    setHintRest((n) => n + 1);
                }}
                className={
                  "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none " +
                  (extraFilled
                    ? "[grid-template-rows:0fr] opacity-0"
                    : "[grid-template-rows:1fr]")
                }
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="pb-2.5">
                    <p className="text-[12px] leading-[17px] text-[#e8e2d5]">
                      Здесь можно указать добавочный урон (например, урон реакции)
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-10 gap-2.5">
                <div className="col-span-4">
                  <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Название</p>
                  <input
                    type="text"
                    aria-label="Название добавочного урона"
                    value={extraItem?.name ?? ""}
                    onChange={(e) => setExtra({ name: e.target.value })}
                    className={
                      "h-8 w-full rounded-md border bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:outline-none " +
                      (extraFilled && (extraItem?.name ?? "").trim() === ""
                        ? "border-[#d86a6a]"
                        : "border-[#2f3d59] focus:border-[#a68b5c]")
                    }
                  />
                </div>
                <div className="col-span-6">
                  <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Описание</p>
                  <input
                    type="text"
                    aria-label="Описание добавочного урона"
                    value={extraItem?.note ?? ""}
                    onChange={(e) => setExtra({ note: e.target.value })}
                    className="h-8 w-full rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:border-[#a68b5c] focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-10 items-end gap-2.5">
                <div className="col-span-4">
                  <NumField
                    label="Урон"
                    aria="Добавочный урон: урон"
                    value={extraItem?.damage ?? null}
                    group
                    invalid={
                      extraFilled &&
                      (extraItem?.damage == null || (extraItem?.damage ?? 0) <= 0)
                    }
                    onCommit={commitExtraDamage}
                  />
                </div>
                <div className="col-span-2">
                  <NumField
                    label="Урон, %"
                    aria="Добавочный урон: проценты"
                    value={extraRecalcOn ? extraLivePct : (extraItem?.damage_percent ?? null)}
                    group={false}
                    readOnly={extraRecalcOn}
                    invalid={
                      !extraRecalcOn &&
                      extraItem?.damage_percent != null &&
                      extraItem.damage_percent <= 0
                    }
                    onCommit={(n) => setExtra({ damage_percent: n })}
                  />
                </div>
                <div
                  className="relative col-span-4"
                  data-dd-open={openField === "opts" ? "true" : undefined}
                >
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={openField === "opts"}
                    aria-label="Опции"
                    onClick={() => toggle("opts")}
                    className="flex h-8 w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors hover:border-[#a68b5c] aria-expanded:border-[#a68b5c]"
                  >
                    Опции
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                  </button>
                  {openField === "opts" && (
                    <div className="absolute right-0 top-full z-20 mt-1.5 w-max min-w-full rounded-md border border-[#2f3d59] bg-[#1d2739] px-1 pt-1 pb-1 shadow-xl shadow-black/40 animate-in fade-in slide-in-from-top-2 animation-duration-150 will-change-transform">
                      <button
                        type="button"
                        aria-label="Учитывать в DPR"
                        onClick={() => setExtra({ recalc_total: !extraRecalcOn })}
                        className="flex h-[30px] w-full items-center gap-2 rounded px-2 text-left text-[13px] text-[#e8e2d5] transition-colors hover:bg-[#24304a]"
                      >
                        <span
                          className={
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors " +
                            (extraRecalcOn
                              ? "border-[#d3bc8e] bg-[#d3bc8e] text-[#1c2333]"
                              : "border-[#4a5878]")
                          }
                        >
                          {extraRecalcOn && <Check className="h-3 w-3" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">Учитывать в DPR</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Шкала урона"
                        onClick={() => setExtra({ scale_visible: !extraScaleVis })}
                        className="flex h-[30px] w-full items-center gap-2 rounded px-2 text-left text-[13px] text-[#e8e2d5] transition-colors hover:bg-[#24304a]"
                      >
                        <span
                          className={
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors " +
                            (extraScaleVis
                              ? "border-[#d3bc8e] bg-[#d3bc8e] text-[#1c2333]"
                              : "border-[#4a5878]")
                          }
                        >
                          {extraScaleVis && <Check className="h-3 w-3" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">Шкала урона</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

          <div key={ci} className={"col-start-1 row-start-1 " + (extraSel ? "invisible" : "")}>
            <div className="grid grid-cols-10 gap-2.5">
              <div
                className="relative col-span-4"
                data-dd-open={openField === "name" ? "true" : undefined}
              >
                <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Имя</p>
                <input
                  type="text"
                  aria-label="Имя персонажа"
                  value={c.name}
                  onFocus={() => {
                    setOpenField("name");
                    setNameTouched(false);
                  }}
                  onChange={(e) => {
                    setChar({ name: e.target.value });
                    setNameTouched(true);
                    setOpenField("name");
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || openField !== "name" || nameRows.length === 0) return;
                    e.preventDefault();
                    const r = nameRows[0];
                    setChar({ name: r.label });
                    setNameTouched(false);
                    setOpenField(null);
                  }}
                  className={
                    "h-8 w-full rounded-md border bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:outline-none " +
                    (c.name.trim() === "" || dupAt(ci)
                      ? "border-[#d86a6a]"
                      : "border-[#2f3d59] focus:border-[#a68b5c]")
                  }
                />
                {openField === "name" && (
                  <div
                    ref={nameListRef}
                    role="listbox"
                    aria-label="Персонажи базы данных"
                    className="absolute left-0 z-20 mt-1 max-h-64 w-max min-w-full overflow-y-auto overscroll-contain rounded-md border border-[#2f3d59] bg-[#1d2739] px-1 pt-1 pb-1 shadow-xl shadow-black/40 animate-in fade-in slide-in-from-top-2 animation-duration-150 will-change-transform"
                  >
                    {nameRows.length === 0 ? (
                      <div className="px-2.5 py-2 text-[12.5px] text-[#6b7893]">
                        Нет совпадений
                      </div>
                    ) : (
                      nameRows.map((r) => (
                        <button
                          key={r.c.id}
                          type="button"
                          role="option"
                          aria-label={`Персонаж БД: ${r.label}`}
                          onClick={() => {
                            setChar({ name: r.label });
                            setNameTouched(false);
                            setOpenField(null);
                          }}
                          className="flex h-[30px] w-full items-center gap-2 rounded px-2 text-left text-[13px] text-[#e8e2d5] transition-colors hover:bg-[#24304a]"
                        >
                          <span className="min-w-0 truncate">{r.label}</span>
                          {r.en && r.en !== r.label && (
                            <span className="min-w-0 truncate text-[11px] text-[#6b7893]">{r.en}</span>
                          )}
                          {r.c.element && (
                            <ElementIcon element={r.c.element} className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <RarityStar
                            className={
                              "h-3.5 w-3.5 shrink-0 " +
                              (r.c.rarity === 4 ? "text-[#bc86ff]" : "text-[#d3bc8e]")
                            }
                          />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="col-span-3">
                <NumField
                  label="Урон"
                  aria="Урон персонажа"
                  value={c.damage}
                  group
                  invalid={c.damage == null || c.damage <= 0}
                  onCommit={(n) => setChar({ damage: n })}
                />
              </div>
              <div className="col-span-3">
                <NumField
                  label="Время, с"
                  aria="Время на поле, с"
                  value={c.field_time_s}
                  group={false}
                  invalid={c.field_time_s != null && c.field_time_s <= 0}
                  onCommit={(n) => {
                    setDraft((d) => {
                      const chars = [...d.characters];
                      chars[ci] = { ...chars[ci], field_time_s: n };
                      return {
                        ...d,
                        characters: chars,
                        rotation_time_s: sumFieldTimes(chars),
                      };
                    });
                    setTotalMode("auto");
                  }}
                />
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-10 gap-2.5">
              <div className="col-span-4">
                <EditDropdown
                  label="Элемент"
                  triggerAria="Элемент персонажа"
                  value={elValue}
                  options={elOptions}
                  open={openField === "el"}
                  onToggle={() => toggle("el")}
                  onPick={(k) => {
                    if (k === "auto") unsetChar("element");
                    else setChar({ element: k as ElementKey });
                    setOpenField(null);
                  }}
                />
              </div>
              <div className="col-span-3">
                <EditDropdown
                  label="Созвездие"
                  triggerAria="Созвездие персонажа"
                  value={consValue}
                  options={consOptions}
                  open={openField === "cons"}
                  onToggle={() => toggle("cons")}
                  onPick={(k) => {
                    setChar({ constellation: k });
                    setOpenField(null);
                  }}
                />
              </div>
              <div className="col-span-3">
                <EditDropdown
                  label="Редкость"
                  triggerAria="Редкость персонажа"
                  value={rarValue}
                  options={rarOptions}
                  open={openField === "rar"}
                  align="right"
                  onToggle={() => toggle("rar")}
                  onPick={(k) => {
                    if (k === "auto") unsetChar("rarity");
                    else setChar({ rarity: k === "4" ? 4 : 5 });
                    setOpenField(null);
                  }}
                />
              </div>
            </div>

            <div className="mt-3 border-t border-dashed border-[#2f3d59] pt-2.5">
              <div className="grid grid-cols-10 gap-2.5">
                <div className="min-w-0 col-span-7">
                  <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Оружие</p>
                  <input
                    type="text"
                    aria-label="Оружие персонажа"
                    value={c.weapon ?? ""}
                    onChange={(e) => setChar({ weapon: e.target.value })}
                    className={
                      "h-8 w-full rounded-md border bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:outline-none " +
                      ((c.weapon ?? "").trim() === ""
                        ? "border-[#d86a6a]"
                        : "border-[#2f3d59] focus:border-[#a68b5c]")
                    }
                  />
                </div>
                <div className="col-span-3">
                  <EditDropdown
                    label="Пробуждение"
                    triggerAria="Пробуждение оружия"
                    value={refValue}
                    options={refOptions}
                    open={openField === "ref"}
                    disabled={!c.weapon}
                    align="right"
                    onToggle={() => toggle("ref")}
                    onPick={(k) => {
                      setChar({ weapon_refinement: k === "none" ? null : Number(k.slice(1)) });
                      setOpenField(null);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 border-t border-dashed border-[#2f3d59] pt-2.5">
              <div className="grid grid-cols-10 gap-2.5">
                <div className="min-w-0 col-span-7">
                  <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Артефакты</p>
                  <input
                    type="text"
                    aria-label="Артефакты персонажа"
                    value={c.artifact_set ?? ""}
                    onChange={(e) => setChar({ artifact_set: e.target.value })}
                    className={
                      "h-8 w-full rounded-md border bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:outline-none " +
                      ((c.artifact_set ?? "").trim() === ""
                        ? "border-[#d86a6a]"
                        : "border-[#2f3d59] focus:border-[#a68b5c]")
                    }
                  />
                </div>
                <div className="col-span-3">
                  <NumField
                    label="ВЭ, %"
                    aria="ВЭ персонажа"
                    value={erNum}
                    group={false}
                    invalid={erNum != null && erNum < 100}
                    onCommit={(n) => setChar({ er_requirement_p: n })}
                  />
                </div>
              </div>
            </div>
          </div>
          </div>

          <div className="mt-4 border-t border-[#2f3d59] pt-3">
            <TabRail label="Вкладки дополнительной информации">
              {tabList.map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  aria-label={`Вкладка: ${lbl}`}
                  aria-pressed={tab === k}
                  onClick={() => setTab(k)}
                  className={
                    "h-8 shrink-0 whitespace-nowrap border-b-2 px-2.5 text-[13px] transition-colors " +
                    (tab === k
                      ? "border-[#a68b5c] text-[#d3bc8e]"
                      : "border-transparent text-[#9aa5b8] hover:text-[#e8e2d5]")
                  }
                >
                  {lbl}
                </button>
              ))}
            </TabRail>

            <div data-stack="tabs" className="mt-2.5 grid items-start">
              <div className={"col-start-1 row-start-1 " + (tab === "rot" ? "" : "invisible")}>
                  <div className="grid grid-cols-5 gap-2.5">
                    <div className="col-span-2">
                      <NumField
                        label="Общее время, с"
                        aria="Общее время ротации, с"
                        value={draft.rotation_time_s}
                        group={false}
                        invalid={
                          draft.rotation_time_s == null || draft.rotation_time_s <= 0
                            ? true
                            : totalMode === "manual" &&
                              Math.abs(
                                draft.rotation_time_s -
                                  sumFieldTimes(draft.characters),
                              ) > 0.001
                        }
                        onCommit={(n) => {
                          setDraft((d) => ({ ...d, rotation_time_s: n }));
                          setTotalMode("manual");
                        }}
                        onBlurText={(t) => {
                          if (t.replace(/\s/g, "") !== "") return;
                          setTotalMode("auto");
                          setDraft((d) => ({
                            ...d,
                            rotation_time_s: sumFieldTimes(d.characters),
                          }));
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Ротация</p>
                    <GrowArea
                      aria="Ротация команды"
                      value={draft.rotation ?? ""}
                      maxLength={200}
                      onChange={(v) => setDraft((d) => ({ ...d, rotation: v }))}
                    />
                  </div>
              </div>
              <div className={"col-start-1 row-start-1 " + (tab === "com" ? "" : "invisible")}>
                <GrowArea
                  aria="Комментарии"
                  value={draft.extra_info ?? ""}
                  maxLength={500}
                  onChange={(v) => setDraft((d) => ({ ...d, extra_info: v }))}
                />
              </div>
              <div className={"col-start-1 row-start-1 " + (tab === "aut" ? "" : "invisible")}>
                <input
                  type="text"
                  aria-label="Автор"
                  value={draft.author ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))}
                  className="h-8 w-full rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:border-[#a68b5c] focus:outline-none"
                />
              </div>
              <div className={"col-start-1 row-start-1 " + (tab === "date" ? "" : "invisible")}>
                <input
                  type="text"
                  aria-label="Дата"
                  value={dateText}
                  placeholder="2026/10/06"
                  onChange={(e) => {
                    setDateText(e.target.value);
                    setDraft((d) => ({ ...d, date: parseCardDateText(e.target.value) }));
                  }}
                  className="h-8 w-full rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:border-[#a68b5c] focus:outline-none"
                />
              </div>
              <div className={"col-start-1 row-start-1 " + (tab === "src" ? "" : "invisible")}>
                <input
                  type="text"
                  aria-label="Источник"
                  value={srcName}
                  onChange={(e) => setSrcName(e.target.value)}
                  className="h-8 w-full rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:border-[#a68b5c] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              aria-label="Отмена"
              onClick={onClose}
              className="h-8 cursor-pointer rounded-md border border-[#2f3d59] px-3 text-[13px] text-[#9aa5b8] transition-colors hover:border-[#435680] hover:text-[#e8e2d5]"
            >
              Отмена
            </button>
            <button
              type="button"
              aria-label="Сохранить"
              disabled={!dirty || !valid}
              onClick={processAndSave}
              className={
                "h-8 rounded-md px-3 text-[13px] font-semibold transition-colors " +
                (dirty && valid
                  ? "cursor-pointer bg-[#d3bc8e] text-[#1c2333] hover:bg-[#e0cc9e]"
                  : "cursor-not-allowed bg-[#d3bc8e]/50 text-[#1c2333] opacity-50")
              }
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
