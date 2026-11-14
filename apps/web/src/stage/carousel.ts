import type { CardDraw } from "./cards-layer";
import type { StageEngine } from "./engine";
import { clamp01, damp, easeInOutCubic, lerp, smoothstep } from "./math";

// The projects' carousel: a spiral staircase of covers. Each cover is a flat
// plane standing on a helix, a step further round the axis and a step lower
// than the one before, facing outwards. The page's scroll turns the helix and
// raises it by the same step, so the cover in focus always stands straight
// in front of the viewer, the next one waiting below to its right, the last
// one leaving above to its left. A camera with a very wide angle, close to
// the helix, and a lens that swells the middle of the picture give the
// covers their lean.
//
// The geometry is the one of Dominik Fojcik's portfolio, measured from its
// source: planes 1.5 high, 15° and 1.7 apart on a helix of radius 3, seen
// from 1 away through 110° of field and a lens of strength 0.1.
//
// Before the first project, the helix is further down: scrolling away from
// the hero brings the first cover up from the bottom right while the hero
// is covered. Opening a project lifts its cover off the helix and lays it
// flat in the frame its page keeps for it.

export type CarouselLayout = {
  /** Centre of the card in focus. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Narrow screens have no room beside the cover for the list of names, and
   * none below it for the next cover: the covers travel along a row instead.
   */
  sideways: boolean;
};

export type Rect = { left: number; top: number; width: number; height: number };

/** A cover's height, in the helix's own unit. */
const PLANE_HEIGHT = 1.5;
/** How far round the axis two neighbours are, in radians. */
const TURN = Math.PI / 12;
/** How much lower each cover stands than the one before. */
const DROP = 1.7;
const RADIUS = 3;
/** The camera looks at the axis from this far, level with the cover in focus. */
const CAMERA = 4;
/** Half of the camera's field of view, as a slope. */
const SLOPE = Math.tan((110 * Math.PI) / 360);
/** How much the lens swells the middle of the picture. */
const LENS = 0.1 * 1.2;
/** A cover in focus, at full size, in viewport heights. */
const NATURAL = PLANE_HEIGHT / (2 * (CAMERA - RADIUS) * SLOPE) / (1 - LENS);
/** How many steps further down the helix waits while the hero is shown. */
const ARRIVAL = 0.75;
/** Seconds a cover takes to open into its project, and to come back. */
const OPEN_SECONDS = 0.95;
const CLOSE_SECONDS = 0.75;

export class Carousel {
  /** Position in the story: 0 is the hero, 1 the first project in focus. */
  position = 0;
  /** 0: on the helix; 1: the open project's cover. */
  private open = 0;
  private opening = false;
  private openIndex = 0;

  /** One picture per project. */
  constructor(private sources: string[]) {}

  /** Starts opening the project at `index`, or closing the open one. */
  setOpen(index: number | null, instant = false) {
    this.opening = index !== null;
    if (index !== null) this.openIndex = index;
    if (instant) this.open = this.opening ? 1 : 0;
  }

  /** Jumps to a position without gliding there. */
  jumpTo(position: number) {
    this.position = position;
  }

  /** How far the open project's cover has come forward, 0 to 1. */
  get opened() {
    return this.open;
  }

  /** Where the card in focus sits, for a given viewport. */
  static layout(width: number, height: number): CarouselLayout {
    const narrow = width < 832;
    let cardHeight = narrow
      ? Math.min(height * 0.36, (width * 0.9 * 9) / 16)
      : height * NATURAL;
    let cardWidth = (cardHeight * 16) / 9;
    const widest = narrow ? width * 0.9 : width * 0.6;
    if (cardWidth > widest) {
      cardWidth = widest;
      cardHeight = (cardWidth * 9) / 16;
    }
    return {
      x: narrow ? width / 2 : width * 0.595,
      y: narrow ? height * 0.36 : height * 0.5,
      width: cardWidth,
      height: cardHeight,
      sideways: narrow,
    };
  }

