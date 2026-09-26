"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { ArrowUp, Check, ChevronDown, LayoutGrid, Rows3, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SourcePanel } from "@/components/showcase/source-panel";
import { TeamCard } from "@/components/showcase/team-card";
import { parseCsv } from "@/lib/showcase/csv";
import {
  CHAR_COLORS,
  charDamageShare,
  sortedCharacters,
  teamDisplayName,
} from "@/lib/showcase/display";
import { charBaseName, fmt1, fmtInt, parseSlot, splitCons } from "@/lib/showcase/format";
import { fetchSheetCsv } from "@/lib/showcase/google";
import { parseShowcaseGrid } from "@/lib/showcase/parse";
import type { ShowcaseData } from "@/lib/showcase/types";
import { readWorkbook, pickShowcaseSheet, type WorkbookSheets } from "@/lib/showcase/xlsx";
import demoRaw from "@/data/demo-teams.json";

const DEMO_LABEL = "Демо: Showcase · Timmie's Bird";

const demoData: ShowcaseData = {
  ...(demoRaw as unknown as ShowcaseData),
  source_type: "demo",
  source: DEMO_LABEL,
};

type SortMode = "order" | "dpr" | "dps" | "time";
type SortDir = "asc" | "desc";
type Team = ShowcaseData["teams"][number];
type ViewMode = "cards" | "rows";

const SORTS: Record<SortMode, { label: string; defaultDir: SortDir }> = {
  order: { label: "по порядку", defaultDir: "asc" },
  dps: { label: "DPS", defaultDir: "desc" },
  dpr: { label: "DPR", defaultDir: "desc" },
  time: { label: "время ротации", defaultDir: "asc" },
};

/** Порядковый ключ слота: R1·C1 < R2·C1 < … < R6·C1 < R1·C2 < … (ряд меняется первым, затем колонка). */
function slotOrder(t: Team): number {
  const s = parseSlot(t.slot);
  return s ? s.col * 100 + s.row : Number.MAX_SAFE_INTEGER;
}

type SearchParam = "all" | "team" | "char" | "weapon" | "set" | "author" | "slot";

const SEARCH_PARAMS: Record<SearchParam, string> = {
  all: "Все",
  char: "Персонаж",
  team: "Команда",
  weapon: "Оружие",
  set: "Сет",
  author: "Автор",
  slot: "Слот",
};

/** Параметры, по которым хранится мультивыбор. Порядок — как в меню кнопки
 *  «Параметр поиска» (просьба 20.09: «Персонаж» перед «Командой»): в том же
 *  порядке секции идут и в выпадающей панели режима «Все», и чипы в строке
 *  поиска. Выбор пишется в параметр своей секции: персонажи — в sel.char,
 *  команды — в sel.team и т.д. */
type ParamKey = Exclude<SearchParam, "all">;
const PARAM_KEYS: ParamKey[] = ["char", "team", "weapon", "set", "author", "slot"];

const EMPTY_SEL: Record<ParamKey, string[]> = {
  char: [],
  team: [],
  weapon: [],
  set: [],
  author: [],
  slot: [],
};

/** Нормализация слота для поиска: «R1·C3» -> «r1c3» (разделитель вводить не обязательно). */
function normSlot(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Значения команды для параметра поиска (для «Все» варианты — персонажи). */
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
    case "slot":
      return [t.slot];
    default:
      return t.characters.map((c) => charBaseName(c.name));
  }
}

/** Текстовый запрос по параметру («Все» — по всем полям карточки).
 *  Слоты сравниваются нормализованно: «r1c3» находит «R1·C3». */
function matchesParam(t: Team, p: SearchParam, q: string): boolean {
  if (p === "slot") {
    const nq = normSlot(q);
    return teamValues(t, p).some((v) => normSlot(v).includes(nq));
  }
  if (p === "all") {
    const hay = [t.team_name, t.rotation, t.author, t.slot, normSlot(t.slot)]
      .concat(t.characters.flatMap((c) => [charBaseName(c.name), c.weapon, c.artifact_set]))
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }
  return teamValues(t, p).some((v) => v.toLowerCase().includes(q));
}

// Тултип в стиле страницы вместо системного title: тёмный фон, золотая рамка,
// шрифт как у вторичного текста. Показывается только на устройствах с наведением —
// на тач-устройствах системного ховера нет, а фокус от тапа не должен открывать
// подсказки (до монтирования canHover=false — совпадает с серверным HTML).
// Обёртка не меняет разметку: TooltipPrimitive.Root не рендерит DOM-узлов,
// контент живёт в портале у body и не обрезается overflow-hidden родителей
// (например, группы переключателей вида и «Любое/Только»).
function useCanHover() {
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)");
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return canHover;
}

