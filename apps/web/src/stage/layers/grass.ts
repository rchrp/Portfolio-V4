import { clamp, clamp01, hash2, noise2 } from "../math";
import type { Layer, WorldFrame } from "../world";

// A meadow along the bottom of the screen: one blade per cell column or so,
// each a short curve that leans with a wind travelling across the field and
// away from the pointer when it brushes through.

export type GrassOptions = {
  /** Tallest blades, as a fraction of the viewport height. */
  height?: number;
  /** Share of the columns that grow a blade. */
  density?: number;
  /** How far the tips take the accent colour, 0 to 1. */
  warmth?: number;
};

type Blade = {
  x: number;
  height: number;
  /** How far the tip sits off the root at rest, in pixels. */
  bent: number;
  /** Lean of the tip under the wind, in pixels, and its speed. */
  lean: number;
  speed: number;
  stiffness: number;
  seed: number;
  /** 0 (back row, shorter and fainter) to 1. */
  depth: number;
};

export class Grass implements Layer {
  private blades: Blade[] = [];
  private readonly height: number;
  private readonly density: number;
  private readonly warmth: number;

  constructor(frame: WorldFrame, options: GrassOptions = {}) {
    this.height = options.height ?? 0.15;
    this.density = options.density ?? 1;
    this.warmth = options.warmth ?? 0.75;
    this.resize(frame);
  }

  resize(frame: WorldFrame) {
    const { spacing } = frame.grid;
    const tallest = clamp(frame.height * this.height, 44, 200);
    const blades: Blade[] = [];
    const columns = Math.ceil(frame.width / spacing) + 6;

    for (let row = 0; row < 2; row += 1) {
      const depth = row === 0 ? 0.42 : 1;
      for (let column = -3; column < columns; column += 1) {
        // Not every column grows a blade: a meadow has gaps.
        if (hash2(column, row, 11) > this.density * (row === 0 ? 0.42 : 0.6)) {
          continue;
        }
        const x = (column + hash2(column, row, 12)) * spacing;
        // Slow noise sets the lie of the land, fast noise the tufts, and a
        // few blades stand well above their neighbours.
        const land = noise2(x * 0.0026, row * 7.3, 3);
        const tuft = noise2(x * 0.024, row * 3.1, 4);
        const reach = hash2(column, row, 13);
        const height =
          tallest *
          (0.2 +
            0.42 * land +
            0.3 * tuft * tuft +
            0.5 * reach * reach * reach) *
          (0.5 + 0.5 * depth);
        blades.push({
          x,
          height,
          // Each blade has grown its own way.
          bent: (hash2(column, row, 16) - 0.5) * height * 0.7,
          lean: 0,
          speed: 0,
          stiffness: 22 + 22 * hash2(column, row, 14),
          seed: hash2(column, row, 15) * 40,
          depth,
        });
      }
    }
    // Back row first, so the front one draws over it.
    this.blades = blades.sort((a, b) => a.depth - b.depth);
  }

  step(frame: WorldFrame, dt: number) {
    const { time, pointer, height } = frame;
    for (const blade of this.blades) {
      // A gust front crossing the meadow, plus each blade's own flutter.
      const gust =
        noise2(blade.x * 0.0021 - time * 0.32, time * 0.07, 5) - 0.42;
      const flutter = Math.sin(time * 2.6 + blade.seed) * 0.05;
      let target = (gust * 0.62 + flutter) * blade.height;

      if (pointer.presence > 0) {
        const dx = blade.x - pointer.x;
        const top = height - blade.height;
        const reach = 110;
        // Only when the pointer is down among the blades.
        const low = clamp01((pointer.y - top + 50) / 60);
        if (low > 0 && Math.abs(dx) < reach) {
          const near = 1 - Math.abs(dx) / reach;
          target +=
            (Math.sign(dx || 1) * 26 + clamp(pointer.vx, -900, 900) * 0.035) *
            near *
            near *
            low *
            pointer.presence;
        }
      }

      // A damped spring: the blade swings past its target, then settles.
      blade.speed += (target - blade.lean) * blade.stiffness * dt;
      blade.speed *= Math.exp(-5.2 * dt);
      blade.lean += blade.speed * dt;
    }
  }

  draw(frame: WorldFrame, presence: number) {
    const { grid, palette } = frame;
    const { ink, accent, accent2, bg } = palette;
    const { spacing, originX } = grid;
    const groundRow = grid.rows - 1;

    for (const blade of this.blades) {
      // Leaving, the meadow sinks back into the ground.
      const tall = blade.height * presence;
      if (tall < spacing * 1.5) continue;
      const fog = (1 - blade.depth) * 0.6;
      const tint = this.warmth * (0.35 + 0.65 * hash2(blade.seed * 97, 3, 15));
      const lean = (blade.bent + blade.lean) * presence;
      const rows = Math.min(groundRow, Math.ceil(tall / spacing));

      // One cell per row, from the root up: a blade is a thin curve whose
      // cells shrink towards the tip.
      for (let step = 0; step <= rows; step += 1) {
        const t = Math.min(1, (step * spacing) / tall);
        const column = Math.round((blade.x + lean * t * t - originX) / spacing);
        // Root in the deep tone, tip in the bright one.
        const warm = t * t * tint;
        const stem = 0.3 + 0.7 * t;
        let r = ink[0] + (accent2[0] - ink[0]) * stem;
        let g = ink[1] + (accent2[1] - ink[1]) * stem;
        let b = ink[2] + (accent2[2] - ink[2]) * stem;
        r += (accent[0] - r) * warm;
        g += (accent[1] - g) * warm;
        b += (accent[2] - b) * warm;
        grid.plot(
          column,
          groundRow - step,
          (0.95 - 0.7 * t * t) * (0.5 + 0.5 * blade.depth),
          r + (bg[0] - r) * fog,
          g + (bg[1] - g) * fog,
          b + (bg[2] - b) * fog,
        );
      }
    }
  }
}
