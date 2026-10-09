"use client";

import { cloneElement, useEffect, useRef, useState, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

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

export function TipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={300}
      skipDelayDuration={0}
      disableHoverableContent
    >
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tip({
  label,
  children,
  side = "top",
  sideOffset = 6,
  avoidCollisions = true,
}: {
  label: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  avoidCollisions?: boolean;
}) {
  const canHover = useCanHover();
  const [hovered, setHovered] = useState(false);
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
  const trigger = cloneElement(children, {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  } as HTMLAttributes<HTMLElement>);
  return (
    <TooltipPrimitive.Root
      open={canHover && hovered ? auto : false}
      onOpenChange={onOpenChange}
    >
      <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={sideOffset}
          avoidCollisions={avoidCollisions}
          collisionPadding={8}
          className="pointer-events-none z-[130] w-fit max-w-72 rounded-lg border border-[#2f3d59] bg-[#1d2739] px-2.5 py-1.5 text-[11.5px] leading-snug text-[#e8e2d5] shadow-md shadow-black/25 animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
