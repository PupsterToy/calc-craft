"use client";

import type { CSSProperties } from "react";
import { ELEMENT_PATHS } from "@/lib/showcase/element-paths";
import { ELEMENTS, type ElementKey } from "@/lib/showcase/elements";
import { lookupCharacter } from "@/lib/showcase/character-db";
import type { CharacterRow } from "@/lib/showcase/types";

interface GlyphProps {
  className?: string;
  style?: CSSProperties;
}

const SHOW_RARITY_DIGIT = false;

export function ElementIcon({
  element,
  className,
  style,
  mono = false,
  label,
}: GlyphProps & { element: ElementKey; mono?: boolean; label?: string }) {
  const real = ELEMENT_PATHS[element as keyof typeof ELEMENT_PATHS];
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={real.d} fill={mono ? "currentColor" : real.fill} />
    </svg>
  );
}

export function RarityStar({ className, style, filled = false }: GlyphProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none" aria-hidden>
      <path
        d="M12 3a9 9 0 0 0 9 9 9 9 0 0 0-9 9 9 9 0 0 0-9-9 9 9 0 0 0 9-9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

export function CharacterTags({
  c,
  className,
  compact = false,
  forceEl,
  forceRar,
}: {
  c: CharacterRow;
  className?: string;
  compact?: boolean;
  forceEl?: boolean;
  forceRar?: boolean;
}) {
  const db = lookupCharacter(c.name);
  const elKey = (c.element ?? db?.element ?? null) as ElementKey | null;
  const rar = c.rarity ?? db?.rarity ?? undefined;
  const el = elKey != null ? ELEMENTS[elKey] : undefined;
  if (!el && !rar) return null;
  const halves = el && rar ? "el-rar" : el ? "el" : "rar";
  const forced = forceEl != null || forceRar != null;
  const elVisible = !!el && forceEl !== false;
  const rarVisible = !!rar && forceRar !== false;
  const tailVisible = elVisible || rarVisible;
  return (
    <span
      data-halves={halves}
      style={forced ? { display: tailVisible ? "flex" : "none" } : undefined}
      className={
        "ct-tail flex shrink-0 items-center gap-1 leading-none " +
        (compact ? "text-[12.5px]" : "text-[13px]") +
        (className ? " " + className : "")
      }
    >
      <span
        aria-hidden
        className={
          compact
            ? "h-[0.12em] w-[0.12em] shrink-0 rounded-full bg-[#6b7893] -translate-y-[0.07em]"
            : "h-[0.12em] w-[0.12em] shrink-0 rounded-full bg-[#6b7893] -translate-y-[0.02em]"
        }
      />
      {el && (
        <ElementIcon
          element={elKey as ElementKey}
          label={el.label}
          style={forced ? { display: elVisible ? "inline-block" : "none" } : undefined}
          className={
            "ct-el " +
            (compact
              ? "h-[1em] w-[1em] -translate-y-[0.05em]"
              : "h-[1em] w-[1em] -translate-y-[0.02em]")
          }
        />
      )}
      {rar && (
        <span
          role="img"
          aria-label={`${rar} звёзд`}
          style={forced ? { display: rarVisible ? "flex" : "none" } : undefined}
          className={
            "ct-rar flex items-center gap-0.5 " +
            (rar === 4 ? "text-[#bc86ff]" : "text-[#d3bc8e]")
          }
        >
          {SHOW_RARITY_DIGIT && (
            <span
              className={(compact ? "text-[11px]" : "text-[11.5px]") + " font-semibold leading-none"}
            >
              {rar}
            </span>
          )}
          <RarityStar
            className={
              compact
                ? "h-[1em] w-[1em] -translate-y-[0.05em]"
                : "h-[1em] w-[1em] -translate-y-[0.02em]"
            }
          />
        </span>
      )}
    </span>
  );
}
