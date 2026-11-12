import Lenis from "lenis";

// Wheel scrolling glides towards its target instead of jumping notch by
// notch, so the scroll-driven scenes move as continuously as their cameras.
// Touch scrolling stays native, and reduced motion keeps the browser's own.

let page: Lenis | null = null;
// Where a jump started by `scrollPageTo` is heading, until it lands or the
// visitor takes over: Lenis reports its progress, not its destination.
let destination: number | null = null;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Longer jumps take a little longer, without dragging.
const travelDuration = (distance: number) =>
  Math.min(2, 0.9 + (Math.abs(distance) / window.innerHeight) * 0.12);

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
  page = lenis;
  return () => {
    lenis.destroy();
    if (page !== lenis) return;
    page = null;
    destination = null;
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
  if (held) page?.stop();
  else page?.start();
}
