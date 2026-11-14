import type { Ink } from "../cells";
import {
  TAU,
  angleDelta,
  clamp,
  clamp01,
  damping,
  noise2,
  randomBetween,
} from "../math";
import type { Layer, Palette, WorldFrame } from "../world";

// Butterflies crossing the screen. Each one is four wing lobes around a thin
// body, described as an implicit shape and sampled by the cells: the wings
// close by squeezing the shape sideways, so a wingbeat is cells shrinking
// towards the body and growing back.

export type ButterflyOptions = {
  count?: number;
  /** Direction of travel, in degrees: 0 is right, 90 is up. */
  course?: number;
  /** Wingspan of the closest ones, in pixels. */
  span?: number;
  /** Depth of the farthest ones, 0 to 1: smaller and fainter. */
  farthest?: number;
};

type Butterfly = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  /** Position in the wingbeat. */
  phase: number;
  /** 1 while gliding, wings held open. */
  glide: number;
  glideUntil: number;
  depth: number;
  seed: number;
  /** Which of the palette's two colours the wings lean to, 0 to 1. */
  tint: number;
};

// State read by the shape function, set for the butterfly being drawn.
let open = 1;
let fog = 0;
let tint = 0;
let colors: Palette;

const cosF = Math.cos(-0.5);
const sinF = Math.sin(-0.5);
const cosH = Math.cos(0.55);
const sinH = Math.sin(0.55);

function toned(ink: Ink, color: readonly number[], level: number) {
  const bg = colors.bg;
  ink.r = color[0] + (bg[0] - color[0]) * fog;
  ink.g = color[1] + (bg[1] - color[1]) * fog;
  ink.b = color[2] + (bg[2] - color[2]) * fog;
  ink.level = level;
  return true;
}

function mixed(
  ink: Ink,
  from: readonly number[],
  to: readonly number[],
  amount: number,
  level: number,
) {
  const bg = colors.bg;
  const r = from[0] + (to[0] - from[0]) * amount;
  const g = from[1] + (to[1] - from[1]) * amount;
  const b = from[2] + (to[2] - from[2]) * amount;
  ink.r = r + (bg[0] - r) * fog;
  ink.g = g + (bg[1] - g) * fog;
  ink.b = b + (bg[2] - b) * fog;
  ink.level = level;
  return true;
}

// u runs from tail to head, v across; the wings reach about half a span.
function butterflyShape(u: number, v: number, ink: Ink) {
  const side = Math.abs(v) / open;

  // Forewing: a long lobe swept forwards.
  let du = u - 0.085;
  let dv = side - 0.235;
  let x = du * cosF + dv * sinF;
  let y = dv * cosF - du * sinF;
  const fore = (x * x) / 0.0345 + (y * y) / 0.068;
  if (fore <= 1) {
    // A dark tip, a pale mark inside it, and a thin dark edge.
    if (y > 0.13) {
      const mark = (u - 0.19) * (u - 0.19) + (side - 0.385) * (side - 0.385);
      return mark < 0.0011
        ? toned(ink, colors.pale, 0.8)
        : toned(ink, colors.ink, 1);
    }
    if (fore > 0.88) return toned(ink, colors.ink, 1);
    // From the deep tone at the body to the bright one outwards.
    return mixed(
      ink,
      colors.accent2,
      colors.accent,
      clamp01((y + 0.2) * 2.6 + tint * 0.35),
      0.9,
    );
  }

  // Hindwing: rounder, paler, trailing behind.
  du = u + 0.125;
  dv = side - 0.175;
  x = du * cosH + dv * sinH;
  y = dv * cosH - du * sinH;
  const hind = (x * x) / 0.021 + (y * y) / 0.036;
  if (hind <= 1) {
    if (hind > 0.86) return toned(ink, colors.ink, 1);
    return mixed(
      ink,
      colors.accent,
      colors.pale,
      clamp01(0.95 - hind * 0.9 + tint * 0.2),
      0.84,
    );
  }

  return false;
}

export class Butterflies implements Layer {
  private flock: Butterfly[] = [];
  private readonly course: number;
  private readonly span: number;
  private readonly farthest: number;

  constructor(frame: WorldFrame, options: ButterflyOptions = {}) {
    this.course = (-(options.course ?? 28) * Math.PI) / 180;
    this.span = options.span ?? 168;
    this.farthest = options.farthest ?? 0.5;
    const count = options.count ?? 5;
    for (let index = 0; index < count; index += 1) {
      const butterfly = this.create(index / Math.max(1, count - 1));
      butterfly.x = randomBetween(0, frame.width);
      butterfly.y = randomBetween(frame.height * 0.08, frame.height * 0.8);
      this.flock.push(butterfly);
    }
    // Far ones first.
    this.flock.sort((a, b) => a.depth - b.depth);
  }

