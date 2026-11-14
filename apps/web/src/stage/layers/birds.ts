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
    this.span = options.span ?? 66;
    const count =
      options.count ??
      Math.round(clamp((frame.width * frame.height) / 24000, 20, 60));
    const startX = frame.width * randomBetween(0.3, 0.7);
    const startY = frame.height * randomBetween(0.3, 0.6);
    for (let index = 0; index < count; index += 1) {
      const angle = randomBetween(0, TAU);
      this.flock.push({
        x: startX + Math.cos(angle) * randomBetween(0, 320),
        y: startY + Math.sin(angle) * randomBetween(0, 220),
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

    const sight = 180;
    const personal = 84;
    for (const bird of flock) {
      // Each bird only minds the ones around it: it steers towards their
      // middle, matches their pace, and keeps its distance. That is enough
      // for the flock to stretch into ribbons and fold back on itself.
      let centerX = 0;
      let centerY = 0;
      let paceX = 0;
      let paceY = 0;
      let near = 0;
      let ax = 0;
      let ay = 0;
      for (const other of flock) {
        if (other === bird) continue;
        const dx = bird.x - other.x;
        const dy = bird.y - other.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > sight * sight || distanceSquared === 0) continue;
        centerX += other.x;
        centerY += other.y;
        paceX += other.vx;
        paceY += other.vy;
        near += 1;
        if (distanceSquared < personal * personal) {
          const distance = Math.sqrt(distanceSquared);
          const push = (1 - distance / personal) * 900;
          ax += (dx / distance) * push;
          ay += (dy / distance) * push;
        }
      }
      if (near > 0) {
        ax += (centerX / near - bird.x) * 0.3 + (paceX / near - bird.vx) * 1.6;
        ay += (centerY / near - bird.y) * 0.3 + (paceY / near - bird.vy) * 1.6;
      }
      // A loose pull towards the roaming point keeps the flock on screen.
      ax += (leadX - bird.x) * 0.2;
      ay += (leadY - bird.y) * 0.2;

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
      const cruise = 135 * (0.6 + 0.4 * bird.depth);
      const limited = clamp(speed, cruise * 0.7, cruise * 1.5);
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

      for (const side of [-1, 1]) {
        const angle = heading + sweep * side;
        grid.stroke(
          bird.x,
          bird.y,
          bird.x + Math.cos(angle) * reach,
          bird.y + Math.sin(angle) * reach,
          alpha,
          alpha * 0.55,
          r,
          g,
          b,
        );
      }
    }
  }
}
