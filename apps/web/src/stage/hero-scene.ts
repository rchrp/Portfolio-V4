import type { GL } from "./gl";
import { Grass } from "./layers/grass";
import { Hummingbirds } from "./layers/hummingbirds";
import { NameRelief, type ReliefRect } from "./layers/name-relief";
import type { MatrixLight } from "./matrix-layer";
import { MatrixScene } from "./matrix-scene";
import { clamp01, damp, smoothstep } from "./math";
import { cloneMood, goldenMood, type Mood } from "./moods";
import { PortraitLayer } from "./portrait-layer";
import type { Scene, WorldPointer } from "./world";

// The hero: a meadow at golden hour, hummingbirds, a first name standing in
// relief in the matrix, and the portrait. It is a scene of its own, with its
// own grid, so that it can be drawn either straight to the screen or into a
// picture: scrolling away from it, the whole hero shrinks into a card and
// takes its place among the projects.

/** Seconds the hero takes to arrive when the page opens. */
const INTRO_SECONDS = 3.2;
/** Seconds to wait for the photograph and the type before starting anyway. */
const PATIENCE_SECONDS = 2.5;

export type HeroSurface = {
  texture: WebGLTexture;
  width: number;
  height: number;
};

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
  private readonly halo: MatrixLight = { x: 0, y: 0, radius: 1, strength: 0 };
  private readonly framebuffer: WebGLFramebuffer | null;
  private readonly texture: WebGLTexture | null;
  private textureWidth = 0;
  private textureHeight = 0;
  private width = 1;
  private height = 1;
  private waited = 0;
  private started = false;
  private nextBeat = 0.2;
  private readonly arrived: Scene;

  constructor(
    private readonly gl: GL,
    firstName: string,
  ) {
    this.matrix = new MatrixScene(gl, this.mood, absent);
    this.portrait = new PortraitLayer(gl);
    this.relief = new NameRelief({
      text: firstName,
      rect: () => this.nameRect,
      rise: () => smoothstep(0, 0.5, this.intro),
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

    this.framebuffer = gl.createFramebuffer();
    this.texture = gl.createTexture();
  }

  resize(width: number, height: number, spacing: number, pixelRatio: number) {
    const { gl } = this;
    this.width = width;
    this.height = height;
    this.matrix.resize(width, height, spacing);
    this.relief.resize();

    const textureWidth = Math.round(width * pixelRatio);
    const textureHeight = Math.round(height * pixelRatio);
    if (
      textureWidth === this.textureWidth &&
      textureHeight === this.textureHeight
    ) {
      return;
    }
    this.textureWidth = textureWidth;
    this.textureHeight = textureHeight;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      textureWidth,
      textureHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    // Mipmapped: shrunk into a card, the fine grid must not shimmer.
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** The hero as a picture, once it has been drawn into one. */
  get surface(): HeroSurface | null {
    return this.texture && this.textureWidth > 0
      ? {
          texture: this.texture,
          width: this.textureWidth,
          height: this.textureHeight,
        }
      : null;
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

  /**
   * Advances the hero. `pointer` is the visitor's, or absent while the hero
   * is only a card.
   */
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
    this.portrait.draw(this.width, this.height, this.mood, lamp, pixelRatio);
  }

  /** Draws the hero into its own picture, for the card it becomes. */
  drawToTexture(time: number, pixelRatio: number) {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.textureWidth, this.textureHeight);
    this.draw(null, time, pixelRatio);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose() {
    const { gl } = this;
    this.matrix.dispose();
    this.portrait.dispose();
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteTexture(this.texture);
  }
}
