import { CellGrid } from "./cells";
import type { GL } from "./gl";
import { MatrixLayer, type MatrixLight } from "./matrix-layer";
import type { Mood } from "./moods";
import { World, type WorldFrame, type WorldPointer } from "./world";

// One matrix: a grid of cells, the world that lives in it, and the texture
// and shader that draw it. The stage has two: the hero's, and the backdrop
// behind the rest of the page.

/** Pixels per second a pulse travels, and seconds it lasts. */
const PULSE_SPEED = 1500;
const PULSE_SECONDS = 1.5;

const noCalm = new Float32Array(32);

export class MatrixScene {
  readonly grid = new CellGrid();
  readonly world = new World();
  /** Whether cells were still easing at the last update. */
  moving = false;
  private readonly matrix: MatrixLayer;
  private readonly pulse: MatrixLight = { x: 0, y: 0, radius: 0, strength: 0 };
  private pulseAge = PULSE_SECONDS;
  private frame: WorldFrame;

  constructor(gl: GL, palette: Mood, pointer: WorldPointer) {
    this.matrix = new MatrixLayer(gl);
    this.frame = {
      grid: this.grid,
      width: 1,
      height: 1,
      time: 0,
      palette,
      pointer,
    };
  }

  resize(width: number, height: number, spacing: number) {
    this.grid.resize(width, height, spacing);
    this.frame.width = width;
    this.frame.height = height;
    this.world.resize(this.frame);
  }

  /** Sends a ring through the resting dots, from a point of the viewport. */
  startPulse(x: number, y: number) {
    this.pulse.x = x;
    this.pulse.y = y;
    this.pulseAge = 0;
  }

  get pulsing() {
    return this.pulseAge < PULSE_SECONDS;
  }

  /** Advances the world and settles the cells for this frame. */
  update(
    palette: Mood,
    pointer: WorldPointer,
    time: number,
    dt: number,
    still: boolean,
  ) {
    const { frame, grid, world } = this;
    frame.palette = palette;
    frame.pointer = pointer;
    frame.time = time;
    grid.wake = palette.pale;
    grid.begin();
    world.update(frame, dt, still);
    world.draw(frame);
    this.moving = grid.resolve(dt, still);

    if (this.pulseAge < PULSE_SECONDS) {
      this.pulseAge = still ? PULSE_SECONDS : this.pulseAge + dt;
      const life = Math.min(1, this.pulseAge / PULSE_SECONDS);
      this.pulse.radius = this.pulseAge * PULSE_SPEED;
      this.pulse.strength = (1 - life) * (1 - life);
    } else {
      this.pulse.strength = 0;
    }
  }

  /**
   * Draws into whatever framebuffer is bound. With `cover` under 1, only
   * that share of the screen is drawn, as a veil over what is there.
   */
  draw(
    mood: Mood,
    light: MatrixLight,
    halo: MatrixLight,
    time: number,
    pixelRatio: number,
    calm: Float32Array = noCalm,
    calmCount = 0,
    cover = 1,
  ) {
    this.matrix.upload(this.grid);
    this.matrix.draw(
      this.grid,
      mood,
      light,
      halo,
      time,
      pixelRatio,
      calm,
      calmCount,
      this.pulse,
      cover,
    );
  }

  dispose() {
    this.matrix.dispose();
  }
}
