"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/**
 * Пояснение нотации слотов: «R2·C1» = 2-й ряд, 1-я колонка сетки карточек листа.
 * (Пользователь просил явно объяснить эту метку на странице.)
 */
export function SlotLegend({ grid }: { grid: { rows: number; cols: number } }) {
  return (
    <Collapsible defaultOpen className="rounded-xl border border-[#2f3d59] bg-[#1d2739]">
      <CollapsibleTrigger className="w-full cursor-pointer px-4 py-3 text-left text-[13.5px] font-semibold text-[#d3bc8e]">
        Что означает «слот R2·C1» и другие метки на карточках?
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-[#2f3d59] px-4 pt-2 pb-4 text-[13px] leading-relaxed text-[#e8e2d5]">
        <p>
          Лист Showcase в таблице — это сетка карточек-команд{" "}
          <b className="text-[#d3bc8e]">
            {grid.rows} рядов × {grid.cols} колонок
          </b>{" "}
          (шаг сетки: 10 строк и 19 столбцов). Метка{" "}
          <span className="rounded-md border border-[#2f3d59] bg-black/30 px-1.5 py-0.5 text-[11px] text-[#9aa5b8]">
            слот R·C
          </span>{" "}
          в углу карточки показывает её место в этой сетке:
        </p>
        <ul className="mt-2 mb-2 list-disc space-y-1 pl-5">
          <li>
            <b className="text-[#d3bc8e]">R</b> (row) — ряд сетки, от 1 (верхний) вниз;
          </li>
          <li>
            <b className="text-[#d3bc8e]">C</b> (column) — колонка сетки, от 1 (левая) вправо.
          </li>
        </ul>
        <p>
          Пример: «слот R2·C1» — команда расположена во 2-м ряду, 1-й колонке листа
          (якорь — ячейка <b className="text-[#d3bc8e]">J14</b> с заголовком «Team», карточка
          занимает диапазон <b className="text-[#d3bc8e]">B14:S22</b>). Наведите курсор на метку
          слота любой карточки — увидите её якорь и диапазон. Пустые слоты (без персонажей) на
          страницу не выводятся.
        </p>
        <p className="mt-2 text-[12px] text-[#9aa5b8]">
          Страница показывает только «сухие» значения, видимые на листе: формулы, имена
          расчётных листов и гиперссылки не используются. Из xlsx берутся точные числа, из CSV —
          значения в том виде, в каком они отображаются в таблице.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
