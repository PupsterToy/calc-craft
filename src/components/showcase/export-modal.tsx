"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Check, Square, SquareDashed } from "lucide-react";
import { toCanvas } from "html-to-image";
import { EditDropdown, TabRail, useAutoHeight, type DropOption } from "./card-edit-modal";
import { TeamCard } from "./team-card";
import { TeamCompactCard } from "./team-compact-card";
import { Tip } from "./tip";
import { usePixelSnap, useScrollSnap } from "./pixel-snap";
import {
  EXPORT_CARD_W as CARD_W,
  EXPORT_PAGE_GAP as PAGE_GAP,
  exportStageWidth,
  measureExportStage,
} from "@/lib/showcase/export-measure";
import {
  defaultExportName,
  downloadExportFile,
  sanitizeFileName,
  type ExportCardData,
  type ExportFileFormat,
} from "@/lib/showcase/export-file";
import { SORTS, type SortDir, type SortMode } from "@/lib/showcase/sorts";
import {
  CHAR_COLORS,
  EXTRA_COLOR,
  charDamageShare,
  characterGear,
  extraDamageOrNull,
  extraDamagePercent,
  sortedCharacters,
} from "@/lib/showcase/display";
import { charNameParts, fmt1, fmtCardDate, fmtInt, todayIso } from "@/lib/showcase/format";

type ExportTab = "file" | "image" | "ctor";
type NestedTab = "view" | "grid" | "footer" | "pads";
type ImgFormat = "png" | "webp";
type BgMode = "normal" | "transparent";
type CardKind = "cards" | "compact";

const CANVAS_SIDE_LIMIT = 16383;
const EXPORT_PIXEL_RATIO = 2;

interface ExportPrefs {
  tab: ExportTab;
  fileFormat: ExportFileFormat;
  imgFormat: ImgFormat;
  dispEl: boolean | null;
  dispRar: boolean | null;
  dispDps: boolean;
  dispTeam: boolean;
  kind: CardKind | null;
  sortMode: SortMode | null;
  sortDir: SortDir | null;
  bg: BgMode;
  gridAxis: "cols" | "rows";
  gridCols: number;
  gridRows: number;
  showFooter: boolean;
  padTop: string;
  padBottom: string;
  padLeft: string;
  padRight: string;
}

const PREFS_KEY = "export-prefs";

const DEFAULT_PREFS: ExportPrefs = {
  tab: "file",
  fileFormat: "json",
  imgFormat: "png",
  dispEl: null,
  dispRar: null,
  dispDps: true,
  dispTeam: true,
  kind: null,
  sortMode: null,
  sortDir: null,
  bg: "normal",
  gridAxis: "cols",
  gridCols: 1,
  gridRows: 1,
  showFooter: true,
  padTop: "",
  padBottom: "",
  padLeft: "",
  padRight: "",
};

function readPrefs(): ExportPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ExportPrefs> & {
      cols?: number;
      gridCount?: number;
    };
    const legacy = parsed.gridCount ?? parsed.cols;
    if (parsed.gridCols === undefined && typeof legacy === "number") {
      parsed.gridCols = legacy;
    }
    if (parsed.gridRows === undefined && typeof legacy === "number") {
      parsed.gridRows = legacy;
    }
    delete parsed.cols;
    delete parsed.gridCount;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export interface ExportModalProps {
  cards: ExportCardData[];
  pageSort: { mode: SortMode; dir: SortDir };
  pageView: "cards" | "compact" | "rows";
  sortForExport: (cards: ExportCardData[], mode: SortMode, dir: SortDir) => ExportCardData[];
  onClose: () => void;
}

