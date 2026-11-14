import {
  TAU,
  angleDelta,
  clamp,
  clamp01,
  damping,
  noise2,
  randomBetween,
  smoothstep,
} from "../math";
import type { Layer, WorldFrame } from "../world";

// Koi seen from above. Each fish is a chain of points that follows its head:
// the head wags as it swims, the wag travels down the chain, and the body is
// whatever lies within a tapering distance of that curve. Since the curve
// bends, the fish is rasterised from distances rather than from a fixed
// outline: every cell near the chain asks how far it is from the spine and
// how wide the fish is there.

export type KoiOptions = {
  count?: number;
  /** Body length of the closest fish, in pixels. */
  length?: number;
};

const JOINTS = 11;

type Koi = {
  /** x, y of each joint, head first. */
  spine: Float32Array;
  heading: number;
  speed: number;
  /** Position in the tail beat. */
  phase: number;
  depth: number;
  seed: number;
  /** 0: pale with patches, 1: all in the accent, 2: dark-backed. */
  coat: number;
  /** Seconds until this fish next troubles the surface. */
  nextRing: number;
};

type Ring = { x: number; y: number; age: number; life: number; reach: number };

// Half-width of the body along its length (0 at the nose, 1 at the tail
// tip), as a fraction of the length.
function girth(t: number) {
  if (t < 0.1) return 0.088 * Math.sqrt(t / 0.1);
  if (t < 0.34)
    return 0.088 + 0.012 * Math.sin(((t - 0.1) / 0.24) * (Math.PI / 2));
  if (t < 0.8) return 0.1 - 0.078 * smoothstep(0.34, 0.8, t);
  // The tail fin fans out.
  return 0.022 + 0.075 * ((t - 0.8) / 0.2);
}

export class KoiPond implements Layer {
  private shoal: Koi[] = [];
  private rings: Ring[] = [];
  private readonly length: number;

  constructor(frame: WorldFrame, options: KoiOptions = {}) {
    this.length = options.length ?? 270;
    const count =
      options.count ??
      Math.round(clamp((frame.width * frame.height) / 110000, 5, 13));
    for (let index = 0; index < count; index += 1) {
      const depth = 0.55 + 0.45 * Math.pow(index / Math.max(1, count - 1), 1.2);
      const heading = randomBetween(0, TAU);
      const x = randomBetween(frame.width * 0.1, frame.width * 0.9);
      const y = randomBetween(frame.height * 0.15, frame.height * 0.85);
      const spine = new Float32Array(JOINTS * 2);
      const segment = (this.lengthOf(depth, frame) / (JOINTS - 1)) * 1;
      for (let joint = 0; joint < JOINTS; joint += 1) {
        spine[joint * 2] = x - Math.cos(heading) * segment * joint;
        spine[joint * 2 + 1] = y - Math.sin(heading) * segment * joint;
      }
      this.shoal.push({
        spine,
        heading,
        speed: 0,
        phase: randomBetween(0, TAU),
        depth,
        seed: randomBetween(0, 60),
        coat: index % 4 === 3 ? 2 : index % 3 === 1 ? 1 : 0,
        nextRing: randomBetween(1, 6),
      });
    }
    // Deep ones first.
    this.shoal.sort((a, b) => a.depth - b.depth);
  }

  private lengthOf(depth: number, frame: WorldFrame) {
    const scale = clamp(Math.min(frame.width, frame.height) / 900, 0.6, 1.1);
    return this.length * scale * depth;
  }

