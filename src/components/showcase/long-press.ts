"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

const LP_STATE = Symbol("longPressState");

interface LPState {
  timer: number | null;
  sx: number;
  sy: number;
  fired: boolean;
  off: (() => void) | null;
  wd: (() => void) | null;
}

type LPElement = Element & { [LP_STATE]?: LPState };

export interface LongPressProps {
  onPointerDown: (e: ReactPointerEvent<Element>) => void;
  onPointerMove: (e: ReactPointerEvent<Element>) => void;
  onPointerUp: (e: ReactPointerEvent<Element>) => void;
  onPointerCancel: (e: ReactPointerEvent<Element>) => void;
}

const SLOP_SQ = 8 * 8;
const DELAY = 500;
const SWALLOW_WINDOW = 1000;

const NOOP_PROPS: LongPressProps = {
  onPointerDown: () => {},
  onPointerMove: () => {},
  onPointerUp: () => {},
  onPointerCancel: () => {},
};

export function longPress(action: (() => void) | undefined): LongPressProps {
  if (!action) return NOOP_PROPS;

  const clear = (el: LPElement) => {
    const st = el[LP_STATE];
    if (!st) return;
    if (st.timer !== null) {
      window.clearTimeout(st.timer);
      st.timer = null;
    }
    if (st.wd) {
      st.wd();
      st.wd = null;
    }
  };

  const fire = (el: LPElement) => {
    const st = el[LP_STATE];
    if (!st) return;
    st.timer = null;
    if (st.wd) {
      st.wd();
      st.wd = null;
    }
    st.fired = true;
    action();
    const swallow = (ev: Event) => {
      if (ev.target instanceof Node && el.contains(ev.target)) {
        ev.stopPropagation();
        ev.preventDefault();
      }
      cleanup();
    };
    const onFresh = () => cleanup();
    const cleanup = () => {
      document.removeEventListener("click", swallow, true);
      document.removeEventListener("pointerdown", onFresh, true);
      document.removeEventListener("keydown", onFresh, true);
      document.removeEventListener("pointercancel", onFresh, true);
      if (st.off === cleanup) st.off = null;
    };
    st.off = cleanup;
    document.addEventListener("click", swallow, true);
    document.addEventListener("pointerdown", onFresh, true);
    document.addEventListener("keydown", onFresh, true);
    document.addEventListener("pointercancel", onFresh, true);
  };

  return {
    onPointerDown: (e: ReactPointerEvent<Element>) => {
      if (e.button !== 0 || !e.isPrimary) return;
      const el = e.currentTarget as LPElement;
      el.setPointerCapture?.(e.pointerId);
      const st = (el[LP_STATE] ??= {
        timer: null,
        sx: 0,
        sy: 0,
        fired: false,
        off: null,
        wd: null,
      });
      st.fired = false;
      st.sx = e.clientX;
      st.sy = e.clientY;
      if (st.timer !== null) window.clearTimeout(st.timer);
      if (st.wd) st.wd();
      st.timer = window.setTimeout(() => fire(el), DELAY);
      const onOther = (ev: PointerEvent) => {
        if (ev.pointerId === e.pointerId) return;
        clear(el);
      };
      const wd = () => document.removeEventListener("pointerdown", onOther, true);
      st.wd = wd;
      document.addEventListener("pointerdown", onOther, true);
    },
    onPointerMove: (e: ReactPointerEvent<Element>) => {
      const el = e.currentTarget as LPElement;
      const st = el[LP_STATE];
      if (!st || st.timer === null) return;
      const dx = e.clientX - st.sx;
      const dy = e.clientY - st.sy;
      if (dx * dx + dy * dy > SLOP_SQ) clear(el);
    },
    onPointerUp: (e: ReactPointerEvent<Element>) => {
      const el = e.currentTarget as LPElement;
      const st = el[LP_STATE];
      clear(el);
      if (st && st.fired && st.off) {
        const off = st.off;
        window.setTimeout(off, SWALLOW_WINDOW);
      }
    },
    onPointerCancel: (e: ReactPointerEvent<Element>) => {
      clear(e.currentTarget as LPElement);
    },
  };
}