export function ExportModal({
  cards,
  pageSort,
  pageView,
  sortForExport,
  onClose,
}: ExportModalProps) {
  const [prefs, setPrefs] = useState<ExportPrefs>(() => readPrefs());
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
    }
  }, [prefs]);
  const patch = useCallback(
    (p: Partial<ExportPrefs>) => setPrefs((prev) => ({ ...prev, ...p })),
    [],
  );

  const [menuState] = useState(() => {
    const ds = document.documentElement.dataset;
    return { el: ds.el !== "off", rar: ds.rar !== "off" };
  });

  const dispEl = prefs.dispEl ?? menuState.el;
  const dispRar = prefs.dispRar ?? menuState.rar;
  const dispDps = prefs.dispDps;
  const dispTeam = prefs.dispTeam;
  const effMode = prefs.sortMode ?? pageSort.mode;
  const effDir = prefs.sortDir ?? pageSort.dir;
  const effKind: CardKind = prefs.kind ?? (pageView === "compact" ? "compact" : "cards");
  const multi = cards.length >= 2;
  const maxCount = Math.min(10, cards.length || 1);
  const axisCount = prefs.gridAxis === "rows" ? prefs.gridRows : prefs.gridCols;
  const effCount = Math.max(1, Math.min(axisCount || 1, maxCount));
  const effCols =
    prefs.gridAxis === "rows" ? Math.ceil(cards.length / effCount) : effCount;
  const effRows = Math.ceil(cards.length / effCols);
  const gridFillPct = maxCount > 1 ? ((effCount - 1) / (maxCount - 1)) * 100 : 100;
  const [nested, setNested] = useState<NestedTab>("view");
  const [sliding, setSliding] = useState(false);
  const onAxisPick = (axis: "cols" | "rows") => {
    if (prefs.gridAxis === axis) return;
    patch({ gridAxis: axis });
  };

  const [fileName, setFileName] = useState("");
  const [fileNameDirty, setFileNameDirty] = useState(false);
  const defName = defaultExportName(
    cards,
    prefs.tab === "image" ? "image" : "file",
    prefs.tab === "image"
      ? {
          compact: effKind === "compact",
          cols: effCols,
          rows: effRows,
        }
      : undefined,
  );
  const exportBase = () =>
    (fileNameDirty ? sanitizeFileName(fileName.trim()) : "") || defName;

  const padPx = (v: string): number => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const padsEmpty =
    !prefs.padTop && !prefs.padBottom && !prefs.padLeft && !prefs.padRight;
  const padField = (label: string, key: "padTop" | "padBottom" | "padLeft" | "padRight") => (
    <div>
      <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">{label}</p>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Отступ: ${label}`}
        value={prefs[key]}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, "").slice(0, 3);
          patch({ [key]: parseInt(d, 10) > 100 ? "100" : d } as Partial<ExportPrefs>);
        }}
        className="h-8 w-full rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:border-[#a68b5c] focus:outline-none"
      />
    </div>
  );

  const showFooter = prefs.showFooter;
  const [leftText, setLeftText] = useState(() =>
    cards[0] ? (cards[0].source || (cards[0].team.author ? `by ${cards[0].team.author}` : "")) : "",
  );
  const [rightText, setRightText] = useState(() =>
    cards[0] ? (fmtCardDate(cards[0].team.date) ?? fmtCardDate(todayIso()) ?? "") : "",
  );

  const [openDrop, setOpenDrop] = useState<string | null>(null);
  const drop = (key: string) => ({
    open: openDrop === key,
    onToggle: () => setOpenDrop((o) => (o === key ? null : key)),
  });

  const [chipPop, setChipPop] = useState<{
    index: number;
    top: number;
    bottom: number;
    left: number;
  } | null>(null);
  const [popTop, setPopTop] = useState(0);
  const [popUp, setPopUp] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const toggleChipPop = (i: number, el: HTMLElement) => {
    setOpenDrop(null);
    if (chipPop?.index === i) {
      setChipPop(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const mobile = window.matchMedia("(max-width: 639px)").matches;
    const pr = panelRef.current?.getBoundingClientRect();
    const centerX = mobile
      ? (pr ? pr.left + pr.width / 2 : r.left + r.width / 2)
      : r.left + r.width / 2;
    const left = Math.min(Math.max(8, centerX - 160), window.innerWidth - 328);
    setChipPop({ index: i, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(left) });
    setPopTop(Math.round(r.bottom + 6));
    setPopUp(false);
  };
  useLayoutEffect(() => {
    if (!chipPop) return;
    const h = popRef.current?.offsetHeight ?? 0;
    const vh = document.documentElement.clientHeight;
    const downTop = Math.round(chipPop.bottom + 6);
    const upTop = Math.round(chipPop.top - h - 6);
    const up = downTop + h > vh - 8 && upTop >= 8;
    setPopUp(up);
    setPopTop(up ? upTop : downTop);
  }, [chipPop]);

  useEffect(() => {
    if (!openDrop && !chipPop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openDrop) setOpenDrop(null);
      else setChipPop(null);
    };
    const onDoc = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-dd-open], [data-chip], [data-chip-pop]")) return;
      setOpenDrop(null);
      setChipPop(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDoc);
    };
  }, [openDrop, chipPop]);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useScrollSnap(overlayRef);

  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  useEffect(() => {
    let pushed = false;
    try {
      history.pushState({ exportGuard: true }, "");
      pushed = true;
    } catch {
    }
    const onPop = () => {
      if (!pushed || history.state?.exportGuard === true) return;
      try {
        history.pushState({ exportGuard: true }, "");
      } catch {
        pushed = false;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed && history.state?.exportGuard === true) {
        try {
          history.back();
        } catch {
        }
      }
    };
  }, []);

  const [busy, setBusy] = useState(false);
  const [staging, setStaging] = useState(false);
  const stagingRef = useRef<HTMLDivElement | null>(null);
  const downloadBaseRef = useRef("");
  const sortedCards = useMemo(
    () => sortForExport(cards, effMode, effDir),
    [cards, effMode, effDir, sortForExport],
  );

  const [smViewport, setSmViewport] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    setSmViewport(mq.matches);
    const on = (e: MediaQueryListEvent) => setSmViewport(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const stageMeasure = useMemo(
    () =>
      measureExportStage({
        cards: sortedCards,
        kind: effKind,
        cols: effCols,
        rows: effRows,
        padTop: padPx(prefs.padTop),
        padBottom: padPx(prefs.padBottom),
        padLeft: padPx(prefs.padLeft),
        padRight: padPx(prefs.padRight),
        pins: { dispTeam, dispDps, showFooter },
        sm: smViewport,
      }),
    [
      sortedCards,
      effKind,
      effCols,
      effRows,
      prefs.padTop,
      prefs.padBottom,
      prefs.padLeft,
      prefs.padRight,
      dispTeam,
      dispDps,
      showFooter,
      smViewport,
    ],
  );
  const imgW = stageMeasure.wInt * EXPORT_PIXEL_RATIO;
  const imgH = stageMeasure.hInt * EXPORT_PIXEL_RATIO;
  const overW = imgW > CANVAS_SIDE_LIMIT;
  const overH = imgH > CANVAS_SIDE_LIMIT;
  const overLimit = overW || overH;
  const blockImage = prefs.tab === "image" && overLimit;
  const limitBoxRef = useAutoHeight(overLimit);

  useEffect(() => {
    if (!staging) return;
    let cancelled = false;
    const run = async () => {
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      const el = stagingRef.current;
      if (!el || cancelled) return;
      try {
        const canvas = await toCanvas(el, { pixelRatio: 2 });
        const dataUrl =
          prefs.imgFormat === "webp"
            ? canvas.toDataURL("image/webp", 1)
            : canvas.toDataURL("image/png");
        if (cancelled) return;
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${downloadBaseRef.current}.${prefs.imgFormat}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        console.error("[export] image capture failed", err);
      } finally {
        if (!cancelled) {
          setStaging(false);
          setBusy(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [staging, cards, prefs.imgFormat]);

  const onDownload = () => {
    if (busy) return;
    if (prefs.tab === "file") {
      downloadExportFile(cards, prefs.fileFormat, exportBase());
      return;
    }
    if (prefs.tab === "image") {
      if (overLimit) return;
      downloadBaseRef.current = exportBase();
      setBusy(true);
      setStaging(true);
    }
  };

  usePixelSnap(panelRef);

  const fileFormatOptions: DropOption[] = [
    { key: "json", aria: "JSON", node: <span>JSON</span>, selected: prefs.fileFormat === "json" },
    { key: "csv", aria: "CSV", node: <span>CSV</span>, selected: prefs.fileFormat === "csv" },
    { key: "xlsx", aria: "XLSX", node: <span>XLSX</span>, selected: prefs.fileFormat === "xlsx" },
  ];
  const imgFormatOptions: DropOption[] = [
    { key: "png", aria: "PNG", node: <span>PNG</span>, selected: prefs.imgFormat === "png" },
    {
      key: "webp",
      aria: "WebP",
      node: <span>WebP</span>,
      selected: prefs.imgFormat === "webp",
    },
  ];
  const checkbox = (on: boolean) => (
    <span
      aria-hidden
      className={
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors " +
        (on ? "border-[#d3bc8e] bg-[#d3bc8e] text-[#1c2333]" : "border-[#4a5878]")
      }
    >
      {on && <Check className="h-3 w-3" aria-hidden />}
    </span>
  );
  const dispOptions: DropOption[] = [
    {
      key: "el",
      aria: "Элемент",
      node: (
        <span className="flex items-center gap-2">
          {checkbox(dispEl)} Элемент
        </span>
      ),
    },
    {
      key: "rar",
      aria: "Редкость",
      node: (
        <span className="flex items-center gap-2">
          {checkbox(dispRar)} Редкость
        </span>
      ),
    },
    {
      key: "dps",
      aria: "DPS/DPR",
      node: (
        <span className="flex items-center gap-2">
          {checkbox(dispDps)} DPS/DPR
        </span>
      ),
    },
    {
      key: "team",
      aria: "Команда",
      disabled: effKind === "compact",
      node: (
        <span className="flex items-center gap-2">
          {checkbox(effKind === "cards" && dispTeam)} Команда
        </span>
      ),
    },
  ];
  const dispValue =
    [
      dispEl ? "Элемент" : "",
      dispRar ? "Редкость" : "",
      dispDps ? "DPS/DPR" : "",
      effKind === "cards" && dispTeam ? "Команда" : "",
    ]
      .filter(Boolean)
      .join(", ") || "Ничего";
  const onDispPick = (k: string) => {
    if (k === "el") patch({ dispEl: !dispEl });
    else if (k === "rar") patch({ dispRar: !dispRar });
    else if (k === "dps") patch({ dispDps: !dispDps });
    else if (k === "team") patch({ dispTeam: !dispTeam });
  };
  const sortOptions: DropOption[] = (Object.keys(SORTS) as SortMode[]).map((m) => ({
    key: m,
    aria: `Сортировка: ${SORTS[m].label}`,
    node: <span>{SORTS[m].label}</span>,
    selected: m === effMode,
  }));

  const onSortPick = (key: string) => {
    const mode = key as SortMode;
    if (mode === effMode) {
      patch({ sortDir: effDir === "asc" ? "desc" : "asc" });
    } else {
      patch({ sortMode: mode, sortDir: SORTS[mode].defaultDir });
    }
    setOpenDrop(null);
  };

  const exportStatic = useMemo(
    () => ({
      footerLeft: leftText,
      footerRight: rightText,
      showFooter,
      dispEl,
      dispRar,
      dispDps,
      dispTeam,
    }),
    [leftText, rightText, showFooter, dispEl, dispRar, dispDps, dispTeam],
  );

  const stageCards = useMemo(
    () =>
      sortedCards.map((c, i) =>
        effKind === "compact" ? (
          <TeamCompactCard key={i} team={c.team} source={c.source} exportStatic={exportStatic} />
        ) : (
          <TeamCard key={i} team={c.team} source={c.source} exportStatic={exportStatic} />
        ),
      ),
    [sortedCards, effKind, exportStatic],
  );

  const cardW = effKind === "compact" ? CARD_W.compact : CARD_W.cards;
  const stagingStyle: CSSProperties = {
    width: exportStageWidth(
      effKind,
      effCols,
      padPx(prefs.padLeft),
      padPx(prefs.padRight),
    ),
    paddingTop: padPx(prefs.padTop),
    paddingBottom: padPx(prefs.padBottom),
    paddingLeft: padPx(prefs.padLeft),
    paddingRight: padPx(prefs.padRight),
    background: prefs.bg === "normal" ? "#141c2b" : "transparent",
  };

  return (
    <>
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[100] overflow-y-auto bg-[rgb(10_16_28_/_72%)] p-4 animate-in fade-in animation-duration-200"
      >
        <div className="flex min-h-full">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Экспорт карточек"
            className="export-modal mx-auto my-auto w-full max-w-[480px] rounded-xl border border-[#2f3d59] bg-gradient-to-b from-[#24304a] to-[#1d2739] p-4 shadow-xl shadow-black/40 animate-in fade-in zoom-in-95 animation-duration-200 will-change-transform"
          >
            <div className="mb-3">
              <h2 className="text-[15px] font-semibold leading-tight text-[#e8e2d5]">
                Экспорт карточек
              </h2>
              <p className="mt-1 truncate text-[12px] leading-none text-[#9aa5b8]">
                {cards.length === 1 ? (
                  <>
                    <span className="text-[#d3bc8e]">{cards[0].team.slot}</span>
                    {cards[0].team.team_name ? ` · ${cards[0].team.team_name}` : ""}
                  </>
                ) : (
                  `Выбрано карточек: ${cards.length}`
                )}
              </p>
            </div>

            {cards.length > 1 && (
              <TabRail label="Карточки" className="mb-3">
                {cards.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    data-chip
                    aria-label={`Карточка ${c.team.slot}: состав`}
                    aria-pressed={chipPop?.index === i}
                    onClick={(e) => toggleChipPop(i, e.currentTarget)}
                    className={
                      "flex max-w-40 shrink-0 items-center rounded bg-[#2d3c5c] px-1.5 py-0.5 text-[11.5px] leading-[17px] text-[#e8e2d5] transition-colors hover:bg-[#374664] " +
                      (chipPop?.index === i ? " bg-[#374664] text-[#d3bc8e]" : "")
                    }
                  >
                    <span className="truncate">{c.team.slot}</span>
                  </button>
                ))}
              </TabRail>
            )}

            <TabRail label="Вкладки экспорта">
              {(
                [
                  ["file", "Файл"],
                  ["image", "Изображение"],
                  ["ctor", "Конструктор"],
                ] as [ExportTab, string][]
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  aria-label={`Вкладка: ${lbl}`}
                  aria-pressed={prefs.tab === k}
                  onClick={() => {
                    setOpenDrop(null);
                    setChipPop(null);
                    patch({ tab: k });
                  }}
                  className={
                    "h-8 shrink-0 whitespace-nowrap rounded-md border px-2.5 text-[13px] transition-colors " +
                    (prefs.tab === k
                      ? "border-[#a68b5c] bg-[#4a391526] text-[#d3bc8e]"
                      : "border-[#2f3d59] bg-[#1921311f] text-[#9aa5b8] hover:border-[#435680] hover:text-[#e8e2d5]")
                  }
                >
                  {lbl}
                </button>
              ))}
            </TabRail>

            <div data-stack="top" className="mt-2.5 grid items-start">
              <div className={"col-start-1 row-start-1 " + (prefs.tab === "file" ? "" : "invisible")}>
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,8fr)] items-start gap-2.5">
                    <EditDropdown
                      label="Формат"
                      triggerAria="Формат файла"
                      value={
                        prefs.fileFormat === "json" ? "JSON" : prefs.fileFormat === "csv" ? "CSV" : "XLSX"
                      }
                      options={fileFormatOptions}
                      {...drop("fileFormat")}
                      onPick={(k) => {
                        patch({ fileFormat: k as ExportFileFormat });
                        setOpenDrop(null);
                      }}
                    />
                    <div className="min-w-0">
                      <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Название файла</p>
                      <input
                        type="text"
                        aria-label="Название файла"
                        value={fileNameDirty ? fileName : defName}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setFileName("");
                            setFileNameDirty(false);
                          } else {
                            setFileName(v);
                            setFileNameDirty(true);
                          }
                        }}
                        className="h-8 w-full rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:border-[#a68b5c] focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="mt-2.5 text-[11.5px] leading-[17px] text-[#9aa5b8]">
                    В файл попадут данные {cards.length === 1 ? "одной карточки" : `${cards.length} карточек`} —
                    команды, персонажи, урон и снаряжение.
                  </p>
              </div>

              <div className={"col-start-1 row-start-1 " + (prefs.tab === "image" ? "" : "invisible")}>
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,8fr)] items-start gap-2.5">
                    <EditDropdown
                      label="Формат"
                      triggerAria="Формат изображения"
                      value={prefs.imgFormat === "png" ? "PNG" : "WebP"}
                      options={imgFormatOptions}
                      {...drop("imgFormat")}
                      onPick={(k) => {
                        patch({ imgFormat: k as ImgFormat });
                        setOpenDrop(null);
                      }}
                    />
                    <div className="min-w-0">
                      <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Название файла</p>
                      <input
                        type="text"
                        aria-label="Название файла"
                        value={fileNameDirty ? fileName : defName}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setFileName("");
                            setFileNameDirty(false);
                          } else {
                            setFileName(v);
                            setFileNameDirty(true);
                          }
                        }}
                        className="h-8 w-full rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 text-[13px] text-[#e8e2d5] transition-colors focus:border-[#a68b5c] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div aria-hidden className="mt-4 border-t border-[#2f3d59] pt-3" />

                  <TabRail label="Вкладки изображения">
                    {(
                      [
                        ["view", "Вид"],
                        ["grid", "Сетка"],
                        ["footer", "Футер"],
                        ["pads", "Отступы"],
                      ] as [NestedTab, string][]
                    )
                      .filter(([k]) => k !== "grid" || multi)
                      .map(([k, lbl]) => {
                        const active = nested === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            aria-label={`Вкладка: ${lbl}`}
                            aria-pressed={active}
                            onClick={() => {
                              setOpenDrop(null);
                              setNested(k);
                            }}
                            className={
                              "h-8 shrink-0 whitespace-nowrap border-b-2 px-2.5 text-[13px] transition-colors " +
                              (active
                                ? "border-[#a68b5c] text-[#d3bc8e]"
                                : "border-transparent text-[#9aa5b8] hover:text-[#e8e2d5]")
                            }
                          >
                            {lbl}
                          </button>
                        );
                      })}
                  </TabRail>

                  <div data-stack="nested" className="mt-2.5 grid items-start">
                    <div className={"col-start-1 row-start-1 " + (nested === "view" ? "" : "invisible")}>
                        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,8fr)] items-start gap-2.5">
                          <div className="min-w-0">
                            <p className="mb-1 whitespace-nowrap text-[11px] leading-none text-[#9aa5b8]">
                              Карточки
                            </p>
                            <div className="flex h-8 overflow-hidden rounded-md border border-[#2f3d59]">
                            <Tip label="Крупные">
                                <button
                                  type="button"
                                  aria-pressed={effKind === "cards"}
                                  aria-label="Карточки"
                                  onClick={() => patch({ kind: "cards" })}
                                  className={
                                    "flex flex-1 items-center justify-center transition-colors duration-300 ease-out " +
                                    (effKind === "cards"
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
                                  aria-pressed={effKind === "compact"}
                                  aria-label="Компактные карточки"
                                  onClick={() => patch({ kind: "compact" })}
                                  className={
                                    "flex flex-1 items-center justify-center border-l border-[#2f3d59] transition-colors duration-300 ease-out " +
                                    (effKind === "compact"
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
                            </div>
                          </div>
                          <EditDropdown
                            label="Отображение"
                            triggerAria="Отображение"
                            value={dispValue}
                            options={dispOptions}
                            {...drop("display")}
                            onPick={onDispPick}
                          />
                        </div>
                        <div className="mt-2.5 grid grid-cols-[minmax(0,2fr)_minmax(0,8fr)] items-start gap-2.5">
                          <div className="min-w-0">
                            <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Фон</p>
                            <div className="flex h-8 overflow-hidden rounded-md border border-[#2f3d59]">
                              <Tip label="Обычный">
                                <button
                                  type="button"
                                  aria-pressed={prefs.bg === "normal"}
                                  aria-label="Обычный"
                                  onClick={() => patch({ bg: "normal" })}
                                  className={
                                    "flex flex-1 items-center justify-center transition-colors duration-300 ease-out " +
                                    (prefs.bg === "normal"
                                      ? "bg-[#d3bc8e] text-[#1c2333]"
                                      : "text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#d3bc8e]")
                                  }
                                >
                                  <Square className="h-[18px] w-[18px]" fill="currentColor" aria-hidden />
                                </button>
                              </Tip>
                              <Tip label="Прозрачный">
                                <button
                                  type="button"
                                  aria-pressed={prefs.bg === "transparent"}
                                  aria-label="Прозрачный"
                                  onClick={() => patch({ bg: "transparent" })}
                                  className={
                                    "flex flex-1 items-center justify-center border-l border-[#2f3d59] transition-colors duration-300 ease-out " +
                                    (prefs.bg === "transparent"
                                      ? "bg-[#d3bc8e] text-[#1c2333]"
                                      : "text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#d3bc8e]")
                                  }
                                >
                                  <SquareDashed className="h-[18px] w-[18px]" aria-hidden />
                                </button>
                              </Tip>
                            </div>
                          </div>
                          <EditDropdown
                            label="Сортировка"
                            triggerAria="Сортировка"
                            tip="Повторный выбор того же пункта меняет направление сортировки"
                            disabled={!multi}
                            value={`${SORTS[effMode].label} ${effDir === "asc" ? "↑" : "↓"}`}
                            options={sortOptions}
                            {...drop("sort")}
                            onPick={onSortPick}
                          />
                        </div>
                      </div>

                    <div className={"col-start-1 row-start-1 " + (nested === "grid" ? "" : "invisible")}>
                        <div className="flex items-end gap-2.5">
                          <div className="w-1/5 min-w-0 shrink-0">
                            <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">
                              {prefs.gridAxis === "cols" ? "Столбцы" : "Строки"}
                            </p>
                            <div
                              role="group"
                              aria-label="Ось сетки"
                              className="flex h-8 overflow-hidden rounded-md border border-[#2f3d59]"
                            >
                              <button
                                type="button"
                                aria-pressed={prefs.gridAxis === "cols"}
                                aria-label="Столбцы"
                                onClick={() => onAxisPick("cols")}
                                className={
                                  "flex flex-1 items-center justify-center transition-colors duration-300 ease-out " +
                                  (prefs.gridAxis === "cols"
                                    ? "bg-[#d3bc8e] text-[#1c2333]"
                                    : "text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#d3bc8e]")
                                }
                              >
                                <LayoutArrowRight className="h-[18px] w-[18px]" aria-hidden />
                              </button>
                              <button
                                type="button"
                                aria-pressed={prefs.gridAxis === "rows"}
                                aria-label="Строки"
                                onClick={() => onAxisPick("rows")}
                                className={
                                  "flex flex-1 items-center justify-center border-l border-[#2f3d59] transition-colors duration-300 ease-out " +
                                  (prefs.gridAxis === "rows"
                                    ? "bg-[#d3bc8e] text-[#1c2333]"
                                    : "text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#d3bc8e]")
                                }
                              >
                                <LayoutArrowDown className="h-[18px] w-[18px]" aria-hidden />
                              </button>
                            </div>
                          </div>
                          <div className="relative min-w-0 flex-1">
                            <input
                              type="range"
                              className="export-slider block h-8 w-full cursor-pointer appearance-none"
                              min={1}
                              max={maxCount}
                              step={1}
                              value={effCount}
                              aria-label={prefs.gridAxis === "cols" ? "Столбцы сетки" : "Строки сетки"}
                              aria-valuetext={`${effCols} × ${effRows}`}
                              style={{ "--grid-fill": `${gridFillPct}%` } as CSSProperties}
                              onChange={(e) =>
                                patch(
                                  prefs.gridAxis === "cols"
                                    ? { gridCols: Number(e.target.value) }
                                    : { gridRows: Number(e.target.value) },
                                )
                              }
                              onPointerDown={() => setSliding(true)}
                              onPointerUp={() => setSliding(false)}
                              onPointerCancel={() => setSliding(false)}
                              onFocus={() => setSliding(true)}
                              onBlur={() => setSliding(false)}
                            />
                            {sliding && (
                              <div
                                className="pointer-events-none absolute bottom-full mb-1.5 w-max -translate-x-1/2 whitespace-nowrap rounded-md border border-[#2f3d59] bg-[#1d2739] px-2 py-0.5 text-[12px] leading-[17px] text-[#e8e2d5] shadow-xl shadow-black/40 animate-in fade-in animation-duration-100"
                                style={{
                                  left:
                                    "clamp(30px, calc(8px + " +
                                    gridFillPct / 100 +
                                    " * (100% - 16px)), calc(100% - 30px))",
                                }}
                              >
                                {prefs.gridAxis === "cols" ? (
                                  <>
                                    <span className="text-[#d3bc8e]">{effCols}</span> × {effRows}
                                  </>
                                ) : (
                                  <>
                                    {effCols} × <span className="text-[#d3bc8e]">{effRows}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="mt-2.5 text-[12px] leading-[17px] text-[#9aa5b8]">
                          Ползунок выбирает количество столбцов или строк — вторая сторона подстроится
                          под количество карточек автоматически.
                        </p>
                        <div
                          data-limit-box
                          ref={limitBoxRef}
                          role="status"
                          aria-live="polite"
                          className={
                            "mt-2.5 grid items-start rounded-md border bg-[#1d2739] px-2.5 py-2 transition-[height,border-color] duration-200 ease-out motion-reduce:transition-none " +
                            (overLimit ? "border-[#d86a6a]" : "border-[#2f3d59]")
                          }
                        >
                          <div
                            className={"col-start-1 row-start-1 transition-[opacity,visibility] duration-200 ease-out motion-reduce:transition-none " + (overLimit ? "opacity-100" : "invisible opacity-0")}
                          >
                            <p className="text-[12px] leading-[17px] text-[#9aa5b8]">
                              Итоговое изображение:{" "}
                              <span
                                className={
                                  "tabular-nums transition-colors duration-200 ease-out " +
                                  (overW ? "text-[#e8a7a7]" : "text-[#e8e2d5]")
                                }
                              >
                                {imgW}
                              </span>
                              <span className="text-[#e8e2d5]"> × </span>
                              <span
                                className={
                                  "tabular-nums transition-colors duration-200 ease-out " +
                                  (overH ? "text-[#e8a7a7]" : "text-[#e8e2d5]")
                                }
                              >
                                {imgH}
                              </span>
                              <span className="text-[#e8e2d5]"> px.</span>{" "}
                              (Макс:{" "}
                              <span className="text-[#e8e2d5] tabular-nums">16383 px</span>!)
                            </p>
                          </div>
                          <div
                            className={"col-start-1 row-start-1 transition-[opacity,visibility] duration-200 ease-out motion-reduce:transition-none " + (overLimit ? "invisible opacity-0" : "opacity-100")}
                          >
                            <p className="text-[12px] leading-[17px] text-[#9aa5b8]">
                              Итоговое изображение:{" "}
                              <span className="text-[#e8e2d5] tabular-nums">
                                {imgW} × {imgH} px
                              </span>
                              .
                            </p>
                          </div>
                        </div>
                    </div>

                    <div className={"col-start-1 row-start-1 " + (nested === "footer" ? "" : "invisible")}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={showFooter}
                          aria-label="Отображать"
                          onClick={() => patch({ showFooter: !showFooter })}
                          className="flex h-8 cursor-pointer items-center gap-2 text-[13px] text-[#e8e2d5]"
                        >
                          {checkbox(showFooter)}
                          Отображать
                        </button>
                        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                          <div>
                            <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Левый</p>
                            <input
                              type="text"
                              aria-label="Левый футер"
                              value={leftText}
                              disabled={!showFooter}
                              onChange={(e) => setLeftText(e.target.value)}
                              className={
                                "h-8 w-full rounded-md border bg-[#1d2739] px-2.5 text-[13px] transition-colors " +
                                (showFooter
                                  ? "border-[#2f3d59] text-[#e8e2d5] focus:border-[#a68b5c] focus:outline-none"
                                  : "cursor-not-allowed border-[#2f3d59] text-[#6b7893]")
                              }
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] leading-none text-[#9aa5b8]">Правый</p>
                            <input
                              type="text"
                              aria-label="Правый футер"
                              value={rightText}
                              disabled={!showFooter}
                              onChange={(e) => setRightText(e.target.value)}
                              className={
                                "h-8 w-full rounded-md border bg-[#1d2739] px-2.5 text-[13px] transition-colors " +
                                (showFooter
                                  ? "border-[#2f3d59] text-[#e8e2d5] focus:border-[#a68b5c] focus:outline-none"
                                  : "cursor-not-allowed border-[#2f3d59] text-[#6b7893]")
                              }
                            />
                          </div>
                        </div>
                    </div>

                    <div className={"col-start-1 row-start-1 " + (nested === "pads" ? "" : "invisible")}>
                        <div className="grid grid-cols-2 gap-2.5">
                          {padField("Верхний, px", "padTop")}
                          {padField("Нижний, px", "padBottom")}
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                          {padField("Левый, px", "padLeft")}
                          {padField("Правый, px", "padRight")}
                        </div>
                        <div
                          className={
                            "mt-2.5 grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none " +
                            (padsEmpty ? "[grid-template-rows:1fr]" : "[grid-template-rows:0fr] opacity-0")
                          }
                        >
                          <div className="min-h-0 overflow-hidden">
                            <p className="text-[12px] leading-[17px] text-[#9aa5b8]">
                              Здесь можно задать отступы на итоговом изображении (например, для того, чтобы
                              добавить пространство для текста/комментариев)
                            </p>
                          </div>
                        </div>
                    </div>
                  </div>
                </div>

              <div className={"col-start-1 row-start-1 " + (prefs.tab === "ctor" ? "" : "invisible")}>
                <div className="py-8 text-center">
                  <p className="text-[13px] text-[#9aa5b8]">Пока пусто</p>
                  <p className="mt-1 text-[11.5px] leading-[17px] text-[#6b7893]">
                    Раздел будет наполнен позже.
                  </p>
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
                aria-label="Скачать"
                disabled={busy || prefs.tab === "ctor" || blockImage}
                onClick={onDownload}
                className={
                  "h-8 rounded-md px-3 text-[13px] font-semibold transition-[background-color,color,opacity] duration-200 ease-out " +
                  (!busy && prefs.tab !== "ctor" && !blockImage
                    ? "cursor-pointer bg-[#d3bc8e] text-[#1c2333] hover:bg-[#e0cc9e]"
                    : "cursor-not-allowed bg-[#d3bc8e]/50 text-[#1c2333] opacity-50")
                }
              >
                Скачать
              </button>
            </div>
          </div>
        </div>
      </div>

      {chipPop && (
        <div
          ref={popRef}
          data-chip-pop
          role="dialog"
          aria-label={`Карточка ${cards[chipPop.index].team.slot}: состав`}
          className={
            "fixed z-[120] w-80 max-w-[calc(100vw-16px)] rounded-lg border border-[#435680] bg-[#1d2739] p-2.5 shadow-xl shadow-black/40 animate-in fade-in animation-duration-150 will-change-transform " +
            (popUp ? "slide-in-from-bottom-2" : "slide-in-from-top-2")
          }
          style={{ top: popTop, left: chipPop.left }}
        >
          <CompositionPlate team={cards[chipPop.index].team} />
        </div>
      )}

      {staging && (
        <div aria-hidden style={{ position: "fixed", left: "-20000px", top: "0px" }}>
          <div ref={stagingRef} data-export-stage style={stagingStyle}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${effCols}, ${cardW}px)`,
                gap: PAGE_GAP,
              }}
            >
              {stageCards}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LayoutArrowRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <path d="M3 18h18" />
      <path d="m18 21 3-3-3-3" />
    </svg>
  );
}

function LayoutArrowDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
      <path d="M18 3v18" />
      <path d="m21 18-3 3-3-3" />
    </svg>
  );
}

function CompositionPlate({ team }: { team: ExportCardData["team"] }) {
  return (
    <>
      {sortedCharacters(team).map((c, i) => {
        const color = CHAR_COLORS[i % CHAR_COLORS.length];
        const share = charDamageShare(team, c);
        const { cons, base } = charNameParts(c);
        const gear = characterGear(c);
        return (
          <div key={c.name} className="border-t border-black/25 py-1.5 first:border-t-0">
            <div className="flex items-center gap-2 text-[12.5px]">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
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
        const tipExtra = extraDamageOrNull(team);
        if (!tipExtra) return null;
        const tipExtraPct = extraDamagePercent(team);
        return (
          <div className="border-t border-black/25 py-1.5">
            <div className="flex items-center gap-2 text-[12.5px]">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: EXTRA_COLOR }} />
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
    </>
  );
}
