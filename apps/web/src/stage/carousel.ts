import type { CardDraw } from "./cards-layer";
import type { StageEngine } from "./engine";
import { clamp, clamp01, damp, easeInOutCubic, lerp, smoothstep } from "./math";

// The story's carousel: the hero, then every project, on a roller standing
// upright. The page's scroll turns it. The card in the middle faces the
// reader, flat; those above and below have turned away around the roller,
// wrapped on its curve.
//
// The first card is the hero itself. At the top of the page it fills the
// screen; scrolling, it draws back, shrinks to a card's size and turns away
// on the roller as the first project comes round. Opening a project does the
// reverse for that project's cover: it comes forward, flattens, and settles
// in the frame its page keeps for it.

export type CarouselLayout = {
  /** Centre of the card in focus. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Which way the cards travel: on a roller down the screen on wide ones,
   * along a row on narrow ones, where the roller would run through the text.
   */
  sideways: boolean;
};

export type Rect = { left: number; top: number; width: number; height: number };

/** How far round the roller two neighbours are, in radians. */
const TURN = 0.7;
/** Distance between two neighbours down the screen, in card heights. */
const DROP = 0.9;
/** Seconds a cover takes to open into its project, and to come back. */
const OPEN_SECONDS = 0.95;
const CLOSE_SECONDS = 0.75;
/** Share of the first step during which the hero shrinks into its card. */
const HERO_ZOOM = 0.86;

export class Carousel {
  /** Position in the list: 0 is the hero, 2.4 is between two projects. */
  position = 0;
  private velocity = 0;
  /** 0: on the roller; 1: the open project's cover. */
  private open = 0;
  private opening = false;
  private openIndex = 1;

  /** `sources[0]` stands for the hero and is not loaded. */
  constructor(private sources: string[]) {}

  /** Starts opening the card at `index`, or closing the open one. */
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

  /** How far the open project's cover has come forward, 0 to 1. */
  get opened() {
    return this.open;
  }

  /** Where the card in focus sits, for a given viewport. */
  static layout(width: number, height: number): CarouselLayout {
    const narrow = width < 832;
    let cardHeight = narrow
      ? Math.min(height * 0.36, (width * 0.9 * 9) / 16)
      : clamp(height * 0.64, 260, 760);
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
    // At the very top the hero fills the screen: the stage draws it itself.
    if (!visible || (this.position <= 0 && this.open === 0)) return moving;

    const layout = Carousel.layout(width, height);
    const { sideways } = layout;
    const radius = layout.width * 0.74;
    const drop = layout.height * DROP;
    const stride = layout.width * 1.06;
    const rush = Math.min(1, Math.abs(this.velocity) * 0.2);
    const hero = stage.hero.surface;

    // From the farthest to the nearest, so the card in focus is drawn last.
    const order = this.sources
      .map((_, index) => index)
      .sort(
        (a, b) => Math.abs(b - this.position) - Math.abs(a - this.position),
      );

    for (const index of order) {
      const offset = index - this.position;
      const distance = Math.abs(offset);
      if (distance > 2.3 && !(index === this.openIndex && opened > 0)) continue;
      if (index === 0 && !hero) continue;

      // Its place on the roller.
      const turn = offset * TURN * (1 + rush * 0.12);
      const card: CardDraw = {
        ...(index === 0
          ? { surface: hero ?? undefined }
          : { src: this.sources[index] }),
        x: layout.x + (sideways ? offset * stride : 0),
        y: layout.y + (sideways ? 0 : offset * drop),
        width: layout.width,
        height: layout.height,
        alpha: fade * (1 - smoothstep(1.55, 2.15, distance)),
        shadow: 1 - smoothstep(0, 0.8, distance),
        radius: 0,
      };
      if (sideways) {
        card.curveX = 1 / (width * 1.02);
        card.pivotX = layout.x;
      } else {
        card.ring = {
          centerX: layout.x,
          radius,
          angle: turn,
          wrap: smoothstep(0.05, 1, distance),
        };
      }

      // The hero: from the whole screen to its card.
      if (index === 0 && this.position < 1) {
        const zoom = easeInOutCubic(clamp01(this.position / HERO_ZOOM));
        card.x = lerp(width / 2, card.x, zoom);
        card.y = lerp(height / 2, card.y, zoom);
        card.width = lerp(width, card.width, zoom);
        card.height = lerp(height, card.height, zoom);
        card.shadow = (card.shadow ?? 0) * zoom + zoom * (1 - zoom) * 2;
        if (card.ring) {
          card.ring.centerX = lerp(width / 2, layout.x, zoom);
          card.ring.angle *= zoom;
          card.ring.wrap *= zoom;
          // A larger roller while the card is still wide: it must not wrap.
          card.ring.radius = lerp(width * 2, radius, zoom);
        } else {
          card.curveX = (card.curveX ?? 0) * zoom;
        }
      }

      if (opened > 0) {
        if (index === this.openIndex && cover) {
          card.x = lerp(card.x, cover.left + cover.width / 2, opened);
          card.y = lerp(card.y, cover.top + cover.height / 2, opened);
          card.width = lerp(card.width, cover.width, opened);
          card.height = lerp(card.height, cover.height, opened);
          card.curveX = (card.curveX ?? 0) * (1 - opened);
          if (card.ring) {
            card.ring.centerX = lerp(
              card.ring.centerX,
              cover.left + cover.width / 2,
              opened,
            );
            card.ring.angle *= 1 - opened;
            card.ring.wrap *= 1 - opened;
          }
          card.shadow = lerp(card.shadow ?? 0, 0.55, opened);
          card.alpha = Math.max(card.alpha ?? 0, opened);
        } else {
          // The others turn further away and go.
          card.alpha = (card.alpha ?? 1) * (1 - smoothstep(0, 0.5, opened));
          const aside = Math.sign(offset || 1) * opened;
          if (card.ring) card.ring.angle += aside * 0.5;
          else card.x += aside * width * 0.3;
        }
      }

      // Off screen: nothing to draw.
      const reach = card.height * 0.5 + 90;
      if (card.y < -reach || card.y > height + reach) continue;
      if ((card.alpha ?? 0) <= 0.003) continue;
      stage.cards.push(card);
    }

    return moving;
  }
}
