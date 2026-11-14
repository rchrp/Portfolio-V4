import Lenis from "lenis";
import Snap from "lenis/snap";

// Wheel scrolling glides towards its target instead of jumping notch by
// notch, so the scroll-driven scenes move as continuously as their cameras.
// Left between two resting points, it settles on the nearest one. Touch
// scrolling stays native, and reduced motion keeps the browser's own.

let page: Lenis | null = null;
let magnet: Snap | null = null;
// Where a jump started by `scrollPageTo` is heading, until it lands or the
// visitor takes over: Lenis reports its progress, not its destination.
let destination: number | null = null;
// Resting points registered with `magnetizeScroll`, and how to remove them
// from the magnet.
const magnetPoints = new Set<number[]>();
let releaseMagnetPoints: (() => void)[] = [];

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Longer jumps take a little longer, without dragging.
const travelDuration = (distance: number) =>
  Math.min(2, 0.9 + (Math.abs(distance) / window.innerHeight) * 0.12);

// The page eases off where the visitor left it, then onto its resting point.
const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

function syncMagnet() {
  for (const release of releaseMagnetPoints) release();
  const current = magnet;
  releaseMagnetPoints = current
    ? [...magnetPoints].flat().map((point) => current.add(point))
    : [];
}

/** Smooths the window's scrolling until the returned function is called. */
export function smoothPageScroll() {
  if (prefersReducedMotion()) return () => {};
  const lenis = new Lenis({
    autoRaf: true,
    // Dialogs scroll on their own (see smoothElementScroll).
    prevent: (node) => node instanceof HTMLDialogElement,
  });
  lenis.on("virtual-scroll", () => {
    destination = null;
  });
  // Within half a screen of a resting point, a pause in the wheel pulls the
  // page onto it.
  const snap = new Snap(lenis, {
    type: "proximity",
    distanceThreshold: "50%",
    debounce: 260,
    duration: 0.9,
    easing: easeInOutCubic,
    onSnapStart: ({ value }) => {
      destination = value;
    },
    onSnapComplete: () => {
      destination = null;
    },
  });
  page = lenis;
  magnet = snap;
  syncMagnet();
  return () => {
    snap.destroy();
    lenis.destroy();
    if (page !== lenis) return;
    page = null;
    magnet = null;
    releaseMagnetPoints = [];
    destination = null;
  };
}

/**
 * Makes the page settle on these scroll positions, in pixels, when the wheel
 * leaves it close to one of them. Returns the function that removes them.
 */
export function magnetizeScroll(points: number[]) {
  magnetPoints.add(points);
  syncMagnet();
  return () => {
    magnetPoints.delete(points);
    syncMagnet();
  };
}

/**
 * Smooths the scrolling of `element`, a scrolling box such as a dialog.
 * Null under reduced motion. Destroy it with the element.
 */
export function smoothElementScroll(element: HTMLElement) {
  if (prefersReducedMotion()) return null;
  return new Lenis({
    wrapper: element,
    content: element,
    autoRaf: true,
    // Its content grows as pictures load: measured on every use.
    naiveDimensions: true,
  });
}

/** Where the page is heading: the end of a jump in progress, else its position. */
export function pageScrollDestination() {
  return destination ?? (page ? page.animatedScroll : window.scrollY);
}

/** Scrolls the page to `top`, gliding there unless `instant`. */
export function scrollPageTo(top: number, instant = false) {
  if (!page) {
    window.scrollTo({
      top,
      behavior: instant || prefersReducedMotion() ? "auto" : "smooth",
    });
    return;
  }
  const lenis = page;
  // Lenis measures the page a moment after it changes: a jump made as a
  // section arrives would stop at the old end of the page.
  lenis.resize();
  destination = instant ? null : Math.min(lenis.limit, Math.max(0, top));
  lenis.scrollTo(top, {
    immediate: instant,
    duration: travelDuration(top - lenis.animatedScroll),
    // Also while the page is held behind a dialog.
    force: true,
    onComplete: () => {
      if (page === lenis) destination = null;
    },
  });
}

/** Holds the page still while something covers it, or releases it. */
export function holdPageScroll(held: boolean) {
  if (held) {
    page?.stop();
    magnet?.stop();
  } else {
    page?.start();
    magnet?.start();
  }
}