  step(frame: WorldFrame, dt: number) {
    const { time, pointer, width, height } = frame;

    for (const koi of this.shoal) {
      const { spine } = koi;
      const length = this.lengthOf(koi.depth, frame);
      const cruise = 46 * (0.6 + 0.4 * koi.depth);
      let turn = (noise2(time * 0.11, koi.seed, 31) - 0.5) * 1.5;
      let hurry = 0;

      // Turned back towards the middle before reaching an edge.
      const margin = length * 0.9;
      const headX = spine[0];
      const headY = spine[1];
      const home = Math.atan2(height / 2 - headY, width / 2 - headX);
      const out = Math.max(
        clamp01((margin - headX) / margin),
        clamp01((headX - (width - margin)) / margin),
        clamp01((margin - headY) / margin),
        clamp01((headY - (height - margin)) / margin),
      );
      if (out > 0) turn += angleDelta(koi.heading, home) * out * 2.4;

      // A pointer coming close makes them veer off and dart.
      if (pointer.presence > 0) {
        const dx = headX - pointer.x;
        const dy = headY - pointer.y;
        const distance = Math.hypot(dx, dy);
        const reach = 150;
        if (distance < reach) {
          const fright = (1 - distance / reach) * pointer.presence;
          turn += angleDelta(koi.heading, Math.atan2(dy, dx)) * fright * 4;
          hurry = fright;
        }
      }

      koi.speed += (cruise * (1 + hurry * 2.4) - koi.speed) * damping(2.2, dt);
      koi.phase += dt * TAU * (0.55 + (koi.speed / cruise) * 0.5);
      koi.heading += turn * dt;
      // The head wags: this is what makes the body undulate.
      const wag = Math.sin(koi.phase) * 0.34;
      spine[0] += Math.cos(koi.heading + wag) * koi.speed * dt;
      spine[1] += Math.sin(koi.heading + wag) * koi.speed * dt;

      // Each joint is drawn along by the one before it.
      const segment = length / (JOINTS - 1);
      for (let joint = 1; joint < JOINTS; joint += 1) {
        const px = spine[(joint - 1) * 2];
        const py = spine[(joint - 1) * 2 + 1];
        const dx = spine[joint * 2] - px;
        const dy = spine[joint * 2 + 1] - py;
        const distance = Math.hypot(dx, dy) || 1;
        spine[joint * 2] = px + (dx / distance) * segment;
        spine[joint * 2 + 1] = py + (dy / distance) * segment;
      }

      koi.nextRing -= dt * (1 + hurry * 6);
      if (koi.nextRing <= 0) {
        koi.nextRing = randomBetween(3.5, 9);
        this.rings.push({
          x: spine[0],
          y: spine[1],
          age: 0,
          life: randomBetween(2.2, 3.4),
          reach: length * randomBetween(0.45, 0.8),
        });
      }
    }

    for (const ring of this.rings) ring.age += dt;
    this.rings = this.rings.filter((ring) => ring.age < ring.life);
  }

