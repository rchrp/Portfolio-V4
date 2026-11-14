import type { GL } from "./gl";
import { Grass } from "./layers/grass";
import { Hummingbirds } from "./layers/hummingbirds";
import { NameRelief, type ReliefRect } from "./layers/name-relief";
import type { MatrixLight } from "./matrix-layer";
import { MatrixScene } from "./matrix-scene";
import { clamp01, damp, smoothstep } from "./math";
import { cloneMood, goldenMood, type Mood } from "./moods";
import { NameFace } from "./name-face";
import { PortraitLayer } from "./portrait-layer";
import type { Scene, WorldPointer } from "./world";

// The hero: a meadow at golden hour, hummingbirds, a first name standing in
// relief in the matrix, and the portrait. It is a scene of its own, with its
// own grid: when the page scrolls on, it stays where it is and the stage
// draws the backdrop over it, block by block (see `MatrixLayer`'s veil).

/** Seconds the hero takes to arrive when the page opens. */
const INTRO_SECONDS = 3.2;
/** Seconds to wait for the photograph and the type before starting anyway. */
const PATIENCE_SECONDS = 2.5;

const absent: WorldPointer = { x: 0, y: 0, vx: 0, vy: 0, presence: 0 };
const dark: MatrixLight = { x: 0, y: 0, radius: 1, strength: 0 };

export class HeroScene {
  readonly matrix: MatrixScene;
  readonly portrait: PortraitLayer;
  readonly mood: Mood = cloneMood(goldenMood);
  /** Where the first name stands; set by the page. */
  nameRect: ReliefRect | null = null;
  /** 0 as the page opens, 1 once the hero has arrived. */
  intro = 0;

  private readonly relief: NameRelief;
  private readonly face: NameFace;
  private readonly halo: MatrixLight = { x: 0, y: 0, radius: 1, strength: 0 };
  private width = 1;
  private height = 1;
  private waited = 0;
  private started = false;
  private nextBeat = 0.2;
  private readonly arrived: Scene;

  constructor(gl: GL, firstName: string) {
    this.matrix = new MatrixScene(gl, this.mood, absent);
    this.portrait = new PortraitLayer(gl);
    this.face = new NameFace(gl);
    this.relief = new NameRelief({
      text: firstName,
      rect: () => this.nameRect,
      rise: () => this.rise,
    });
    const relief = { key: "hero-relief", create: () => this.relief };
    // The letters are measured from the start; the meadow and the birds
    // come with the arrival.
    this.matrix.world.setScene([relief]);
    this.arrived = [
      relief,
      {
        key: "hero-grass",
        create: (frame) => new Grass(frame, { height: 0.14 }),
      },
      { key: "hero-birds", create: (frame) => new Hummingbirds(frame) },
    ];
  }

  /** How far the first name has risen out of the matrix, 0 to 1. */
  private get rise() {
    return smoothstep(0, 0.5, this.intro);
  }

  resize(width: number, height: number, spacing: number) {
    this.width = width;
    this.height = height;
    this.matrix.resize(width, height, spacing);
    this.relief.resize();
  }

  /** Whether something in the hero is moving. */
  get busy() {
    return (
      this.intro < 1 ||
      this.portrait.busy ||
      this.matrix.moving ||
      this.matrix.world.active
    );
  }

  /** Advances the hero. `pointer` is the visitor's, when there is one. */
  update(
    pointer: WorldPointer | null,
    time: number,
    dt: number,
    still: boolean,
  ) {
    const { portrait, matrix } = this;

    // The hero arrives once its photograph and its type are there, or after
    // a wait: a slow connection must not hold the page.
    if (!this.started) {
      this.waited += dt;
      const ready = portrait.ready && this.relief.ready;
      if (still || ready || this.waited > PATIENCE_SECONDS) {
        this.started = true;
        matrix.world.setScene(this.arrived);
        const face = portrait.face;
        matrix.startPulse(
          face.x || this.width * 0.7,
          face.y || this.height * 0.4,
        );
      } else if (this.waited > this.nextBeat) {
        // Waiting: a slow heartbeat through the resting dots.
        this.nextBeat += 1.3;
        matrix.startPulse(this.width / 2, this.height / 2);
      }
    }
    if (this.started && this.intro < 1) {
      this.intro = still ? 1 : clamp01(this.intro + dt / INTRO_SECONDS);
    }
    portrait.arrival = still ? 1 : clamp01((this.intro - 0.1) / 0.9);

    const visitor = pointer ?? absent;
    matrix.update(this.mood, visitor, time, dt, still);
    portrait.update(matrix.grid, visitor, this.mood, dt, still);

    // A pool of warm light behind the head.
    const face = portrait.face;
    this.halo.x = face.x;
    this.halo.y = face.y;
    this.halo.radius = Math.max(this.width, this.height) * 0.42;
    const glow = portrait.ready ? this.intro : 0;
    this.halo.strength = still ? glow : damp(this.halo.strength, glow, 3, dt);
  }

  /** Draws the hero into whatever framebuffer is bound. */
  draw(
    light: MatrixLight | null,
    time: number,
    pixelRatio: number,
    calm?: Float32Array,
    calmCount = 0,
  ) {
    const lamp = light ?? dark;
    this.matrix.draw(
      this.mood,
      lamp,
      this.halo,
      time,
      pixelRatio,
      calm,
      calmCount,
    );
    // The name's face lies on the cells of its sides; the portrait stands
    // in front of both.
    this.face.draw(
      this.relief.setting,
      this.rise,
      this.matrix.grid,
      this.mood,
      pixelRatio,
    );
    this.portrait.draw(this.width, this.height, this.mood, lamp, pixelRatio);
  }

  dispose() {
    this.matrix.dispose();
    this.face.dispose();
    this.portrait.dispose();
  }
}