  /**
   * Advances towards `target` (the position the scroll asks for) and pushes
   * this frame's cards. `cover` is where the open project wants its cover,
   * `fade` dims everything as the story leaves the screen. Returns whether
   * anything is still moving.
   */
  update(
    stage: StageEngine,
    dt: number,
    target: number,
    visible: boolean,
    cover: Rect | null,
    viewHeight: number,
    fade = 1,
  ) {
    const { width, still } = stage;
    // The visible height: on phones the canvas runs under the toolbars.
    const height = viewHeight;
    // The scroll is already smoothed: the helix follows it closely.
    this.position = still ? target : damp(this.position, target, 16, dt);
    if (Math.abs(this.position - target) < 0.0004) this.position = target;

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
    const moving = this.position !== target || this.open !== goal;
    // On the hero, the helix is still out of sight.
    if (!visible || (this.position <= 0 && this.open === 0)) return moving;

    const layout = Carousel.layout(width, height);
    // Where the helix stands, in steps: the first project is at 0. It comes
    // up from further down while the hero leaves.
    const away = 1 - Math.min(1, this.position);
    const coil = this.position - 1 - away * away * ARRIVAL;

    // From the farthest to the nearest, so the card in focus is drawn last.
    const order = this.sources
      .map((_, index) => index)
      .sort((a, b) => Math.abs(b - coil) - Math.abs(a - coil));

    for (const index of order) {
      const isOpen = index === this.openIndex && opened > 0 && cover !== null;
      let offset = index - coil;
      // Around an open cover, the others step further off and go.
      if (opened > 0 && !isOpen) offset += Math.sign(offset || 1) * opened;
      const distance = Math.abs(offset);
      if (distance > 2.4 && !isOpen) continue;

      const card: CardDraw = {
        src: this.sources[index],
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        alpha: fade * (isOpen ? 1 : 1 - smoothstep(0, 0.6, opened)),
        shadow: 1 - smoothstep(0, 0.8, distance),
        radius: 0,
      };

      if (layout.sideways) {
        card.x += offset * layout.width * 1.06;
        card.curveX = 1 / (width * 1.02);
        card.pivotX = layout.x;
        card.alpha = (card.alpha ?? 1) * (1 - smoothstep(1.55, 2.15, distance));
      } else {
        card.place = {
          matrix: Carousel.place(offset, layout, height),
          centerX: layout.x,
          centerY: layout.y,
          half: height / 2,
          lens: LENS,
          flat: 0,
        };
      }

      if (isOpen && cover) {
        card.x = lerp(card.x, cover.left + cover.width / 2, opened);
        card.y = lerp(card.y, cover.top + cover.height / 2, opened);
        card.width = lerp(card.width, cover.width, opened);
        card.height = lerp(card.height, cover.height, opened);
        card.curveX = (card.curveX ?? 0) * (1 - opened);
        if (card.place) card.place.flat = opened;
        card.shadow = lerp(card.shadow ?? 0, 0.55, opened);
      }

      if ((card.alpha ?? 0) <= 0.003) continue;
      stage.cards.push(card);
    }

    return moving;
  }

  // A cover `offset` steps along the helix from the one in focus, as the
  // camera sees it: where each point of the card falls, before the lens.
  private static place(
    offset: number,
    layout: CarouselLayout,
    viewHeight: number,
  ) {
    const angle = offset * TURN;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Narrower windows get smaller planes on the same helix.
    const planeHeight = (PLANE_HEIGHT * layout.height) / (viewHeight * NATURAL);
    const planeWidth = (planeHeight * layout.width) / layout.height;
    // Pixels per unit, one unit away from the camera.
    const focal = viewHeight / 2 / SLOPE;
    return new Float32Array([
      // Across the card: it turns with the helix, its far edge receding.
      cos * planeWidth * focal,
      0,
      sin * planeWidth,
      // Down the card.
      0,
      planeHeight * focal,
      0,
      // Its centre: round the axis, and down the stairs.
      RADIUS * sin * focal,
      offset * DROP * focal,
      CAMERA - RADIUS * cos,
    ]);
  }
}