  private create(roll: number): Butterfly {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      heading: this.course,
      phase: randomBetween(0, TAU),
      glide: 0,
      glideUntil: 0,
      depth: this.farthest + (1 - this.farthest) * Math.pow(roll, 1.4),
      seed: randomBetween(0, 100),
      tint: Math.random(),
    };
  }

  private sizeOf(butterfly: Butterfly, frame: WorldFrame) {
    const scale = clamp(Math.min(frame.width, frame.height) / 900, 0.6, 1.1);
    return this.span * scale * butterfly.depth;
  }

  // Comes back in from the side the flight starts from.
  private reenter(butterfly: Butterfly, frame: WorldFrame) {
    const margin = this.sizeOf(butterfly, frame) * 0.7;
    const cos = Math.cos(this.course);
    const sin = Math.sin(this.course);
    const fromSide =
      Math.random() *
        (frame.height * Math.abs(cos) + frame.width * Math.abs(sin)) <
      frame.height * Math.abs(cos);
    if (fromSide) {
      butterfly.x = cos >= 0 ? -margin : frame.width + margin;
      butterfly.y = randomBetween(frame.height * 0.1, frame.height * 0.95);
    } else {
      butterfly.x = randomBetween(0, frame.width * 0.9);
      butterfly.y = sin <= 0 ? frame.height + margin : -margin;
    }
    butterfly.heading = this.course;
    butterfly.vx = cos * 40;
    butterfly.vy = sin * 40;
  }

  step(frame: WorldFrame, dt: number) {
    const { time, pointer, width, height } = frame;

    for (const butterfly of this.flock) {
      const cruise = 62 * (0.55 + 0.45 * butterfly.depth);
      // The course wanders, each butterfly on its own slow curve.
      const wander =
        (noise2(time * 0.16, butterfly.seed, 7) - 0.5) * 2.1 +
        (noise2(time * 0.61, butterfly.seed, 8) - 0.5) * 0.7;
      const aim = this.course + wander;
      let ax = (Math.cos(aim) * cruise - butterfly.vx) * 1.8;
      let ay = (Math.sin(aim) * cruise - butterfly.vy) * 1.8;

      // Each downstroke lifts and pushes a little: the flight bobs.
      const beat =
        Math.max(0, -Math.sin(butterfly.phase)) * (1 - butterfly.glide);
      ax += Math.cos(butterfly.heading) * beat * cruise * 1.5;
      ay += Math.sin(butterfly.heading) * beat * cruise * 1.5 - beat * 46;
      ay += 20;

      // The pointer startles the ones it comes close to.
      if (pointer.presence > 0) {
        const dx = butterfly.x - pointer.x;
        const dy = butterfly.y - pointer.y;
        const reach = 150;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance < reach) {
          const push = (1 - distance / reach) * 760 * pointer.presence;
          ax += (dx / distance) * push;
          ay += (dy / distance) * push;
          butterfly.glideUntil = 0;
        }
      }

      butterfly.vx += ax * dt;
      butterfly.vy += ay * dt;
      const speed = Math.hypot(butterfly.vx, butterfly.vy);
      const limit = cruise * 3.2;
      if (speed > limit) {
        butterfly.vx *= limit / speed;
        butterfly.vy *= limit / speed;
      }
      butterfly.x += butterfly.vx * dt;
      butterfly.y += butterfly.vy * dt;

      if (speed > 8) {
        butterfly.heading +=
          angleDelta(
            butterfly.heading,
            Math.atan2(butterfly.vy, butterfly.vx),
          ) * damping(5, dt);
      }

      // Now and then, a glide with the wings held flat.
      if (
        butterfly.glide < 0.5 &&
        time > butterfly.glideUntil &&
        Math.random() < 0.28 * dt
      ) {
        butterfly.glideUntil = time + randomBetween(0.5, 1.3);
      }
      butterfly.glide +=
        ((time < butterfly.glideUntil ? 1 : 0) - butterfly.glide) *
        damping(6, dt);
      butterfly.phase +=
        dt *
        TAU *
        2.5 *
        (0.8 + 0.5 * clamp01(speed / (cruise * 2))) *
        (1 - 0.9 * butterfly.glide);

      const margin = this.sizeOf(butterfly, frame);
      if (
        butterfly.x < -3 * margin ||
        butterfly.x > width + margin ||
        butterfly.y < -margin ||
        butterfly.y > height + 3 * margin
      ) {
        this.reenter(butterfly, frame);
      }
    }
  }

  draw(frame: WorldFrame, presence: number) {
    const { grid, palette } = frame;
    colors = palette;

    for (const butterfly of this.flock) {
      const span = this.sizeOf(butterfly, frame);
      const beat = Math.pow(0.5 + 0.5 * Math.cos(butterfly.phase), 0.8);
      open = Math.max(
        0.1,
        0.12 + 0.88 * (beat * (1 - butterfly.glide) + 0.94 * butterfly.glide),
      );
      fog = (1 - butterfly.depth) * 0.6;
      tint = butterfly.tint;
      const alpha = presence * (0.55 + 0.45 * butterfly.depth);
      const heading = butterfly.heading + 0.07 * Math.sin(butterfly.phase);

      grid.shape(
        butterfly.x,
        butterfly.y,
        heading,
        span,
        0.6,
        butterflyShape,
        alpha,
      );

      // The body, and two antennae.
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const { ink, bg } = palette;
      const r = ink[0] + (bg[0] - ink[0]) * fog;
      const g = ink[1] + (bg[1] - ink[1]) * fog;
      const b = ink[2] + (bg[2] - ink[2]) * fog;
      grid.line(
        butterfly.x - cos * span * 0.2,
        butterfly.y - sin * span * 0.2,
        butterfly.x + cos * span * 0.17,
        butterfly.y + sin * span * 0.17,
        alpha,
        alpha,
        r,
        g,
        b,
      );
      if (span > 60) {
        for (const side of [-1, 1]) {
          grid.line(
            butterfly.x + cos * span * 0.17,
            butterfly.y + sin * span * 0.17,
            butterfly.x + (cos * 0.31 - sin * 0.09 * side) * span,
            butterfly.y + (sin * 0.31 + cos * 0.09 * side) * span,
            alpha * 0.7,
            alpha * 0.4,
            r,
            g,
            b,
          );
        }
      }
    }
  }
}
