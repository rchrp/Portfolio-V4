"use client";

import { useEffect } from "react";

// Keys that type or move inside a widget keep their own meaning.
const ownArrowKeys =
  "input, textarea, select, [contenteditable], [role=slider], [role=listbox], [role=menu], [role=tablist], [role=radiogroup]";
// Below this distance, the page already rests on a stop.
const tolerance = 8;

const nextKeys = new Set(["ArrowDown", "ArrowRight"]);
const previousKeys = new Set(["ArrowUp", "ArrowLeft"]);

// Where a smooth scroll is heading: presses made on the way chain from it.
let pending: number | null = null;
let settle = 0;

const clearPending = () => {
  pending = null;
  window.clearTimeout(settle);
};

// Each section lists its resting points in `data-nav-stops`: offsets from its
// top, in viewport heights, so the sticky chapters stop where they are
// settled rather than at their first pixel.
const stops = () => {
  const maximum = document.documentElement.scrollHeight - window.innerHeight;
  const positions = Array.from(
    document.querySelectorAll<HTMLElement>("[data-nav-stops]"),
  ).flatMap((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY;
    return (element.dataset.navStops ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((stop) =>
        Math.round(
          Math.min(
            maximum,
            Math.max(0, top + Number(stop) * window.innerHeight),
          ),
        ),
      );
  });
  return [...new Set(positions)].sort((a, b) => a - b);
};

/** Scrolls to the next (1) or previous (-1) resting point of the page. */
export function goToStop(direction: 1 | -1) {
  const from = pending ?? window.scrollY;
  const positions = stops();
  const target =
    direction > 0
      ? positions.find((position) => position > from + tolerance)
      : positions.findLast((position) => position < from - tolerance);
  if (target === undefined) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  pending = reduced ? null : target;
  window.clearTimeout(settle);
  // A fallback for browsers without `scrollend`.
  if (pending !== null) settle = window.setTimeout(clearPending, 1500);
  window.scrollTo({ top: target, behavior: reduced ? "auto" : "smooth" });
}

/** The arrow keys jump between the resting points of the page. */
export function KeyboardNavigation() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = nextKeys.has(event.key)
        ? 1
        : previousKeys.has(event.key)
          ? -1
          : 0;
      if (
        direction === 0 ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        // The full-screen showcase handles its own keys.
        document.querySelector("dialog[open]") ||
        (event.target instanceof Element && event.target.closest(ownArrowKeys))
      ) {
        return;
      }
      event.preventDefault();
      // Holding the key would race through every chapter.
      if (!event.repeat) goToStop(direction);
    };

    // Wheel, touch or scrollbar take over from a jump in progress.
    const onManualScroll = () => {
      if (pending !== null) clearPending();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scrollend", clearPending);
    window.addEventListener("wheel", onManualScroll, { passive: true });
    window.addEventListener("touchstart", onManualScroll, { passive: true });
    return () => {
      clearPending();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scrollend", clearPending);
      window.removeEventListener("wheel", onManualScroll);
      window.removeEventListener("touchstart", onManualScroll);
    };
  }, []);

  return null;
}
