"use client";

import { useEffect, useRef, type RefObject } from "react";

export type ScrollFrame = {
  /** 0 when the element's top reaches the viewport top, 1 when its bottom does. */
  progress: number;
  /** Pixels scrolled past the element's top, clamped to its scrollable length. */
  offset: number;
  /** Scrollable length of the element: its height minus the viewport. */
  length: number;
  viewport: number;
};

/**
 * Calls `onFrame` at most once per animation frame while the page scrolls or
 * resizes, with the position of a tall (usually sticky) element.
 * `start` shifts the origin, in viewports: -1 starts as soon as the element
 * enters from the bottom of the screen. `scrollerRef` measures against a
 * scrolling element instead of the window.
 */
export function useScrollProgress<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onFrame: (frame: ScrollFrame) => void,
  start = 0,
  scrollerRef?: RefObject<HTMLElement | null>,
) {
  const callbackRef = useRef(onFrame);

  useEffect(() => {
    callbackRef.current = onFrame;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const scroller = scrollerRef?.current ?? null;
    const target: HTMLElement | Window = scroller ?? window;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const bounds = element.getBoundingClientRect();
      const viewport = scroller ? scroller.clientHeight : window.innerHeight;
      const top =
        bounds.top - (scroller ? scroller.getBoundingClientRect().top : 0);
      const length = Math.max(1, bounds.height - viewport - start * viewport);
      const offset = Math.min(length, Math.max(0, -top - start * viewport));
      callbackRef.current({
        progress: offset / length,
        offset,
        length,
        viewport,
      });
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ref, start, scrollerRef]);
}
