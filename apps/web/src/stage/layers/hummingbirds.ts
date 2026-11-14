import type { Ink } from "../cells";
import { TAU, clamp, clamp01, damping, randomBetween } from "../math";
import type { Layer, Palette, WorldFrame } from "../world";

// Hummingbirds, seen from the side. Each one hangs in the air on a blur of
// wings, then darts to another spot. The wings beat faster than the cells can
// fade, which is exactly what a hummingbird's wings look like.

export type HummingbirdOptions = {
  count?: number;
  /** Length of the closest birds, beak to tail, in pixels. */
  span?: number;
  /** Fractions of the viewport height they keep between. */
  top?: number;
  bottom?: number;
};

type Hummingbird = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where it is heading, or hovering. */
  targetX: number;
  targetY: number;
  /** Seconds left before it picks another spot. */
  patience: number;
  /** 1 facing right, -1 facing left; eased when it turns. */
  facing: number;
  turn: number;
  /** Positions in the wingbeat and in the hover's bob. */
  beat: number;
  bob: number;
  depth: number;
};

// State read by the shape function, set for the bird being drawn.
let facing = 1;
let wing = Math.PI;
let fog = 0;
let colors: Palette;

const bodyCos = Math.cos(0.3);
const bodySin = Math.sin(0.3);

function toned(ink: Ink, color: readonly number[], level: number) {
  const bg = colors.bg;
  ink.r = color[0] + (bg[0] - color[0]) * fog;
  ink.g = color[1] + (bg[1] - color[1]) * fog;
  ink.b = color[2] + (bg[2] - color[2]) * fog;
  ink.level = level;
  return true;
}

// x runs from tail to beak, y upwards, in body lengths.
function birdShape(u: number, v: number, ink: Ink) {
  const x = u * facing;
  const y = -v;

  // Head: a dark crown over a bright throat.
  const hx = x - 0.19;
  const hy = y - 0.08;
  if (hx * hx + hy * hy < 0.0062) {
    return hy < -0.012
      ? toned(ink, colors.accent, 0.95)
      : toned(ink, colors.accent2, 1);
  }

  // Body: an egg leaning forwards, pale underneath.
  const bx = x + 0.005;
  const by = y + 0.005;
  const along = bx * bodyCos + by * bodySin;
  const across = by * bodyCos - bx * bodySin;
  if ((along * along) / 0.043 + (across * across) / 0.0105 < 1) {
    if (across < -0.028) return toned(ink, colors.pale, 0.85);
    return along > 0.07
      ? toned(ink, colors.accent, 0.95)
      : toned(ink, colors.accent2, 1);
  }

  // Tail: a wedge fanning out behind and below.
  const tx = -(x + 0.15);
  if (tx > 0 && tx < 0.28) {
    const axis = -0.055 - tx * 0.42;
    const half = 0.02 + tx * 0.17;
    if (Math.abs(y - axis) < half) return toned(ink, colors.ink, 0.92);
  }

  // Wing: a blade hinged at the shoulder, wherever the beat has it.
  const wx = x - 0.02;
  const wy = y - 0.04;
  const reach = Math.sqrt(wx * wx + wy * wy);
  if (reach < 0.4) {
    let off = Math.atan2(wy, wx) - wing;
    if (off > Math.PI) off -= TAU;
    if (off < -Math.PI) off += TAU;
    const spread = 0.36;
    if (Math.abs(off) < spread) {
      const taper = 1 - (off / spread) * (off / spread);
      if (reach < 0.4 * (0.35 + 0.65 * taper)) {
        return toned(ink, colors.accent2, 0.6);
      }
    }
  }

  return false;
}

export class Hummingbirds implements Layer {
  private flock: Hummingbird[] = [];
  private readonly span: number;
  private readonly top: number;
  private readonly bottom: number;

  constructor(frame: WorldFrame, options: HummingbirdOptions = {}) {
    this.span = options.span ?? 210;
    this.top = options.top ?? 0.1;
    this.bottom = options.bottom ?? 0.82;
    const count = options.count ?? (frame.width < 700 ? 3 : 6);
    for (let index = 0; index < count; index += 1) {
      const depth = 0.55 + 0.45 * Math.pow(index / Math.max(1, count - 1), 1.3);
      // They arrive from either side.
      const fromLeft = index % 2 === 0;
      const bird: Hummingbird = {
        x: fromLeft ? -200 - index * 90 : frame.width + 200 + index * 90,
        y: randomBetween(frame.height * 0.2, frame.height * 0.7),
        vx: 0,
        vy: 0,
        targetX: 0,
        targetY: 0,
        patience: 0,
        facing: fromLeft ? 1 : -1,
        turn: fromLeft ? 1 : -1,
        beat: randomBetween(0, TAU),
        bob: randomBetween(0, TAU),
        depth,
      };
      this.settle(bird, frame);
      this.flock.push(bird);
    }
    this.flock.sort((a, b) => a.depth - b.depth);
  }

