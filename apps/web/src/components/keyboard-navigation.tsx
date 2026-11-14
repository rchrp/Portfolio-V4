"use client";

import { useEffect } from "react";
import { pageScrollDestination, scrollPageTo } from "@/lib/smooth-scroll";

// Keys that type or move inside a widget keep their own meaning.
const ownArrowKeys =
  "input, textarea, select, [contenteditable], [role=slider], [role=listbox], [role=menu], [role=tablist], [role=radiogroup]";
// Below this distance, the page already rests on a stop.
const tolerance = 8;

const nextKeys = new Set(["ArrowDown", "ArrowRight"]);
const previousKeys = new Set(["ArrowUp", "ArrowLeft"]);

/**
 * Scroll positions where `element` rests. Each section lists them in
 * `data-nav-stops`: offsets from its top, in viewport heights, so the sticky
 * chapters stop where they are settled rather than at their first pixel.
 */
export function restingPoints(element: HTMLElement) {
  const maximum = document.documentElement.scrollHeight - window.innerHeight;
  const top = element.getBoundingClientRect().top + window.scrollY;
  return (element.dataset.navStops ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((stop) =>
      Math.round(
        Math.min(maximum, Math.max(0, top + Number(stop) * window.innerHeight)),
      ),
    );
}

const stops = () => {
  const positions = Array.from(
    document.querySelectorAll<HTMLElement>("[data-nav-stops]"),
  ).flatMap(restingPoints);
  return [...new Set(positions)].sort((a, b) => a - b);
};

/** Scrolls to the next (1) or previous (-1) resting point of the page. */
export function goToStop(direction: 1 | -1) {
  // Presses made during a jump chain from where it is heading.
  const from = pageScrollDestination();
  const positions = stops();
  const target =
    direction > 0
      ? positions.find((position) => position > from + tolerance)
      : positions.findLast((position) => position < from - tolerance);
  if (target !== undefined) scrollPageTo(target);
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
        // A project's page handles its own keys.
        document.querySelector("dialog[open], [role=dialog]") ||
        (event.target instanceof Element && event.target.closest(ownArrowKeys))
      ) {
        return;
      }
      event.preventDefault();
      // Holding the key would race through every chapter.
      if (!event.repeat) goToStop(direction);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
