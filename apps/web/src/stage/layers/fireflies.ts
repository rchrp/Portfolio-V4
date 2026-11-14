import { TAU, clamp, noise2, randomBetween } from "../math";
import type { Layer, WorldFrame } from "../world";

// Fireflies: points of light that drift on slow currents and pulse, each on
// its own rhythm. They are curious about the pointer's light and wander
// towards it without ever quite reaching it.

export type FireflyOptions = {
  count?: number;
  /** Fractions of the viewport height they keep between. */
  top?: number;
  bottom?: number;
};

type Firefly = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  /** Pulses per second. */
  rate: number;
  depth: number;
  seed: number;
};

export class Fireflies implements Layer {
  private swarm: Firefly[] = [];
  private readonly top: number;
  private readonly bottom: number;

  constructor(frame: WorldFrame, options: FireflyOptions = {}) {
    this.top = options.top ?? 0.12;
    this.bottom = options.bottom ?? 0.95;
    const count =
      options.count ??
      Math.round(clamp((frame.width * frame.height) / 24000, 20, 80));
    for (let index = 0; index < count; index += 1) {
      this.swarm.push({
        x: randomBetween(0, frame.width),
        y: randomBetween(frame.height * this.top, frame.height * this.bottom),
        vx: 0,
        vy: 0,
        phase: randomBetween(0, TAU),
        rate: randomBetween(0.16, 0.42),
        depth: randomBetween(0.35, 1),
        seed: randomBetween(0, 100),
      });
    }
  }

  step(frame: WorldFrame, dt: number) {
    const { time, pointer, width, height } = frame;
    const top = height * this.top;
    const bottom = height * this.bottom;

    for (const firefly of this.swarm) {
      // A slow current, different for each one.
      const angle =
        noise2(
          firefly.x * 0.003 + firefly.seed,
          firefly.y * 0.003 + time * 0.08,
          9,
        ) *
        TAU *
        2;
      const drift = 20 * (0.5 + 0.5 * firefly.depth);
      let ax = (Math.cos(angle) * drift - firefly.vx) * 1.4;
      let ay = (Math.sin(angle) * drift * 0.7 - firefly.vy) * 1.4;

      if (pointer.presence > 0) {
        const dx = pointer.x - firefly.x;
        const dy = pointer.y - firefly.y;
        const distance = Math.hypot(dx, dy) || 1;
        // Drawn in from afar, held off up close.
        if (distance < 260) {
          const pull = distance < 70 ? -60 : 34 * (1 - distance / 260);
          ax += (dx / distance) * pull * pointer.presence;
          ay += (dy / distance) * pull * pointer.presence;
        }
      }

      // Kept inside their band of the sky.
      if (firefly.y < top) ay += (top - firefly.y) * 0.6;
      if (firefly.y > bottom) ay -= (firefly.y - bottom) * 0.6;

      firefly.vx += ax * dt;
      firefly.vy += ay * dt;
      firefly.x += firefly.vx * dt;
      firefly.y += firefly.vy * dt;
      firefly.phase += dt * TAU * firefly.rate;

      if (firefly.x < -30) firefly.x = width + 30;
      if (firefly.x > width + 30) firefly.x = -30;
    }
  }

  draw(frame: WorldFrame, presence: number) {
    const { grid, palette } = frame;
    const { accent, pale, bg } = palette;

    for (const firefly of this.swarm) {
      // Mostly dark, with a slow swell of light.
      const pulse = Math.pow(Math.max(0, Math.sin(firefly.phase)), 2.4);
      const light = presence * pulse * (0.45 + 0.55 * firefly.depth);
      if (light < 0.04) continue;
      const fog = (1 - firefly.depth) * 0.45;
      const radius = grid.spacing * (2.4 + 3.4 * firefly.depth);
      grid.glow(
        firefly.x,
        firefly.y,
        radius,
        light * 0.8,
        accent[0] + (bg[0] - accent[0]) * fog,
        accent[1] + (bg[1] - accent[1]) * fog,
        accent[2] + (bg[2] - accent[2]) * fog,
      );
      // The bright heart of it.
      grid.splat(firefly.x, firefly.y, light, pale[0], pale[1], pale[2]);
    }
  }
}