// «Мобильность» сайта определяется по типу указателя — matchMedia
// "(pointer: coarse)" (тач/перо как основной указатель), НЕ по разрешению
// окна и НЕ по user-agent (ответ на вопрос 20.09). Раз подсказка
// «Ctrl+K или /» имеет смысл только при аппаратной клавиатуре, на
// coarse-устройствах плейсхолдер — просто «Поиск» (просьба 20.09).
//
// Фидбек 21.09: на мобильном плейсхолдер МЕНЯЛСЯ с задержкой, уже после
// загрузки — useCoarsePointer до монтирования возвращал false, SSR рисовал
// десктопный вариант, а эффект после гидрации переписывал его на «Поиск».
// Схема теперь трёхсостоятельная (null | false | true) и работает в паре
// с pre-paint скриптом в layout.tsx (в конце body):
//   • null (SSR и первый клиентский рендер) → длинный вариант — серверный
//     и гидрационный HTML совпадают, расхождений нет;
//   • inline-скрипт layout.tsx выполняется при разборе HTML, ДО гидрации
//     (модульные бандлы React отложены до конца парсинга): на coarse-
//     устройствах он сразу переписывает атрибут placeholder на «Поиск» —
//     мобильный видит короткий вариант с первого кадра и больше ничего
//     не меняется (расхождение DOM/vdom гасится suppressHydrationWarning
//     на поле; React применяет атрибут только при ИЗМЕНЕНИИ значения);
//   • после монтирования эффект ставит false (coarse) или true (fine):
//     на мобильном long→short совпадает с уже стоящим в DOM «Поиск»
//     (незаметно), на десктопе значение long→long не меняется вовсе.
function useFinePointer(): boolean | null {
  const [fine, setFine] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setFine(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine;
}

function Tip({
  label,
  children,
  side = "top",
}: {
  // ReactNode, а не string: тултипу строки поиска нужны две строки-пункта
  // (просьба 21.09); все остальные вызовы по-прежнему передают строку
  label: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const canHover = useCanHover();
  // Авто-закрытие через 5 секунд (просьба 21.09: «все тултипы должны
  // автоматически исчезать»). Управляемый open: открытие стартует таймер,
  // закрытие (уход курсора) его снимает; повторное наведение запускает
  // отсчёт заново. Пока курсор неподвижно висит над триггером дольше 5с —
  // тултип скрывается и не появляется, пока курсор не уйдёт и не вернётся.
  const [auto, setAuto] = useState(false);
  const autoTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    },
    [],
  );
  const onOpenChange = (o: boolean) => {
    setAuto(o);
    if (autoTimerRef.current) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    if (o) autoTimerRef.current = window.setTimeout(() => setAuto(false), 5000);
  };
  // open={false} без ховера: тултип никогда не откроется на таче;
  // с ховером — управляемое значение (таймер авто-закрытия)
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root open={canHover ? auto : false} onOpenChange={onOpenChange}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            collisionPadding={8}
            className="z-50 w-fit max-w-72 rounded-lg border border-[#2f3d59] bg-[#1d2739] px-2.5 py-1.5 text-[11.5px] leading-snug text-[#e8e2d5] shadow-md shadow-black/25 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export default function Home() {
  const finePtr = useFinePointer();
  const [data, setData] = useState<ShowcaseData>(demoData);
  const [sourceLabel, setSourceLabel] = useState<string>(DEMO_LABEL);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingSheets, setPendingSheets] = useState<WorkbookSheets | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchParam, setSearchParam] = useState<SearchParam>("all");
  // мультивыбор по каждому параметру одновременно; сочетание вариантов задаёт selMode (И/ИЛИ)
  const [sel, setSel] = useState<Record<ParamKey, string[]>>({ ...EMPTY_SEL });
  const [optsOpen, setOptsOpen] = useState(false);
  // выпадающие меню «Сортировка» и «Параметр поиска» — управляемые: на тач-
  // устройствах Radix-триггер открывает меню на pointerdown, ещё до того как
  // браузер распознает жест прокрутки, — палец, начавший скролл с кнопки,
  // открывал меню вместо прокрутки. Не-мышиные pointerdown мы не пропускаем
  // до Radix (см. onPointerDownCapture у триггеров): меню открывается по
  // click — только на настоящем тапе; прокрутка остаётся нативной.
  // ptrRef — тип последнего указателя: click отличает тап (открыть) от
  // мыши/клавиатуры (их уже открыл Radix на pointerdown/Enter — иначе вышло
  // бы двойное срабатывание); сбрасывается на keydown, чтобы «протухший»
  // touch-тип не принял клавиатурный click за тап.
  const [sortOpen, setSortOpen] = useState(false);
  const [paramOpen, setParamOpen] = useState(false);
  const sortPtrRef = useRef("");
  const paramPtrRef = useRef("");
  // режим мультивыбора: "or" — хотя бы один вариант каждого параметра, "and" — все выбранные варианты одновременно
  const [selMode, setSelMode] = useState<"or" | "and">("or");
  // вид: карточки или компактные строки; раскрытая строка в компактном виде (слот)
  const [view, setView] = useState<ViewMode>("cards");
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const statsRef = useRef<HTMLElement | null>(null);
  const searchRootRef = useRef<HTMLDivElement | null>(null);
  const topBtnRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // панель выпадающих вариантов: при вводе/смене параметра список
  // прокручивается вверх (просьба 20.09: «фокус в выпадающем меню должен
  // смещаться в самый верх») — фильтр меняет состав списка, а старая
  // прокрутка оставляла его «внизу», и верхний вариант (который выберет
  // Enter) был не виден
  const optsPanelRef = useRef<HTMLDivElement | null>(null);
  // подсказка состава команды в компактном виде (наведение на название или DPS дольше 1с)
  const [hoverTip, setHoverTip] = useState<{ team: Team; top: number; left: number } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  // кнопка «наверх»: классы переключаются напрямую через DOM, без setState —
  // появление кнопки не должно вызывать ре-рендер страницы (был источник рывков при прокрутке)
  useEffect(() => {
    const onScroll = () => {
      const el = topBtnRef.current;
      if (!el) return;
      // появляется, когда строка «Статистика» — место, куда кнопка ведёт, — уже
      // скрылась за верхом окна на 100px: раньше кнопка не нужна, статистика ещё видна
      const stats = statsRef.current;
      const on = !!stats && stats.getBoundingClientRect().top < -100;
      el.dataset.show = on ? "true" : "false";
      el.setAttribute("aria-hidden", on ? "false" : "true");
      el.tabIndex = on ? 0 : -1;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // сохранённый вид отображения: синхронизируем состояние React с сохранённым
  // значением. Без flushSync (вызывал ошибку «flushSync was called from inside
  // a lifecycle method») — он и не нужен: оба списка команд теперь всегда есть
  // в статическом HTML (см. main ниже), pre-paint скрипт layout.tsx + CSS
  // (globals.css, html[data-flash-view]) показывают строки ещё до гидрации,
  // в первом кадре — раньше строки ждали гидрации и появлялись с заметной
  // задержкой, пока карточки были отрисованы в HTML заранее. Здесь только
  // выравниваем состояние с тем, что уже видно на экране, — флэша нет.
  useEffect(() => {
    let v: string | null = null;
    try {
      v = localStorage.getItem("showcase-view");
    } catch {
      /* приватный режим — просто без сохранения */
    }
    if (v === "rows") setView("rows");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("showcase-view", view);
    } catch {
      /* игнорируем */
    }
  }, [view]);

  // снятие pre-paint метки (ставится inline-скриптом в layout.tsx, см. также
  // globals.css): после того как состояние «строки» применено, классы списков
  // уже сами показывают строки — метка и её CSS-правила больше не нужны.
  useEffect(() => {
    if (view === "rows") document.documentElement.removeAttribute("data-flash-view");
  }, [view]);

  // горячие клавиши (просьба 20.09): «/» и Ctrl+K (⌘K на Mac) фокусируют
  // строку поиска — как на GitHub/YouTube. Хоткей ДОПОЛНИТЕЛЬНО открывает
  // панель вариантов явным setOptsOpen: фокус мог уже стоять в поле
  // (Esc закрыл панель, фокус остался) — onFocus не сработал бы, и панель
  // не открывалась до снятия фокуса (баг-репорт 20.09, раунд-8).
  // «/» не перехватываем, когда пользователь уже печатает в
  // поле (или открыто меню/поповер — там «/» работает как печать/тайпахед);
  // Ctrl+K ловим всегда и по физической клавише (e.code — работает и на
  // русской раскладке, где эта клавиша даёт «л»)
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

  // подсказку скрываем при прокрутке/ресайзе (позиция устаревает)
  useEffect(() => {
    if (!hoverTip) return;
    const hide = () => setHoverTip(null);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
    };
  }, [hoverTip]);

  // закрытие выпадающих вариантов поиска: клик вне / Escape
  useEffect(() => {
    if (!optsOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (!searchRootRef.current?.contains(e.target as Node)) setOptsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOptsOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [optsOpen]);

  // панель вариантов всегда начинается сверху при смене запроса/параметра/
  // режима/переоткрытии (см. комментарий у optsPanelRef)
  useEffect(() => {
    optsPanelRef.current?.scrollTo({ top: 0 });
  }, [query, searchParam, selMode, optsOpen]);

  const teams = useMemo(
    () => data.teams.filter((t) => !t.is_empty && t.characters.length > 0),
    [data],
  );

  const stats = useMemo(
    () => ({
      teams: teams.length,
      chars: new Set(teams.flatMap((t) => t.characters.map((c) => charBaseName(c.name)))).size,
    }),
    [teams],
  );

  // варианты для выпадающего меню — сразу по всем параметрам: [значение, число
  // команд]. Сортировка — строго по алфавиту (просьба 20.09; раньше — по числу
  // команд; у «Команды» и «Слота» значения уникальны и так давали алфавит).
  // В режиме «Только» варианты считаются по командам, удовлетворяющим текущему
  // выбору, — несовместимые из списка исчезают. Считать все параметры сразу
  // нужно для режима «Все» (панель показывает секции всех параметров), а стоит
  // это копейки: teams × 6 параметров.
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
        .sort((a, b) => a[0].localeCompare(b[0], "ru"))
        .slice(0, 100);
    }
    return res;
  }, [teams, query, sel, selMode]);

  // сколько вариантов выбрано в панели: в режиме «Все» — по всем параметрам
  // (каждая секция выбирает в свой), иначе — по текущему параметру
  const selCount =
    searchParam === "all"
      ? PARAM_KEYS.reduce((n, p) => n + sel[p].length, 0)
      : sel[searchParam].length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = PARAM_KEYS.filter((p) => sel[p].length > 0);
    const list = teams.filter((t) => {
      // "and": все выбранные значения (всех параметров) должны быть в команде;
      // "or": в каждом параметре — хотя бы одно из выбранных, параметры между собой — «и»
      const selOk =
        selMode === "and"
          ? active.every((p) => sel[p].every((v) => teamValues(t, p).includes(v)))
          : active.every((p) => teamValues(t, p).some((v) => sel[p].includes(v)));
      const qOk = !q || matchesParam(t, searchParam, q);
      return selOk && qOk;
    });
    // Компараторы описаны в «прямом» порядке; направление задаёт sortDir.
    const cmp: Record<SortMode, (a: Team, b: Team) => number> = {
      order: (a, b) => slotOrder(a) - slotOrder(b),
      dpr: (a, b) => (a.total_dpr ?? -Infinity) - (b.total_dpr ?? -Infinity),
      dps: (a, b) => (a.dps ?? -Infinity) - (b.dps ?? -Infinity),
      time: (a, b) => (a.rotation_time_s ?? 1e9) - (b.rotation_time_s ?? 1e9) || (a.dps ?? 0) - (b.dps ?? 0),
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => dir * cmp[sortMode](a, b));
  }, [teams, query, sortMode, sortDir, searchParam, sel, selMode]);

  // выбор в панели: в режиме «Все» секция пишет в свой параметр (секция
  // «Команда» — в sel.team и т.д.), в остальных — в текущий параметр
  function toggleSel(v: string, p: ParamKey) {
    setSel((s) => {
      const cur = s[p];
      return { ...s, [p]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });
  }

  // кнопка-вариант панели: чекбокс + значение + счётчик команд
  const renderOptions = (p: ParamKey, opts: [string, number][]) =>
    opts.map(([v, cnt]) => {
      const on = sel[p].includes(v);
      return (
        <button
          key={`${p}:${v}`}
          type="button"
          onClick={() => {
            toggleSel(v, p);
            // вариант выбран — набранный текст больше не нужен, стираем
            // (просьба 20.09: «после клика мышью по варианту тоже стереть
            // текст, если он есть»)
            setQuery("");
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-[#e8e2d5] transition-colors hover:bg-[#24304a]"
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-[#d3bc8e] bg-[#d3bc8e] text-[#1c2333]" : "border-[#4a5878]"}`}
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
  }

  // подсказка состава команды: показать через 1с наведения на название или DPS.
  // Только для устройств с мышью — на тач-устройствах наведения нет, тап раскрывает карточку.
  // Таймера авто-скрытия НЕТ — исключение из правила 5 секунд (фидбек 20.09,
  // раунд-8): состав команды читают дольше 5 секунд, подсказка живёт, пока
  // курсор на зоне наведения; скрывают её уход курсора, скролл/ресайз и
  // клик по строке (раскрытие карточки)
  function startTip(e: MouseEvent, t: Team) {
    if (!window.matchMedia("(hover: hover)").matches) return;
    const el = e.currentTarget as HTMLElement;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      // clientWidth, а не innerWidth: на системах с классической полосой прокрутки
      // innerWidth включает её ширину, и тултип уезжал под скроллбар за правый край
      const vw = document.documentElement.clientWidth;
      const left = Math.max(8, Math.min(r.left, vw - 328));
      setHoverTip({ team: t, top: r.bottom + 8, left });
    }, 1000);
  }

  function cancelTip() {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    setHoverTip(null);
  }

  // прокрутка «наверх»: анкор на строку «Статистика» — вплотную к верху окна;
  // шапка и панель источника уходят из виду, ниже видны поиск и список команд
  function scrollToStats() {
    const el = statsRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  // Выбор того же пункта повторно — меняет направление (возрастание/убывание).
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
  ) {
    const parsed = parseShowcaseGrid(grid, label, type, { alignedRows });
    setData(parsed);
    setSourceLabel(label);
    setNotice(`${parsed.slots_filled} команд · слотов в сетке: ${parsed.slots_total}`);
    setPendingSheets(null);
    setError(null);
  }

  async function onFile(file: File) {
    setError(null);
    setNotice(null);
    setPendingSheets(null);
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".csv") || file.type === "text/csv") {
        setBusy(`Читаю ${file.name}…`);
        const text = await file.text();
        applyGrid(parseCsv(text), file.name, "csv");
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        setBusy(`Читаю ${file.name}…`);
        const buf = await file.arrayBuffer();
        const sheets = readWorkbook(buf);
        const auto = pickShowcaseSheet(sheets.names);
        if (auto) {
          applyGrid(sheets.getGrid(auto), `${file.name} · лист «${auto}»`, "xlsx");
        } else if (sheets.names.length === 1) {
          applyGrid(sheets.getGrid(sheets.names[0]), `${file.name} · «${sheets.names[0]}»`, "xlsx");
        } else {
          setPendingSheets(sheets);
          setNotice(null);
          setError(
            `В книге ${sheets.names.length} листов, но листа «Showcase» среди них нет. ` +
              "Выберите нужный лист вручную.",
          );
        }
      } else {
        setError("Поддерживаются только файлы .xlsx и .csv.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onLink(url: string) {
    setError(null);
    setNotice(null);
    setPendingSheets(null);
    try {
      setBusy("Скачиваю лист по ссылке…");
      const { text, via } = await fetchSheetCsv(url);
      // gviz пропускает пустые строки листа — абсолютные адреса якорей не вычисляем
      applyGrid(parseCsv(text), `Google Sheets · ${via === "export" ? "CSV" : "gviz CSV"}`, "csv", via === "export");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function onPickSheet(name: string) {
    if (!pendingSheets) return;
    try {
      applyGrid(pendingSheets.getGrid(name), `xlsx · лист «${name}»`, "xlsx");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onDemo() {
    setData({ ...demoData });
    setSourceLabel(DEMO_LABEL);
    setNotice(null);
    setError(null);
    setPendingSheets(null);
    setQuery("");
  }

  const statCells = [
    { v: String(stats.teams), k: "Команды" },
    { v: String(stats.chars), k: "Персонажи" },
  ];

  // есть ли чипы фильтров — тогда плейсхолдер поиска скрывается (как при ручном вводе)
  const hasChips = PARAM_KEYS.some((p) => sel[p].length > 0);

  return (
    <div className="flex min-h-screen flex-col bg-[#141c2b] text-[#e8e2d5]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(1200px_360px_at_50%_-120px,#1e2c47_0%,transparent_70%)]"
      />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-12 sm:px-6">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <Tip label="Проект в активной разработке: интерфейс и данные могут меняться">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#8a6d3b] bg-[#2a2113] px-3 py-1 text-[11px] font-semibold tracking-widest text-[#e5c07b] uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e5c07b] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#e5c07b]" />
                </span>
                WIP — Alpha
              </span>
            </Tip>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-wide text-[#d3bc8e]">
            Genshin Impact — Showcase команд
          </h1>
          <p className="mt-2 text-[13.5px] text-[#9aa5b8]">
            Динамическая страница: загрузите xlsx, CSV или ссылку на лист Google-таблицы — команды
            будут извлечены автоматически (только видимые значения листа). Парсинг выполняется
            целиком в браузере, сервер не требуется.
          </p>
        </header>

        <SourcePanel
          onFile={onFile}
          onLink={onLink}
          onDemo={onDemo}
          onPickSheet={onPickSheet}
          busy={busy}
          error={error}
          notice={notice}
          sourceLabel={sourceLabel}
          pendingSheets={pendingSheets}
        />

        {/* Раскладка — контейнер-запросом (globals.css: .stats-sec/.stats-cells/
            .stats-cell/.stats-controls/.stats-sort, порог 620px): считается в
            CSS до первой отрисовки, без эффекта-замера — на мобильных нет
            перестройки строк статистики/сортировки после загрузки */}
        <section
          ref={statsRef}
          aria-label="Статистика"
          className="stats-sec mt-5 flex flex-wrap items-center gap-3"
        >
          <div className="stats-cells flex flex-wrap items-center gap-3">
            {statCells.map((s) => (
              <div
                key={s.k}
                className="stats-cell flex items-baseline gap-1.5 rounded-xl border border-[#2f3d59] bg-[#1d2739] px-4 py-1.5"
              >
                <span className="text-[12.5px] text-[#9aa5b8]">{s.k}:</span>
                <span className="text-[17px] font-semibold tabular-nums text-[#d3bc8e]">{s.v}</span>
              </div>
            ))}
          </div>

          <div className="stats-controls flex items-center gap-2.5">
            {/* modal={false}: без модальности Radix не блокирует прокрутку окна
                (react-remove-scroll раньше ставил body overflow:hidden —
                скроллбар исчезал на всё время открытого меню) */}
            <DropdownMenu open={sortOpen} onOpenChange={setSortOpen} modal={false}>
              <Tip label="Повторный выбор того же пункта меняет направление сортировки">
              <DropdownMenuTrigger
                aria-label="Сортировка"
                onPointerDownCapture={(e) => {
                  // тач/перо не доходит до Radix — иначе прокрутка пальцем с
                  // кнопки открывает меню; см. комментарий у sortPtrRef
                  sortPtrRef.current = e.pointerType;
                  if (e.pointerType !== "mouse") e.stopPropagation();
                }}
                onKeyDown={() => {
                  sortPtrRef.current = "";
                }}
                onClick={() => {
                  if (sortPtrRef.current !== "touch" && sortPtrRef.current !== "pen") return;
                  sortPtrRef.current = "";
                  // тап по «Сортировке» закрывает панель вариантов поиска —
                  // обычно это делает onDoc, но тач-событие до него не доходит
                  setOptsOpen(false);
                  setSortOpen((o) => !o);
                }}
                className="stats-sort flex h-9 items-center justify-between gap-2 rounded-md border border-[#2f3d59] bg-[#1d2739] px-3 text-[13.5px] text-[#e8e2d5] transition-colors hover:border-[#a68b5c] data-[state=open]:border-[#a68b5c]"
              >
                <span className="truncate">
                  Сортировка: {SORTS[sortMode].label} {sortDir === "asc" ? "↑" : "↓"}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
              </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent className="w-56 border-[#2f3d59] bg-[#1d2739] text-[#e8e2d5]">
                {(Object.keys(SORTS) as SortMode[]).map((m) => (
                  <DropdownMenuItem
                    key={m}
                    onSelect={() => onSortPick(m)}
                    className="gap-2 text-[13.5px] focus:bg-[#24304a] focus:text-[#e8e2d5]"
                  >
                    <span className="flex-1">{SORTS[m].label}</span>
                    {m === sortMode && <Check className="h-4 w-4 text-[#d3bc8e]" aria-hidden />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div
              role="group"
              aria-label="Вид отображения"
              className="flex h-9 shrink-0 overflow-hidden rounded-md border border-[#2f3d59]"
            >
              <Tip label="Карточки">
                <button
                  type="button"
                  onClick={() => setView("cards")}
                  aria-pressed={view === "cards"}
                  aria-label="Карточки"
                  className={
                    "view-toggle-cards flex w-9 items-center justify-center transition-colors " +
                    (view === "cards"
                      ? "bg-[#d3bc8e] text-[#1c2333]"
                      : "text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#e8e2d5]")
                  }
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden />
                </button>
              </Tip>
              <Tip label="Компактные строки">
                <button
                  type="button"
                  onClick={() => setView("rows")}
                  aria-pressed={view === "rows"}
                  aria-label="Компактные строки"
                  className={
                    "view-toggle-rows flex w-9 items-center justify-center border-l border-[#2f3d59] transition-colors " +
                    (view === "rows"
                      ? "bg-[#d3bc8e] text-[#1c2333]"
                      : "text-[#9aa5b8] hover:bg-[#24304a] hover:text-[#e8e2d5]")
                  }
                >
                  <Rows3 className="h-4 w-4" aria-hidden />
                </button>
              </Tip>
            </div>
          </div>
        </section>

        {/* Зазор «Статистика» → строка поиска = 12px (просьба 20.09,
            выверено): mt-1.5 (6px) + pt-1.5 (6px) внутри секции — сумма та
            же, что была у mt-3, визуально идентично (фон секции совпадает
            с фоном страницы). Зачем pt: фидбек 20.09 (раунд-8) — в
            прилипшем состоянии верхняя рамка строки обрезалась краем окна
            (строка прилипала вплотную к top-0). Теперь строка стоит на 6px
            ниже верха секции — рамка видна целиком, а зазор при скролле
            закрывается фоном секции, контент под ним не виден.
            Фидбек 21.09: вся механика «отклеивания» строки при открытой
            клавиатуре (top = visualViewport.offsetTop, компенсирующие
            прокрутки, распорщик) УДАЛЕНА — работала нестабильно. Секция
            снова ведёт себя как обычный sticky top-0: при скролле без
            клавиатуры прилипает к верху, с клавиатурой — нативное
            поведение браузера, без наших вмешательств */}
        <section
          aria-label="Поиск"
          className="sticky top-0 z-30 -mx-4 mt-1.5 bg-[#141c2b]/95 px-4 pt-1.5 backdrop-blur-md sm:-mx-6 sm:px-6"
        >
          <div
            ref={searchRootRef}
            className="relative flex w-full items-center gap-1.5 rounded-md border border-[#2f3d59] bg-[#1d2739] px-2.5 py-1.5 focus-within:border-[#a68b5c]"
          >
            {/* чипы и поле заворачиваются внутри левого контейнера — селектор параметра
                справа остаётся на месте и не перескакивает на новую строку */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {PARAM_KEYS.flatMap((p) =>
                sel[p].map((v) => (
                  // без тултипа (просьба 20.09): смысл крестика очевиден и так,
                  // подсказка только мешала; для скринридеров — aria-label
                  <button
                    key={`${p}:${v}`}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeSel(p, v)}
                    aria-label={`${SEARCH_PARAMS[p]} — убрать фильтр`}
                    className="flex max-w-40 shrink-0 items-center gap-1 rounded bg-[#24304a] px-1.5 py-0.5 text-[11.5px] text-[#e8e2d5] transition-colors hover:bg-[#2f3d59]"
                  >
                    <span className="truncate">{v}</span>
                    <X className="h-3 w-3 shrink-0 text-[#9aa5b8]" aria-hidden />
                  </button>
                )),
              )}
              {/* Тултип строки поиска (просьба 21.09): подсказка про горячие
                  клавиши чипов. Триггер — ОБЁРТКА над полем, а не само поле:
                  Radix открывает тултип и по фокусу триггера, а фокус получает
                  именно input (по тапу, клику, «/», Ctrl+K) — тултип не должен
                  всплывать при каждом фокусе, только при наведении курсором.
                  Классы flex-1/min-w-24 переехали на обёртку — поле внутри
                  занимает её всю ширину, раскладка с чипами не изменилась */}
              <Tip
                side="bottom"
                label={
                  <>
                    Если в строке поиска нет текста:
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
                    // см. useFinePointer: false (coarse) → «Поиск», null/true
                    // (SSR и fine) → длинный вариант; pre-paint скрипт в
                    // layout.tsx ставит «Поиск» на таче до первой отрисовки,
                    // suppressHydrationWarning гасит расхождение DOM/vdom
                    // (React атрибут при гидрации не перезаписывает, а при
                    // смене значения эффектом мобильный вариант совпадает
                    // с уже стоящим в DOM)
                    suppressHydrationWarning
                    placeholder={hasChips ? "" : finePtr === false ? "Поиск" : "Поиск: Ctrl+K или /"}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      // любой реальный ввод заново открывает панель
                      // вариантов (баг-репорт 20.09: после Esc она не
                      // открывалась до снятия/возврата фокуса). Программные
                      // setQuery("") события не порождают — панель не
                      // мигает после выбора варианта мышью/Enter
                      setOptsOpen(true);
                    }}
                    onClick={() => {
                      // клик по УЖЕ сфокусированному полю тоже открывает
                      // панель: после Esc фокус остаётся в поле, onFocus
                      // не сработает (баг-репорт 20.09) — открываем сами
                      setOptsOpen(true);
                    }}
                    onKeyDown={(e) => {
                      // Esc в поле поиска: гасим нативное WebKit/Chrome
                      // очищение type=search (по Esc браузер стирает текст)
                      // — у нас Esc значит «закрыть панель вариантов» (это
                      // делает документ-обработчик ниже), текст сохраняется.
                      // Без preventDefault нативная очистка породила бы
                      // input-событие → onChange → setOptsOpen(true), и
                      // панель открывалась бы тут же снова — Esc с текстом
                      // перестал бы её закрывать
                      if (e.key === "Escape") {
                        e.preventDefault();
                        return;
                      }
                      // Горячие клавиши чипов (просьба 20.09): строго в активной
                      // строке поиска и только когда поле ПУСТО — с текстом
                      // Ctrl+Backspace/Delete продолжают удалять слово, как в
                      // системе. Пустое поле — этим клавишам в самом поле удалять
                      // нечего, перехватываем для чипов: Ctrl+Backspace — стереть
                      // последний (самый правый) чип, Ctrl+Delete — все чипы.
                      // ⌘ на Mac поддерживаем так же, как у Ctrl+K выше.
                      if (!e.altKey && (e.ctrlKey || e.metaKey) && !e.currentTarget.value) {
                        if (e.key === "Backspace" || e.key === "Delete") {
                          e.preventDefault();
                          if (e.key === "Delete") {
                            setSel({ ...EMPTY_SEL });
                          } else {
                            // самый правый чип: чипы рендерятся в порядке
                            // PARAM_KEYS — берём последний непустой параметр,
                            // в нём последний выбранный вариант
                            setSel((s) => {
                              for (let i = PARAM_KEYS.length - 1; i >= 0; i--) {
                                const p = PARAM_KEYS[i];
                                if (s[p].length > 0) return { ...s, [p]: s[p].slice(0, -1) };
                              }
                              return s;
                            });
                          }
                          return;
                        }
                      }
                      // Enter во время набора — выбрать ближайший (самый верхний)
                      // вариант списка и стереть набранный текст (просьба 20.09).
                      // Верхний — первый вариант первой непустой секции в режиме
                      // «Все» (порядок секций = порядок меню параметра) или первый
                      // вариант текущего параметра; уже выбранный не дублируем.
                      // Если под фильтр ничего не попало — оставляем текст как есть.
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
                      setQuery("");
                    }}
                    onFocus={(e) => {
                      // фокус не должен всплывать до обёртки-триггера тултипа:
                      // Radix открывает тултип и по focus (focusin всплывает),
                      // а тултип поиска — только по наведению (просьба 21.09);
                      // нашу логику (открытие панели вариантов) это не трогает
                      e.stopPropagation();
                      setOptsOpen(true);
                    }}
                    onBlur={(e) => {
                      // симметрично: blur тоже всплывает до триггера
                      e.stopPropagation();
                    }}
                    className="w-full bg-transparent text-[13.5px] text-[#e8e2d5] outline-none placeholder:text-[#6b7893] [&::-webkit-search-cancel-button]:hidden"
                  />
                </span>
              </Tip>
              {/* Pre-paint скрипт плейсхолдера (фидбек 21.09: на мобильном
                  фоновый текст менялся с задержкой, после загрузки).
                  ВАЖНО: скрипт стоит СРАЗУ ЗА полем, а не в конце body —
                  dev-сервер стримит HTML по частям, и поле может прийти
                  чанком раньше body-скрипта, успев отрисоваться с длинным
                  текстом (замер e2e это поймал). Здесь скрипт в одном
                  чанке с полем: на coarse-устройствах placeholder
                  переписывается на «Поиск» ещё ДО первой отрисовки поля.
                  Выполняется при разборе HTML — до гидрации (бандлы React
                  отложены до конца парсинга); suppressHydrationWarning на
                  поле гасит расхождение DOM/vdom, а useFinePointer после
                  монтирования приходит к тому же значению — атрибут больше
                  не меняется. Десктоп скрипт не трогает: длинный вариант
                  с первого кадра. Скрипт-элемент ничего не рендерит и на
                  раскладку не влияет */}
              <script
                dangerouslySetInnerHTML={{
                  __html:
                    'try{if(matchMedia("(pointer: coarse)").matches){var i=document.querySelector(\'input[type="search"]\');if(i)i.setAttribute("placeholder","Поиск")}}catch(e){}',
                }}
              />
            </div>
            <DropdownMenu open={paramOpen} onOpenChange={setParamOpen} modal={false}>
                <Tip label="Параметр поиска">
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerDownCapture={(e) => {
                      // тач/перо не доходит до Radix — иначе прокрутка пальцем с
                      // кнопки открывает меню; см. комментарий у paramPtrRef
                      paramPtrRef.current = e.pointerType;
                      if (e.pointerType !== "mouse") e.stopPropagation();
                    }}
                    onKeyDown={() => {
                      paramPtrRef.current = "";
                    }}
                    onClick={() => {
                      if (paramPtrRef.current !== "touch" && paramPtrRef.current !== "pen") return;
                      paramPtrRef.current = "";
                      setParamOpen((o) => !o);
                    }}
                    aria-label="Параметр поиска"
                    className="flex shrink-0 items-center gap-1 border-l border-[#2f3d59] pl-2.5 text-[12px] whitespace-nowrap text-[#9aa5b8] transition-colors hover:text-[#e8e2d5]"
                  >
                    {SEARCH_PARAMS[searchParam]}
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                </Tip>
                <DropdownMenuContent align="end" className="border-[#2f3d59] bg-[#1d2739] text-[#e8e2d5]">
                  {(Object.keys(SEARCH_PARAMS) as SearchParam[]).map((p) => (
                    <DropdownMenuItem
                      key={p}
                      onSelect={() => {
                        setSearchParam(p);
                        setOptsOpen(true);
                      }}
                      className="gap-2 text-[13px] focus:bg-[#24304a] focus:text-[#e8e2d5]"
                    >
                      <span className="flex-1">{SEARCH_PARAMS[p]}</span>
                      {p === searchParam && <Check className="h-4 w-4 text-[#d3bc8e]" aria-hidden />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {optsOpen && (
                <div
                  ref={optsPanelRef}
                  className="absolute top-full right-0 left-0 z-50 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-[#2f3d59] bg-[#1d2739] p-1 shadow-xl shadow-black/40"
                >
                  {/* Шапка панели: выравнивание не зависит от шрифтового fallback
                      (кириллицы в Geist нет — на десктопе и телефоне метрики разные,
                      из-за этого подпись стояла по-разному): у подписи, чипа и
                      переключателя leading-none — центры совпадают на любой
                      платформе; вертикальный паддинг симметричный. */}
                  <div className="flex items-center justify-between gap-2 px-2.5 pt-1.5 pb-1.5">
                    {selCount > 0 ? (
                      /* «Выбрано:» — просто текст, «N ✕» — чип (просьба 20.09,
                         уточнение раунда-5): подпись не интерактивна, клик
                         снимает весь выбор только у чипа; в режиме «Все»
                         считает и снимает выбор по всем параметрам сразу */
                      <span className="flex min-w-0 shrink-0 items-center gap-1.5">
                        <span className="text-[11.5px] leading-none whitespace-nowrap text-[#9aa5b8]">
                          Выбрано:
                        </span>
                        <Tip label="Убрать все выбранные варианты">
                          <button
                            type="button"
                            onClick={() =>
                              setSel((s) =>
                                searchParam === "all" ? { ...EMPTY_SEL } : { ...s, [searchParam]: [] },
                              )
                            }
                            aria-label="Убрать всё"
                            className="flex shrink-0 items-center gap-1 rounded bg-[#24304a] px-1.5 py-1 text-[11.5px] leading-none text-[#e8e2d5] transition-colors hover:bg-[#2f3d59]"
                          >
                            {selCount}
                            <X className="h-3 w-3 shrink-0 text-[#9aa5b8]" aria-hidden />
                          </button>
                        </Tip>
                      </span>
                    ) : (
                      <span className="min-w-0 text-[10.5px] leading-none tracking-wider whitespace-nowrap text-[#6b7893] uppercase">
                        {searchParam === "all" ? "Персонажи" : SEARCH_PARAMS[searchParam]} · мультивыбор
                      </span>
                    )}
                    <span
                      role="group"
                      aria-label="Режим выбора вариантов"
                      className="flex shrink-0 overflow-hidden rounded border border-[#4a5878] text-[10px] font-semibold leading-none"
                    >
                      <Tip label="Есть хотя бы один выбранный вариант">
                        <button
                          type="button"
                          onClick={() => setSelMode((m) => (m === "or" ? "and" : "or"))}
                          aria-pressed={selMode === "or"}
                          className={
                            selMode === "or"
                              ? "bg-[#d3bc8e] px-1.5 py-1 text-[#1c2333]"
                              : "px-1.5 py-1 text-[#9aa5b8] transition-colors hover:bg-[#24304a] hover:text-[#e8e2d5]"
                          }
                        >
                          Любое
                        </button>
                      </Tip>
                      <Tip label="Есть все выбранные варианты одновременно">
                        <button
                          type="button"
                          onClick={() => setSelMode((m) => (m === "or" ? "and" : "or"))}
                          aria-pressed={selMode === "and"}
                          className={
                            selMode === "and"
                              ? "bg-[#d3bc8e] px-1.5 py-1 text-[#1c2333]"
                              : "px-1.5 py-1 text-[#9aa5b8] transition-colors hover:bg-[#24304a] hover:text-[#e8e2d5]"
                          }
                        >
                          Только
                        </button>
                      </Tip>
                    </span>
                  </div>
                  {searchParam === "all" ? (
                    <>
                      {PARAM_KEYS.map((p, i) => {
                        const opts = optionsByParam[p];
                        if (opts.length === 0) return null;
                        return (
                          <Fragment key={p}>
                            {/* первая секция (персонажи) подписана шапкой панели
                                выше («Персонажи · мультивыбор») — линейка только у
                                следующих: заметный отступ сверху, название секции
                                и тонкая полоса до правого края, по центру текста */}
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
          {/* линия-разделитель под строкой поиска — по ширине контента: раньше
              border-b висел на самой секции и из-за -mx-4/-mx-6 был шире строки
              поиска и сетки карточек; теперь совпадает с ними (просьба 20.09).
              h-2.5 сохраняет прежние 10px до линии, общая высота секции та же */}
          <div className="h-2.5 border-b border-[#2f3d59]/70" />
        </section>

        <p className="mt-3 text-[12.5px] text-[#9aa5b8]" aria-live="polite">
          Показано команд: {visible.length} из {teams.length}
          {data.slots_total > teams.length && ` (слотов в сетке: ${data.slots_total})`}
        </p>

        <main>
          {visible.length > 0 ? (
            <>
              {/* Оба списка всегда в DOM: статический HTML (начальное состояние —
                  «cards») содержит оба варианта; pre-paint скрипт layout.tsx + CSS
                  (globals.css, html[data-flash-view]) при сохранённом компактном
                  виде показывают строки ещё до гидрации — в первом же кадре, как
                  и карточки (раньше строки ждали загрузки JS и появлениялись
                  с заметной задержкой на фоне моментальных карточек) */}
              <div
                data-view-cards
                className={
                  view === "cards"
                    ? "mt-2 grid grid-cols-[repeat(auto-fill,minmax(min(420px,100%),1fr))] gap-4"
                    : "hidden"
                }
              >
                {visible.map((t) => (
                  <TeamCard key={t.slot} team={t} />
                ))}
              </div>
              <div
                data-view-rows
                className={view === "rows" ? "mt-2 flex flex-col gap-1.5" : "hidden"}
              >
                {visible.map((t) => {
                  const open = openSlot === t.slot;
                  return (
                    <Fragment key={t.slot}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenSlot(open ? null : t.slot);
                          cancelTip();
                        }}
                        aria-expanded={open}
                        className={
                          "team-row flex w-full items-center gap-3 rounded-lg border px-3.5 py-2 text-left transition-colors " +
                          (open
                            ? "border-[#a68b5c] bg-[#24304a]"
                            : "border-[#2f3d59] bg-[#1d2739] hover:border-[#a68b5c] hover:bg-[#24304a]")
                        }
                      >
                        {/* ширина зоны наведения = ширине текста: тултип появляется только
                            над самим названием, а не над всей свободной шириной строки.
                            Внешний спан — flex-контейнер: вложенный текст НЕ участвует в
                            базово-линейной игре со строчным боксом кнопки (иначе бокс
                            названия раздувался до 26px и текст висел на ~3px выше центра
                            строки, при том что DPS/слот/шеврон стояли ровно по центру).
                            Флекс-айтем центрируется точно; размер шрифта здесь же —
                            иначе контейнер наследовал бы базовые 16px/24px */}
                        <span className="flex min-w-0 flex-1 items-center text-[13.5px]">
                          <span
                            onMouseEnter={(e) => startTip(e, t)}
                            onMouseLeave={cancelTip}
                            className="max-w-full truncate text-[#e8e2d5]"
                          >
                            {teamDisplayName(t) || "—"}
                          </span>
                        </span>
                        <span
                          onMouseEnter={(e) => startTip(e, t)}
                          onMouseLeave={cancelTip}
                          className="shrink-0 text-[13px] tabular-nums text-[#d3bc8e]"
                        >
                          {fmtInt(t.dps)}
                        </span>
                        {/* десктоп: бейдж слота (на мобильных строка остаётся минимальной) */}
                        <span className="hidden shrink-0 rounded bg-[#24304a] px-1.5 py-0.5 text-[11px] whitespace-nowrap text-[#9aa5b8] tabular-nums sm:inline-block">
                          {t.slot}
                        </span>
                        <ChevronDown
                          className={
                            "h-4 w-4 shrink-0 text-[#9aa5b8] transition-transform duration-200 " +
                            (open ? "rotate-180" : "")
                          }
                          aria-hidden
                        />
                      </button>
                      {open && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                          {/* highlight: раскрытая карточка сразу с золотой рамкой
                              (раньше — только при наведении, сам hover убран) */}
                          <TeamCard team={t} highlight />
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-[#2f3d59] bg-[#1d2739] p-10 text-center text-[15px] text-[#9aa5b8]">
              Ничего не найдено
            </p>
          )}
        </main>

        {/* компактный вид: состав команды при наведении на название или DPS дольше 1с */}
        {hoverTip && (
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 w-80 max-w-[calc(100vw-16px)] rounded-lg border border-[#2f3d59] bg-[#1d2739] p-2.5 shadow-md shadow-black/25"
            style={{ top: hoverTip.top, left: hoverTip.left }}
          >
            {sortedCharacters(hoverTip.team).map((c, i) => {
              const color = CHAR_COLORS[i % CHAR_COLORS.length];
              const share = charDamageShare(hoverTip.team, c);
              const { cons, base } = splitCons(c.name);
              const gear = [c.weapon, c.artifact_set, c.er_requirement]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={c.name} className="border-t border-black/25 py-1.5 first:border-t-0">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold leading-none text-[#e8e2d5]">
                      {cons && <span className="text-[#d3bc8e]">{cons} </span>}
                      {base}
                    </span>
                    <span className="shrink-0 font-semibold text-[#e8e2d5] tabular-nums">
                      {fmtInt(c.damage)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 pl-4 text-[10.5px] text-[#9aa5b8]">
                    <span className="min-w-0 truncate">{gear || "—"}</span>
                    <span className="shrink-0 tabular-nums">
                      {share.toFixed(1)}% · {fmt1(c.field_time_s)}с
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Tip label="Наверх, к статистике">
        <button
          ref={topBtnRef}
          type="button"
          data-show="false"
          // пока открыто любое меню — кнопка прячем (CSS: не перекрывает
          // панель вариантов поиска при открытой мобильной клавиатуре)
          data-menu-open={optsOpen || sortOpen || paramOpen ? "true" : "false"}
          aria-hidden="true"
          tabIndex={-1}
          onClick={scrollToStats}
          aria-label="Наверх, к статистике"
          className="pointer-events-none fixed right-5 bottom-5 z-40 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full border border-[#a68b5c] bg-[#1d2739] text-[#d3bc8e] opacity-0 shadow-lg shadow-black/40 transition-all duration-200 hover:bg-[#24304a] data-[show=true]:pointer-events-auto data-[show=true]:translate-y-0 data-[show=true]:opacity-100"
        >
          <ArrowUp className="h-5 w-5" aria-hidden />
        </button>
      </Tip>

      <footer className="mt-auto border-t border-[#2f3d59] bg-[#101724] py-4 text-center text-[11.5px] text-[#9aa5b8]">
        Данные: формат showcase-simple/1 · парсинг в браузере · страница совместима со
        статическим хостингом (GitHub Pages)
        {process.env.NODE_ENV === "development" && (
          <>
            <br />
            <a
              href="/showcase-site-source.zip"
              download
              className="mt-1 inline-block rounded-md border border-[#2f3d59] bg-[#1d2739] px-3 py-1.5 text-[12px] text-[#d3bc8e] hover:border-[#d3bc8e]"
            >
              ⬇ Скачать исходники сайта (showcase-site-source.zip)
            </a>
          </>
        )}
      </footer>
    </div>
  );
}
