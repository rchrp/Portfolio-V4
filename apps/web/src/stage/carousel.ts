import type { CardDraw } from "./cards-layer";
import type { StageEngine } from "./engine";
import { clamp, clamp01, damp, easeInOutCubic, lerp, smoothstep } from "./math";

// The projects carousel: a column of covers wrapped over a wide drum, slightly
// askew, turned by the page's scroll. The cover in the middle is sharp; those
// above and below bend away, fade into the paper and break up into matrix
// cells. Opening a project flattens its cover and carries it to the place the
// project's page keeps for it.

export type CarouselLayout = {
  /** Centre of the cover in focus. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Which way the covers travel: down a column on wide screens, along a row
   * on narrow ones, where the column would run through the text.
   */
  sideways: boolean;
};

export type Rect = { left: number; top: number; width: number; height: number };

/** Distance between two covers, in cover heights. */
const GAP = 1.13;
/** How far the column leans: horizontal shift per pixel of vertical travel. */
const SLANT = -0.13;
const ROLL = -0.035;
/** Seconds a cover takes to open into its project, and to come back. */
const OPEN_SECONDS = 0.95;
const CLOSE_SECONDS = 0.75;

export class Carousel {
  /** Position in the list: 2.4 is between the third and fourth covers. */
  position = 0;
  private velocity = 0;
  /** 0: in the carousel; 1: the open project's cover. */
  private open = 0;
  private opening = false;
  private openIndex = 0;

  constructor(private sources: string[]) {}

  setSources(sources: string[]) {
    this.sources = sources;
  }

  /** Starts opening the cover at `index`, or closing the open one. */
  setOpen(index: number | null, instant = false) {
    this.opening = index !== null;
    if (index !== null) this.openIndex = index;
    if (instant) this.open = this.opening ? 1 : 0;
  }

  /** Jumps to a position without gliding there. */
  jumpTo(position: number) {
    this.position = position;
    this.velocity = 0;
  }

  get isOpen() {
    return this.open >= 1;
  }

  get isClosed() {
    return this.open <= 0;
  }

  /** Where the cover in focus sits, for a given viewport. */
  static layout(width: number, height: number): CarouselLayout {
    const narrow = width < 832;
    let cardHeight = narrow
      ? Math.min(height * 0.34, (width * 0.88 * 9) / 16)
      : clamp(height * 0.52, 230, 600);
    let cardWidth = (cardHeight * 16) / 9;
    const widest = narrow ? width * 0.88 : width * 0.54;
    if (cardWidth > widest) {
      cardWidth = widest;
      cardHeight = (cardWidth * 9) / 16;
    }
    return {
      x: narrow ? width / 2 : width * 0.645,
      y: narrow ? height * 0.34 : height * 0.5,
      width: cardWidth,
      height: cardHeight,
      sideways: narrow,
    };
  }

  /**
   * Advances towards `target` (the position the scroll asks for) and pushes
   * this frame's covers. `shift` moves the whole column vertically, while
   * the section slides in or out of the screen. `cover` is where the open
   * project wants its cover. Returns whether anything is still moving.
   */
  update(
    stage: StageEngine,
    dt: number,
    target: number,
    shift: number,
    visible: boolean,
    cover: Rect | null,
    viewHeight: number,
  ) {
    const { width, still } = stage;
    // The visible height: on phones the canvas runs under the toolbars.
    const height = viewHeight;
    const previous = this.position;
    this.position = still ? target : damp(this.position, target, 9, dt);
    if (Math.abs(this.position - target) < 0.0004) this.position = target;
    const speed = dt > 0 ? (this.position - previous) / dt : 0;
    this.velocity = still ? 0 : damp(this.velocity, speed, 10, dt);

    const goal = this.opening ? 1 : 0;
    if (this.open !== goal) {
      this.open = still
        ? goal
        : clamp01(
            this.open +
              (this.opening ? dt / OPEN_SECONDS : -dt / CLOSE_SECONDS),
          );
    }
    const opened = easeInOutCubic(this.open);
    const moving =
      this.position !== target ||
      Math.abs(this.velocity) > 0.002 ||
      this.open !== goal;
    if (!visible && this.open === 0) return moving;

    const layout = Carousel.layout(width, height);
    const { sideways } = layout;
    const gap = sideways ? layout.width * 1.07 : layout.height * GAP;
    const rush = Math.min(1, Math.abs(this.velocity) * 0.22);
    const curve =
      (1 / ((sideways ? width : height) * 1.02)) * (1 + rush * 0.35);
    const pivot = layout.y + shift;

    // From the farthest to the nearest, so the cover in focus is drawn last.
    const order = this.sources
      .map((_, index) => index)
      .sort(
        (a, b) => Math.abs(b - this.position) - Math.abs(a - this.position),
      );

    for (const index of order) {
      const offset = index - this.position;
      const distance = Math.abs(offset);
      if (distance > 2.6 && !(index === this.openIndex && opened > 0)) continue;

      const card: CardDraw = {
        src: this.sources[index],
        x: sideways ? layout.x + offset * gap : layout.x + offset * gap * SLANT,
        y: sideways
          ? layout.y + shift + offset * gap * SLANT * 0.4
          : layout.y + shift + offset * gap,
        width: layout.width,
        height: layout.height,
        curveY: sideways ? 0 : curve,
        pivotY: pivot,
        curveX: sideways ? curve : 0,
        pivotX: layout.x,
        roll: sideways ? ROLL * 0.5 : ROLL,
        alpha: 1 - smoothstep(1.45, 2.3, distance),
        pixel: clamp01(smoothstep(0.1, 0.95, distance) + rush * 0.5),
        dim: 0.36 * smoothstep(0.15, 1.3, distance),
        shadow: 1 - smoothstep(0, 0.7, distance),
        radius: 12,
      };

      if (opened > 0) {
        if (index === this.openIndex && cover) {
          card.x = lerp(card.x, cover.left + cover.width / 2, opened);
          card.y = lerp(card.y, cover.top + cover.height / 2, opened);
          card.width = lerp(card.width, cover.width, opened);
          card.height = lerp(card.height, cover.height, opened);
          card.curveY = (card.curveY ?? 0) * (1 - opened);
          card.curveX = (card.curveX ?? 0) * (1 - opened);
          card.roll = (card.roll ?? 0) * (1 - opened);
          card.pixel = (card.pixel ?? 0) * (1 - opened);
          card.dim = (card.dim ?? 0) * (1 - opened);
          card.shadow = lerp(card.shadow ?? 0, 0.55, opened);
          card.radius = lerp(12, 14, opened);
          card.alpha = Math.max(card.alpha ?? 0, opened);
        } else {
          // The others step aside.
          card.alpha = (card.alpha ?? 1) * (1 - smoothstep(0, 0.55, opened));
          const aside = Math.sign(offset || 1) * opened;
          if (sideways) card.x += aside * width * 0.3;
          else card.y += aside * height * 0.3;
        }
      }

      // Off screen: nothing to draw.
      const reach = card.height * 0.5 + 80;
      if (card.y < -reach || card.y > height + reach) continue;
      stage.cards.push(card);
    }

    return moving;
  }
}
