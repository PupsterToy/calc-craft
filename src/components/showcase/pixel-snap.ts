import { useEffect, useLayoutEffect, type RefObject } from "react";

const snapped = new WeakMap<HTMLElement, string[]>();

function hostOffset(el: HTMLElement, axis: "x" | "y") {
  const host = el.parentElement;
  if (!host) return 0;
  const hr = host.getBoundingClientRect();
  const hcs = getComputedStyle(host);
  const pad = axis === "x"
    ? host.clientLeft + (parseFloat(hcs.paddingLeft) || 0)
    : host.clientTop + (parseFloat(hcs.paddingTop) || 0);
  return (axis === "x" ? el.getBoundingClientRect().x - hr.x
                        : el.getBoundingClientRect().y - hr.y) - pad;
}

function snapPanel(el: HTMLElement) {
  const anims = el.getAnimations();
  const young =
    anims.length > 0 &&
    anims.every((a) => {
      const t = a.currentTime;
      return typeof t === "number" && t <= 48;
    });
  if (anims.length > 0 && !young) return;
  const inFlight = el.getAnimations({ subtree: true }).some(
    (a) =>
      !anims.includes(a) &&
      a instanceof CSSTransition &&
      a.transitionProperty
        .split(",")
        .map((p) => p.trim())
        .some(
          (p) =>
            p === "height" ||
            p === "width" ||
            p === "grid-template-rows" ||
            p === "grid-template-columns",
        ) &&
      (a.playState === "running" || (a.playState as string) === "pending"),
  );
  if (inFlight) {
    const prev = snapped.get(el);
    if (prev) {
      for (const prop of prev) el.style.setProperty(prop, "");
      snapped.delete(el);
    }
    return;
  }
  const hadAnimation = el.style.animation;
  if (young) el.style.animation = "none";
  const hadTransition = el.style.transition;
  el.style.transition = "none";
  try {
    const prev = snapped.get(el);
    if (prev) {
      for (const prop of prev) el.style.setProperty(prop, "");
      snapped.delete(el);
    }
    const r = el.getBoundingClientRect();
    const dx = Math.round(r.x) - r.x;
    const dy = Math.round(r.y) - r.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    const cs = getComputedStyle(el);
    const set: string[] = [];
    const pin = (prop: string, base: number, delta: number) => {
      el.style.setProperty(prop, `${base + delta}px`);
      set.push(prop);
    };
    if (cs.left !== "auto" && cs.right !== "auto") {
      pin("left", parseFloat(cs.left), dx);
      pin("right", parseFloat(cs.right), -dx);
    } else if (cs.left !== "auto") pin("left", parseFloat(cs.left), dx);
    else if (cs.right !== "auto") pin("right", parseFloat(cs.right), -dx);
    else pin("margin-left", hostOffset(el, "x"), dx);
    if (cs.top !== "auto" && cs.bottom !== "auto") {
      pin("top", parseFloat(cs.top), dy);
      pin("bottom", parseFloat(cs.bottom), -dy);
    } else if (cs.top !== "auto") pin("top", parseFloat(cs.top), dy);
    else if (cs.bottom !== "auto") pin("bottom", parseFloat(cs.bottom), -dy);
    else pin("margin-top", hostOffset(el, "y"), dy);
    snapped.set(el, set);
    void el.getBoundingClientRect();
  } finally {
    el.style.transition = hadTransition;
    if (young) el.style.animation = hadAnimation;
  }
}

export function usePixelSnap(
  ref: RefObject<HTMLElement | null>,
  active = true,
) {
  useLayoutEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (el) snapPanel(el);
  });

  useLayoutEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const onResize = () => {
      if (el.isConnected) snapPanel(el);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    if (el.offsetParent) ro.observe(el.offsetParent);
    else ro.observe(document.documentElement);
    el.addEventListener("animationend", onResize);
    el.addEventListener("transitionend", onResize);
    return () => {
      ro.disconnect();
      el.removeEventListener("animationend", onResize);
      el.removeEventListener("transitionend", onResize);
    };
  }, [active, ref]);
}

export function useScrollSnap(
  ref: RefObject<HTMLElement | null>,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    const snap = () => {
      if (!el.isConnected) return;
      const top = Math.round(el.scrollTop);
      if (top !== el.scrollTop) el.scrollTop = top;
      const left = Math.round(el.scrollLeft);
      if (left !== el.scrollLeft) el.scrollLeft = left;
    };
    const onQuiet = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(snap, 150);
    };
    el.addEventListener("scroll", onQuiet, { passive: true });
    el.addEventListener("scrollend", snap);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("scroll", onQuiet);
      el.removeEventListener("scrollend", snap);
    };
  }, [active, ref]);
}