  draw(frame: WorldFrame, presence: number) {
    const { grid, palette } = frame;
    const { spacing, originX, originY } = grid;
    const { bg, ink, accent, accent2, pale } = palette;

    // Rings on the water, under the fish.
    for (const ring of this.rings) {
      const life = ring.age / ring.life;
      const radius = ring.reach * (1 - Math.pow(1 - life, 2));
      const strength = presence * 0.34 * (1 - life) * (1 - life);
      if (strength < 0.02) continue;
      const c0 = Math.max(
        0,
        Math.floor((ring.x - radius - originX) / spacing) - 1,
      );
      const c1 = Math.min(
        grid.cols - 1,
        Math.ceil((ring.x + radius - originX) / spacing) + 1,
      );
      const r0 = Math.max(
        0,
        Math.floor((ring.y - radius - originY) / spacing) - 1,
      );
      const r1 = Math.min(
        grid.rows - 1,
        Math.ceil((ring.y + radius - originY) / spacing) + 1,
      );
      for (let row = r0; row <= r1; row += 1) {
        const dy = originY + row * spacing - ring.y;
        for (let column = c0; column <= c1; column += 1) {
          const dx = originX + column * spacing - ring.x;
          const off = Math.abs(Math.sqrt(dx * dx + dy * dy) - radius);
          if (off > spacing * 0.75) continue;
          grid.plot(
            column,
            row,
            strength * (1 - off / (spacing * 0.75)),
            accent[0] + (pale[0] - accent[0]) * 0.5,
            accent[1] + (pale[1] - accent[1]) * 0.5,
            accent[2] + (pale[2] - accent[2]) * 0.5,
          );
        }
      }
    }

    for (const koi of this.shoal) {
      const { spine } = koi;
      const length = this.lengthOf(koi.depth, frame);
      const fog = (1 - koi.depth) * 0.75;
      const alpha = presence * (0.6 + 0.4 * koi.depth);
      const reach = length * 0.2;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let joint = 0; joint < JOINTS; joint += 1) {
        minX = Math.min(minX, spine[joint * 2]);
        maxX = Math.max(maxX, spine[joint * 2]);
        minY = Math.min(minY, spine[joint * 2 + 1]);
        maxY = Math.max(maxY, spine[joint * 2 + 1]);
      }
      const c0 = Math.max(0, Math.floor((minX - reach - originX) / spacing));
      const c1 = Math.min(
        grid.cols - 1,
        Math.ceil((maxX + reach - originX) / spacing),
      );
      const r0 = Math.max(0, Math.floor((minY - reach - originY) / spacing));
      const r1 = Math.min(
        grid.rows - 1,
        Math.ceil((maxY + reach - originY) / spacing),
      );
      // The pectoral fins open and close with the stroke.
      const stroke = 0.75 + 0.25 * Math.sin(koi.phase * 2 + 1);

      for (let row = r0; row <= r1; row += 1) {
        const py = originY + row * spacing;
        for (let column = c0; column <= c1; column += 1) {
          const px = originX + column * spacing;

          // Closest point of the spine: how far along, how far off, which side.
          let best = Infinity;
          let along = 0;
          let side = 0;
          for (let joint = 0; joint < JOINTS - 1; joint += 1) {
            const ax = spine[joint * 2];
            const ay = spine[joint * 2 + 1];
            const bx = spine[joint * 2 + 2] - ax;
            const by = spine[joint * 2 + 3] - ay;
            const wx = px - ax;
            const wy = py - ay;
            const t = clamp01((wx * bx + wy * by) / (bx * bx + by * by || 1));
            const dx = wx - bx * t;
            const dy = wy - by * t;
            const distance = dx * dx + dy * dy;
            if (distance < best) {
              best = distance;
              along = (joint + t) / (JOINTS - 1);
              side = bx * wy - by * wx;
            }
          }
          const off = Math.sqrt(best) / length;
          const half = girth(along);

          let level = 0;
          let r = 0;
          let g = 0;
          let b = 0;

          // How much of the cell the body covers, from its distance to the edge.
          const body = clamp01(((half - off) * length) / spacing + 0.5);
          // The tail fin is forked: a notch runs up its middle.
          const notch =
            along > 0.9 ? clamp01((off * length) / spacing - 0.2) : 1;
          if (body > 0 && notch > 0) {
            level = body * notch;
            const across = off / Math.max(half, 0.001);
            const patch = noise2(
              along * 5.2 + koi.seed,
              Math.sign(side) * across * 1.4 + koi.seed * 1.7,
              41,
            );
            let tone: readonly number[];
            if (along > 0.82) {
              // Fins are thinner than the body: paler, and lighter cells.
              tone = pale;
              level *= 0.62;
            } else if (koi.coat === 1) {
              tone = patch > 0.62 ? accent2 : accent;
            } else if (koi.coat === 2) {
              tone = patch > 0.5 ? ink : across < 0.45 ? accent2 : accent;
            } else {
              tone =
                patch > 0.56
                  ? accent
                  : patch < 0.2 && along < 0.5
                    ? accent2
                    : pale;
            }
            // A darker back gives the body its roundness.
            const shade = across < 0.3 && along < 0.8 ? 0.16 : 0;
            r = tone[0] + (ink[0] - tone[0]) * shade;
            g = tone[1] + (ink[1] - tone[1]) * shade;
            b = tone[2] + (ink[2] - tone[2]) * shade;
          } else if (along > 0.2 && along < 0.36) {
            // Pectoral fins, either side of the shoulders.
            const fin = clamp01(
              ((half +
                0.075 * stroke * (1 - Math.abs(along - 0.28) / 0.08) -
                off) *
                length) /
                spacing +
                0.5,
            );
            if (fin > 0) {
              level = fin * 0.5;
              r = pale[0];
              g = pale[1];
              b = pale[2];
            }
          }

          if (level <= 0.02) continue;
          grid.plot(
            column,
            row,
            level * alpha,
            r + (bg[0] - r) * fog,
            g + (bg[1] - g) * fog,
            b + (bg[2] - b) * fog,
          );
        }
      }

      // An eye on each side of the head, on the nearest fish.
      if (koi.depth > 0.75) {
        const dx = spine[0] - spine[2];
        const dy = spine[1] - spine[3];
        const distance = Math.hypot(dx, dy) || 1;
        const fx = dx / distance;
        const fy = dy / distance;
        for (const eye of [-1, 1]) {
          grid.plot(
            Math.round(
              (spine[2] +
                fx * length * 0.03 -
                fy * length * 0.062 * eye -
                originX) /
                spacing,
            ),
            Math.round(
              (spine[3] +
                fy * length * 0.03 +
                fx * length * 0.062 * eye -
                originY) /
                spacing,
            ),
            alpha,
            ink[0],
            ink[1],
            ink[2],
          );
        }
      }
    }
  }
}
