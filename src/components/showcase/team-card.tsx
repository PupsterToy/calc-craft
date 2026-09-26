"use client";

import { memo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fmt1, fmtInt, parseSlot, splitCons } from "@/lib/showcase/format";
import {
  CHAR_COLORS,
  charDamageShare,
  sortedCharacters,
  teamDisplayName,
} from "@/lib/showcase/display";
import type { TeamBlock } from "@/lib/showcase/types";

interface TeamCardProps {
  team: TeamBlock;
  /** Компактный вид: карточка раскрыта под строкой — золотая рамка сразу,
   *  как раньше давал только hover (сам hover у раскрытой карточки убран) */
  highlight?: boolean;
}

// memo: карточка перерисовывается только при смене команды (team — стабильная ссылка из данных),
// а не при каждом вводе в поиск / смене сортировки
export const TeamCard = memo(function TeamCard({ team, highlight }: TeamCardProps) {
  const slot = parseSlot(team.slot);
  const slotTip = slot
    ? `Ряд ${slot.row}, колонка ${slot.col}.` + (team.range ? ` Диапазон ${team.range}.` : "")
    : "—";
  // Персонажи всегда по убыванию урона — независимо от порядка строк в исходном листе.
  // sortedCharacters кэшируется в WeakMap: сортировка выполняется один раз на команду.
  const chars = sortedCharacters(team);
  // название — в том же порядке по урону, если внутри карточки пришлось переставлять
  const displayName = teamDisplayName(team);

  return (
    <article
      className={
        "flex flex-col overflow-hidden rounded-xl border bg-gradient-to-b from-[#24304a] to-[#1d2739] p-4 sm:p-5 " +
        (highlight
          ? "border-[#a68b5c]"
          : "border-[#2f3d59] transition-colors hover:border-[#a68b5c]")
      }
      aria-label={`Команда ${displayName || "без названия"}`}
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-[15px] leading-snug font-semibold text-[#d3bc8e] sm:text-base">
          {displayName || "—"}
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <span
                tabIndex={0}
                role="button"
                aria-label={`Слот ${team.slot}: подробности`}
                className="cursor-pointer rounded-md border border-[#2f3d59] px-2 py-1 text-[11px] whitespace-nowrap text-[#9aa5b8] transition-colors hover:border-[#a68b5c] hover:text-[#e8e2d5]"
              >
                слот {team.slot}
              </span>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              className="max-w-64 border-[#2f3d59] bg-[#1d2739] p-3 text-left text-xs leading-relaxed text-[#e8e2d5]"
            >
              {slotTip}
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <div className="mb-2.5 flex flex-wrap gap-1.5 text-[12.5px] text-[#9aa5b8]">
        <span className="rounded-lg border border-[#2f3d59] bg-black/25 px-2.5 py-1">
          DPS <b className="font-semibold text-[#e8e2d5] tabular-nums">{fmtInt(team.dps)}</b>
        </span>
        <span className="rounded-lg border border-[#2f3d59] bg-black/25 px-2.5 py-1">
          DPR <b className="font-semibold text-[#e8e2d5] tabular-nums">{fmtInt(team.total_dpr)}</b>
        </span>
        <span className="rounded-lg border border-[#2f3d59] bg-black/25 px-2.5 py-1">
          Ротация <b className="font-semibold text-[#e8e2d5] tabular-nums">{fmt1(team.rotation_time_s)}с</b>
        </span>
      </div>

      {/* общая шкала долей урона: та же функция, что и у полосок персонажей
          (charDamageShare) — работает и для таблиц без колонки процентов */}
      <div className="mb-2.5 flex h-2 overflow-hidden rounded-full bg-black/30" aria-hidden>
        {chars.map((c, i) => (
          <div
            key={c.name}
            style={{
              width: `${charDamageShare(team, c).toFixed(2)}%`,
              background: CHAR_COLORS[i % CHAR_COLORS.length],
            }}
          />
        ))}
      </div>

      {/* subgrid: колонка чисел справа — единой ширины на всю карточку (по самой широкой),
          поэтому полоска под именем персонажа одинаковой ширины у всех */}
      <ul className="mb-1 grid grid-cols-[1fr_max-content] gap-x-3">
        {chars.map((c, i) => {
          const color = CHAR_COLORS[i % CHAR_COLORS.length];
          const share = charDamageShare(team, c);
          const gear = [c.weapon, c.artifact_set, c.er_requirement]
            .filter(Boolean)
            .join(" · ");
          const { cons, base } = splitCons(c.name);
          return (
            /* Одна сетка на ОБЕ колонки, строки общие (фидбек 21.09):
               r1 — имя (auto), r2 — 9px (зазор «имя → шкала», визуальные
               11.75px — эталон T28), r3 — шкала, фиксированные 6px, r4 —
               8px (зазор «шкала → снаряжение», прежний mt-2), r5 — снаряжение.
               Раньше правая колонка ЗЕРКАЛИЛА левую такими же спейсерами
               (13px + mt-[9px] + h-1.5): высоты строк зависят от шрифта, и
               на десктопном фолбэке урон и доля съезжали относительно
               шкалы/снаряжения. Общие строки сетки делают выравнивание
               структурным: урон в r3 центрирован по шкале НА ЛЮБОМ шрифте,
               доля в r5 — строго на уровне снаряжения. Пустые r2/r4 не
               заняты ничем — урон (13px в 6px строке) переполняет её вверх
               и вниз ровно на 2.5px, попадая в пустые зазоры без наложений */
            <li
              key={c.name}
              className={
                "col-span-2 grid grid-cols-subgrid border-t border-black/25 py-2 " +
                "[grid-template-rows:auto_9px_6px_8px_auto]"
              }
            >
              {/* r1: строка имени. Точка — элемент flex-строки с items-center:
                  её центр = центр строки, а строка (leading-none, 13px) —
                  это бокс имени, его высота от шрифта НЕ зависит. Раньше
                  точка была inline с vertical-align:middle + translateY
                  (-0.75px): middle привязан к x-height родительского шрифта,
                  сдвиг подбирался под один шрифт — на десктопе с другим
                  фолбэком точка съезжала (фидбек 21.09: «на десктопе не
                  посередине, на мобильном ровно»). Теперь центр совпадает
                  с центром бокса имени при любом шрифте; созвездие —
                  shrink-0 (не обрезается), имя — единственное, что
                  обрезается многоточием */}
              <div className="col-start-1 row-start-1 flex h-[13px] min-w-0 items-center">
                <span
                  aria-hidden
                  className="mr-2 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                {cons && (
                  <span className="mr-2 shrink-0 text-[11.5px] leading-none text-[#d3bc8e]">{cons}</span>
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-none text-[#e8e2d5]">
                  {base}
                </span>
              </div>
              {/* r3: шкала доли урона персонажа */}
              <div className="col-start-1 row-start-3 h-1.5 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full"
                  style={{ width: `${Math.min(100, share).toFixed(1)}%`, background: color }}
                />
              </div>
              {/* r5: снаряжение (когда нет — ячейки нет, но строка r5
                  существует: правая колонка всегда стоит на своём месте,
                  «прыжков» нет) */}
              {gear && (
                <div className="col-start-1 row-start-5 text-[11px] text-[#9aa5b8]">{gear}</div>
              )}
              {/* r3, правая колонка: урон — ТОТ ЖЕ ряд сетки, что шкала;
                  items-center центрирует бокс числа по центру 6px строки =
                  центру шкалы (фидбек 21.09: «числа урона не по центру
                  шкалы» на десктопе — раньше центрирование зависело от
                  высот соседних строк, зависящих от шрифта).
                  Центр ЧЕРНИЛ цифр может отличаться от центра бокса на
                  ~0.5px (метрики em-бокса: выносные сверху/снизу несим-
                  метричны высоте цифр) — это свойство шрифта, одинаковое
                  на всех платформах с 21.09 (Geist грузится везде, см.
                  layout.tsx font-sans). Подгонка transform/margin НЕ
                  помогает: растр текста квантуется на сетку в 1px и
                  прыгает ЦЕЛЫМ пикселем (замер: translateY(0.5px) и
                  mt-[1px] сдвигали чернила на 1px, а не на 0.5),
                  поэтому оставлено чистое боксовое центрирование —
                  строго посередине на любой платформе по боксу, чернила
                  в пределах полпикселя */}
              <div className="col-start-2 row-start-3 flex items-center justify-end tabular-nums">
                <span className="text-[13px] font-semibold leading-none text-[#e8e2d5]">
                  {fmtInt(c.damage)}
                </span>
              </div>
              {/* r5, правая колонка: доля/время — ТОТ ЖЕ ряд, что снаряжение,
                  и ТОТ ЖЕ интерлиньяж: leading наследуется (1.5), как у
                  снаряжения слева. Раньше здесь было leading-none (11px
                  против 16.5px строки снаряжения): тексты третьей строки
                  стояли на ~2.75px разном уровне на обеих платформах
                  (фидбек 21.09: «третья строка справа не на том же уровне») */}
              <div className="col-start-2 row-start-5 text-right tabular-nums text-[11px] text-[#9aa5b8]">
                {share.toFixed(1)}% · {fmt1(c.field_time_s)}с
              </div>
            </li>
          );
        })}
      </ul>

      {team.rotation && (
        <div className="mt-2 rounded-lg border border-[#2f3d59] bg-black/25 px-3 py-2 text-[12.5px] leading-relaxed text-[#e8e2d5]">
          <span className="mb-1 block text-[10.5px] tracking-wider text-[#d3bc8e] uppercase">
            Ротация · {fmt1(team.rotation_time_s)}с
          </span>
          {team.rotation}
        </div>
      )}

      {team.extra_info && (
        <div className="mt-2 border-t border-dashed border-[#2f3d59] pt-2">
          <p className="text-[11.5px] leading-relaxed whitespace-pre-line text-[#9aa5b8]">
            {team.extra_info}
          </p>
        </div>
      )}

      <footer className="mt-auto flex items-center justify-between pt-2.5 text-[11px] text-[#9aa5b8]">
        <span>{team.author ? `by ${team.author}` : ""}</span>
        <span>{team.date ?? ""}</span>
      </footer>
    </article>
  );
});
