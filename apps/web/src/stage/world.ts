import type { CellGrid } from "./cells";
import { damp, type RGB } from "./math";

// What lives in the matrix: a scene is a handful of layers (a meadow, a few
// butterflies, a pond of koi…) simulated in viewport pixels and drawn into
// the cells. Changing scene never cuts: the layers of the old one shrink back
// into the grid while those of the new one grow out of it.

/** Colours the layers draw with; they follow the mood of the page. */
export type Palette = {
  /** The paper, to fade distant figures into. */
  bg: RGB;
  /** Darkest tone: bodies, outlines, stems. */
  ink: RGB;
  /** Main colour of the figures. */
  accent: RGB;
  /** A deeper companion of the accent. */
  accent2: RGB;
  /** Highlights. */
  pale: RGB;
};

export type WorldPointer = {
  x: number;
  y: number;
  /** Pixels per second. */
  vx: number;
  vy: number;
  /** 0 when there is no pointer (touch screens, pointer outside). */
  presence: number;
};

export type WorldFrame = {
  grid: CellGrid;
  width: number;
  height: number;
  /** Seconds since the stage started. */
  time: number;
  palette: Palette;
  pointer: WorldPointer;
};

export interface Layer {
  /** Advances the simulation by `dt` seconds. */
  step(frame: WorldFrame, dt: number): void;
  /** Draws into the cells; `presence` runs from 0 (gone) to 1. */
  draw(frame: WorldFrame, presence: number): void;
  /** The viewport changed size. */
  resize?(frame: WorldFrame): void;
}

/** One layer of a scene. Layers with the same key are the same layer. */
export type LayerSpec = {
  key: string;
  create: (frame: WorldFrame) => Layer;
};

/**
 * A scene is the list of layers that should be alive. Moving to another
 * scene keeps the layers both have, so a meadow can lose its grass and keep
 * its butterflies.
 */
export type Scene = readonly LayerSpec[];

type Slot = { key: string; layer: Layer; presence: number; target: number };

/** Simulation step, in seconds; frames run as many as they span. */
const STEP = 1 / 60;
const MAX_STEPS = 4;

const empty: Scene = [];

export class World {
  private slots: Slot[] = [];
  private scene: Scene = empty;
  private pending: LayerSpec[] = [];
  private accumulator = 0;

  setScene(scene: Scene | null) {
    const next = scene ?? empty;
    if (next === this.scene) return;
    this.scene = next;
    for (const slot of this.slots) {
      slot.target = next.some((spec) => spec.key === slot.key) ? 1 : 0;
    }
    this.pending = next.filter(
      (spec) => !this.slots.some((slot) => slot.key === spec.key),
    );
  }

  resize(frame: WorldFrame) {
    for (const slot of this.slots) slot.layer.resize?.(frame);
  }

  /** Whether anything is alive, moving or fading. */
  get active() {
    return this.slots.length > 0 || this.pending.length > 0;
  }

  update(frame: WorldFrame, dt: number, still = false) {
    for (const spec of this.pending) {
      const layer = spec.create(frame);
      // A still picture shows the scene settled, not its first instant.
      if (still) {
        for (let elapsed = 0; elapsed < 5; elapsed += STEP) {
          layer.step(frame, STEP);
        }
      }
      this.slots.push({ key: spec.key, layer, presence: 0, target: 1 });
    }
    this.pending = [];

    for (const slot of this.slots) {
      slot.presence = still
        ? slot.target
        : damp(slot.presence, slot.target, slot.target > 0 ? 2.2 : 3.4, dt);
    }
    this.slots = this.slots.filter(
      (slot) => slot.target > 0 || slot.presence > 0.01,
    );

    this.accumulator = Math.min(this.accumulator + dt, STEP * MAX_STEPS);
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      for (const slot of this.slots) slot.layer.step(frame, STEP);
    }
  }

  draw(frame: WorldFrame) {
    for (const slot of this.slots) slot.layer.draw(frame, slot.presence);
  }
}