  private lengthOf(bird: Hummingbird, frame: WorldFrame) {
    const scale = clamp(Math.min(frame.width, frame.height) / 900, 0.55, 1.1);
    return this.span * scale * bird.depth;
  }

  // Picks the next spot to hover at, away from `avoid` when given.
  private settle(
    bird: Hummingbird,
    frame: WorldFrame,
    avoid?: { x: number; y: number },
  ) {
    const margin = this.lengthOf(bird, frame) * 0.6;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      bird.targetX = randomBetween(margin, frame.width - margin);
      bird.targetY = randomBetween(
        frame.height * this.top,
        frame.height * this.bottom,
      );
      if (
        !avoid ||
        Math.hypot(bird.targetX - avoid.x, bird.targetY - avoid.y) > 320
      ) {
        break;
      }
    }
    bird.patience = randomBetween(1.6, 4.6);
  }

  resize(frame: WorldFrame) {
    for (const bird of this.flock) this.settle(bird, frame);
  }

  step(frame: WorldFrame, dt: number) {
    const { pointer } = frame;

    for (const bird of this.flock) {
      const toX = bird.targetX - bird.x;
      const toY = bird.targetY - bird.y;
      const distance = Math.hypot(toX, toY);

      // Arrived: it hangs there for a while, then is off again.
      if (distance < 14) {
        bird.patience -= dt;
        if (bird.patience <= 0) this.settle(bird, frame);
      }

      // The pointer coming close sends it somewhere else at once.
      if (pointer.presence > 0.2) {
        const fear = Math.hypot(bird.x - pointer.x, bird.y - pointer.y);
        if (fear < 150 && distance < 60) this.settle(bird, frame, pointer);
      }

      // A stiff, well-damped pull: quick to leave, quick to stop.
      const pull = 15;
      bird.vx += (toX * pull - bird.vx * 7.5) * dt;
      bird.vy += (toY * pull - bird.vy * 7.5) * dt;
      const speed = Math.hypot(bird.vx, bird.vy);
      const limit = 760 * (0.6 + 0.4 * bird.depth);
      if (speed > limit) {
        bird.vx *= limit / speed;
        bird.vy *= limit / speed;
      }
      bird.x += bird.vx * dt;
      bird.y += bird.vy * dt;

      if (Math.abs(bird.vx) > 40) bird.turn = bird.vx > 0 ? 1 : -1;
      bird.facing += (bird.turn - bird.facing) * damping(14, dt);
      bird.beat += dt * TAU * (11 + clamp01(speed / 300) * 5);
      bird.bob += dt * TAU * 0.55;
    }
  }

  draw(frame: WorldFrame, presence: number) {
    const { grid, palette } = frame;
    const { spacing, originX, originY } = grid;
    colors = palette;

    for (const bird of this.flock) {
      const span = this.lengthOf(bird, frame);
      // Mid-turn the bird is seen head-on: it narrows, then widens again.
      const turned = bird.facing >= 0 ? 1 : -1;
      const width = Math.max(0.35, Math.abs(bird.facing));
      facing = turned / width;
      // The wing sweeps between raised and lowered, through straight back.
      wing = Math.PI + Math.sin(bird.beat) * 1.3;
      fog = (1 - bird.depth) * 0.55;
      const alpha = presence * (0.6 + 0.4 * bird.depth);
      const x = bird.x;
      const y = bird.y + Math.sin(bird.bob) * span * 0.018;

      grid.shape(x, y, 0, span, 0.62, birdShape, alpha);

      // The beak, one cell thin, and the eye.
      const { ink, bg } = palette;
      const r = ink[0] + (bg[0] - ink[0]) * fog;
      const g = ink[1] + (bg[1] - ink[1]) * fog;
      const b = ink[2] + (bg[2] - ink[2]) * fog;
      const side = turned * width;
      grid.stroke(
        x + 0.25 * span * side,
        y - 0.085 * span,
        x + 0.5 * span * side,
        y - 0.07 * span,
        alpha,
        alpha * 0.85,
        r,
        g,
        b,
      );
      if (span > 90) {
        grid.paint(
          Math.round((x + 0.215 * span * side - originX) / spacing),
          Math.round((y - 0.1 * span - originY) / spacing),
          alpha,
          r,
          g,
          b,
        );
      }
    }
  }
}
