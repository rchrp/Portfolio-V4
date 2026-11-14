import { TAU, clamp, clamp01, noise2, randomBetween } from "../math";
import type { Layer, WorldFrame } from "../world";

// A murmuration: many small birds that keep together, keep apart and keep
// pace, following a point that roams the sky. Up close each bird is only a
// few cells, two wings hinged on a body; the figure is the flock.

export type BirdOptions = {
  count?: number;
  /** Wingspan of the closest birds, in pixels. */
  span?: number;
};

type Bird = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  depth: number;
  /** Whether it is drawn in the accent rather than in ink. */
  bright: boolean;
};

export class Murmuration implements Layer {
  private flock: Bird[] = [];
  private readonly span: number;

  constructor(frame: WorldFrame, options: BirdOptions = {}) {
    this.span = options.span ?? 38;
    const count =
      options.count ??
      Math.round(clamp((frame.width * frame.height) / 26000, 18, 54));
    const startX = frame.width * randomBetween(0.3, 0.7);
    const startY = frame.height * randomBetween(0.3, 0.6);
    for (let index = 0; index < count; index += 1) {
      const angle = randomBetween(0, TAU);
      this.flock.push({
        x: startX + Math.cos(angle) * randomBetween(0, 220),
        y: startY + Math.sin(angle) * randomBetween(0, 160),
        vx: randomBetween(-60, 60),
        vy: randomBetween(-40, 40),
        phase: randomBetween(0, TAU),
        depth: randomBetween(0.45, 1),
        bright: index % 5 === 0,
      });
    }
    this.flock.sort((a, b) => a.depth - b.depth);
  }

  step(frame: WorldFrame, dt: number) {
    const { time, pointer, width, height } = frame;
    const flock = this.flock;

    // The point the flock is drawn to wanders over the whole screen.
    const leadX =
      width * (0.5 + 0.38 * Math.sin(time * 0.21) * Math.cos(time * 0.063));
    const leadY =
      height *
      (0.46 +
        0.3 * Math.sin(time * 0.157 + 1.3) +
        0.08 * (noise2(time * 0.2, 4, 51) - 0.5));

    let meanX = 0;
    let meanY = 0;
    let meanVx = 0;
    let meanVy = 0;
    for (const bird of flock) {
      meanX += bird.x;
      meanY += bird.y;
      meanVx += bird.vx;
      meanVy += bird.vy;
    }
    meanX /= flock.length;
    meanY /= flock.length;
    meanVx /= flock.length;
    meanVy /= flock.length;

    const personal = 34;
    for (const bird of flock) {
      // Together, in step, towards the roaming point.
      let ax = (meanX - bird.x) * 0.55 + (meanVx - bird.vx) * 1.1;
      let ay = (meanY - bird.y) * 0.55 + (meanVy - bird.vy) * 1.1;
      ax += (leadX - bird.x) * 0.9;
      ay += (leadY - bird.y) * 0.9;

      // But not on top of each other.
      for (const other of flock) {
        if (other === bird) continue;
        const dx = bird.x - other.x;
        const dy = bird.y - other.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > personal * personal || distanceSquared === 0) {
          continue;
        }
        const distance = Math.sqrt(distanceSquared);
        const push = (1 - distance / personal) * 620;
        ax += (dx / distance) * push;
        ay += (dy / distance) * push;
      }

      // The pointer opens a hole in the flock.
      if (pointer.presence > 0) {
        const dx = bird.x - pointer.x;
        const dy = bird.y - pointer.y;
        const distance = Math.hypot(dx, dy) || 1;
        const reach = 170;
        if (distance < reach) {
          const push = (1 - distance / reach) * 1500 * pointer.presence;
          ax += (dx / distance) * push;
          ay += (dy / distance) * push;
        }
      }

      bird.vx += ax * dt;
      bird.vy += ay * dt;
      const speed = Math.hypot(bird.vx, bird.vy) || 1;
      const cruise = 150 * (0.6 + 0.4 * bird.depth);
      const limited = clamp(speed, cruise * 0.55, cruise * 1.6);
      bird.vx *= limited / speed;
      bird.vy *= limited / speed;
      bird.x += bird.vx * dt;
      bird.y += bird.vy * dt;
      bird.phase += dt * TAU * (2.6 + (limited / cruise) * 1.2);
    }
  }

  draw(frame: WorldFrame, presence: number) {
    const { grid, palette } = frame;
    const { ink, accent, bg } = palette;
    const scale = clamp(Math.min(frame.width, frame.height) / 900, 0.7, 1.1);

    for (const bird of this.flock) {
      const tone = bird.bright ? accent : ink;
      const fog = (1 - bird.depth) * 0.7;
      const r = tone[0] + (bg[0] - tone[0]) * fog;
      const g = tone[1] + (bg[1] - tone[1]) * fog;
      const b = tone[2] + (bg[2] - tone[2]) * fog;
      const alpha = presence * (0.55 + 0.45 * bird.depth);
      const wing = this.span * scale * bird.depth * 0.5;
      const heading = Math.atan2(bird.vy, bird.vx);
      // Wings swept back, beating between nearly flat and well raised.
      const beat = Math.sin(bird.phase);
      const sweep = 1.95 + 0.45 * beat;
      const reach = wing * (0.72 + 0.28 * clamp01(0.5 - 0.5 * beat));

      grid.splat(bird.x, bird.y, alpha, r, g, b);
      for (const side of [-1, 1]) {
        const angle = heading + sweep * side;
        grid.line(
          bird.x,
          bird.y,
          bird.x + Math.cos(angle) * reach,
          bird.y + Math.sin(angle) * reach,
          alpha,
          alpha * 0.45,
          r,
          g,
          b,
        );
      }
    }
  }
}
