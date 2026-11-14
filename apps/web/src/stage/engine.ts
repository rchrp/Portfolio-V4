import { CardsLayer } from "./cards-layer";
import { CellGrid } from "./cells";
import type { GL } from "./gl";
import { CALM_ZONES, MatrixLayer, type MatrixLight } from "./matrix-layer";
import { clamp, damp, damping } from "./math";
import { approachMood, cloneMood, quietMood, type Mood } from "./moods";
import { PortraitLayer } from "./portrait-layer";
import { World, type Scene, type WorldFrame, type WorldPointer } from "./world";

// The stage: one canvas fixed behind the whole page, one WebGL context, one
// loop. It owns the matrix (cells, figures, portrait) and whatever else is
// drawn into the same canvas; the page tells it what to show through small
// setters and through directors, callbacks run at the start of every frame
// to translate the scroll position into a scene.

export type Director = (stage: StageEngine, dt: number) => void;

/** Something else drawn in the stage's canvas, after the matrix. */
export interface StageLayer {
  /** Returns whether it is animating and needs the next frame at full rate. */
  draw(stage: StageEngine, dt: number): boolean;
  dispose(): void;
}

const MAX_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 1;

export class StageEngine {
  readonly gl: GL;
  readonly grid = new CellGrid();
  readonly world = new World();
  readonly portrait: PortraitLayer;
  /** Pictures drawn over the matrix: covers, screenshots. */
  readonly cards: CardsLayer;
  private readonly matrix: MatrixLayer;
  private readonly layers: StageLayer[] = [];
  private readonly directors = new Set<Director>();

  /** Viewport size, in CSS pixels. */
  width = 0;
  height = 0;
  pixelRatio = 1;
  /** Seconds since the stage started. */
  time = 0;
  /** Reduced motion: frames are drawn on demand, nothing animates. */
  still: boolean;

  /** Current mood: eases towards the one last set. */
  readonly mood: Mood = cloneMood(quietMood);
  private moodTarget: Mood = quietMood;
  private moodSettled = false;
  private readonly mixed: Mood = cloneMood(quietMood);
  private mixKey = "";
  private mixFrom: Mood | null = null;
  private mixTo: Mood | null = null;

  readonly pointer: WorldPointer = { x: 0, y: 0, vx: 0, vy: 0, presence: 0 };
  /** Where the pointer's light is: it trails the pointer a little. */
  readonly light: MatrixLight = { x: 0, y: 0, radius: 260, strength: 0 };
  /** 0 to 1: lets the page dim the pointer's light. */
  lightAmount = 1;
  readonly halo: MatrixLight = { x: 0, y: 0, radius: 1, strength: 0 };
  private haloTarget: MatrixLight = { x: 0, y: 0, radius: 1, strength: 0 };

  private rawX = 0;
  private rawY = 0;
  private pointerInside = false;
  private pointerSeen = false;
  private pointerMovedAt = -10;

  private frameHandle = 0;
  private lastFrameAt = 0;
  private running = false;
  private disposed = false;
  private pendingStill = false;
  private gridMoving = false;
  private layersMoving = false;
  private skipped = false;
  // Boxes of text the figures fade behind: elements marked `data-calm`.
  private calmElements: HTMLElement[] = [];
  private calmQueriedAt = -1;
  private readonly calm = new Float32Array(CALM_ZONES * 4);
  private calmCount = 0;
  private awakeUntil = 0;

  // Adaptive resolution: measured over a window of frames.
  private maxPixelRatio = MAX_PIXEL_RATIO;
  private slowFrames = 0;
  private sampledFrames = 0;

  private readonly reducedMotion: MediaQueryList;
  private readonly resizeObserver: ResizeObserver;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.matrix = new MatrixLayer(gl);
    this.portrait = new PortraitLayer(gl);
    this.cards = new CardsLayer(this);

    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.still = this.reducedMotion.matches;
    this.reducedMotion.addEventListener("change", this.onMotionPreference);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    window.addEventListener("pointermove", this.onPointerMove, {
      passive: true,
    });
    window.addEventListener("pointerdown", this.onPointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", this.onPointerUp, { passive: true });
    window.addEventListener("pointercancel", this.onPointerLeave);
    document.documentElement.addEventListener(
      "pointerleave",
      this.onPointerLeave,
    );
    window.addEventListener("blur", this.onPointerLeave);
    window.addEventListener("scroll", this.invalidate, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);

    this.resize();
    this.start();
  }

  // -- What the page asks for ------------------------------------------------

  setMood(mood: Mood) {
    if (mood === this.moodTarget) return;
    this.moodTarget = mood;
    this.mixKey = "";
    this.moodSettled = false;
    this.invalidate();
  }

  /** A mood part of the way between two others, as the scroll would set. */
  setMoodMix(from: Mood, to: Mood, amount: number) {
    if (amount <= 0.001) return this.setMood(from);
    if (amount >= 0.999) return this.setMood(to);
    const key = `${amount.toFixed(3)}`;
    if (key === this.mixKey && from === this.mixFrom && to === this.mixTo) {
      return;
    }
    this.mixKey = key;
    this.mixFrom = from;
    this.mixTo = to;
    approachMood(this.mixed, from, 1);
    approachMood(this.mixed, to, amount);
    this.moodTarget = this.mixed;
    this.moodSettled = false;
    this.invalidate();
  }

  setScene(scene: Scene | null) {
    this.world.setScene(scene);
    this.invalidate();
  }

  /** The scene's own pool of light: where, how wide, how strong (0 to 1). */
  setHalo(x: number, y: number, radius: number, strength: number) {
    this.haloTarget = { x, y, radius, strength };
  }

  /** Runs `director` at the start of every frame. Returns how to remove it. */
  direct(director: Director) {
    this.directors.add(director);
    this.invalidate();
    return () => {
      this.directors.delete(director);
    };
  }

  addLayer(layer: StageLayer) {
    this.layers.push(layer);
    this.invalidate();
    return () => {
      const index = this.layers.indexOf(layer);
      if (index >= 0) this.layers.splice(index, 1);
      layer.dispose();
    };
  }

  /** Keeps the full frame rate for a moment: something is animating. */
  wake(seconds = 0.4) {
    this.awakeUntil = Math.max(this.awakeUntil, this.time + seconds);
  }

  /** Asks for a frame: needed in still mode, harmless otherwise. */
  invalidate = () => {
    if (!this.still || this.pendingStill || this.disposed) return;
    this.pendingStill = true;
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  // -- Loop ------------------------------------------------------------------

  private start() {
    if (this.running || this.disposed || document.hidden) return;
    this.running = true;
    this.lastFrameAt = performance.now();
    if (this.still) this.invalidate();
    else this.frameHandle = requestAnimationFrame(this.frame);
  }

  private stop() {
    this.running = false;
    this.pendingStill = false;
    cancelAnimationFrame(this.frameHandle);
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.pendingStill = false;
    if (!this.still) this.frameHandle = requestAnimationFrame(this.frame);

    const elapsed = now - this.lastFrameAt;
    // With nothing but the resting dots breathing, every other frame is
    // plenty: the page keeps its full rate for scrolling.
    const calm =
      !this.still &&
      !this.gridMoving &&
      !this.layersMoving &&
      !this.world.active &&
      !this.portrait.busy &&
      this.moodSettled &&
      this.time > this.awakeUntil &&
      this.time - this.pointerMovedAt > 1.2;
    if (calm && !this.skipped && elapsed < 30) {
      this.skipped = true;
      return;
    }
    this.skipped = false;
    this.lastFrameAt = now;
    const dt = this.still ? 0 : clamp(elapsed / 1000, 0.001, 0.05);
    this.time += dt;
    this.measure(elapsed, calm);

    for (const director of this.directors) director(this, dt);
    this.updatePointer(dt);
    this.updateMood(dt);

    const { grid, world, portrait, mood } = this;
    const worldFrame: WorldFrame = {
      grid,
      width: this.width,
      height: this.height,
      time: this.time,
      palette: mood,
      pointer: this.pointer,
    };
    grid.wake = mood.pale;
    grid.begin();
    world.update(worldFrame, dt, this.still);
    world.draw(worldFrame);
    portrait.update(grid, this.pointer, mood, this.time, dt, this.still);
    this.gridMoving = grid.resolve(dt, this.still);

    const { gl } = this;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.matrix.upload(grid);
    this.updateCalm();
    this.matrix.draw(
      grid,
      mood,
      this.light,
      this.halo,
      this.time,
      this.pixelRatio,
      this.calm,
      this.calmCount,
    );
    portrait.draw(this.width, this.height, mood, this.light, this.pixelRatio);
    let moving = this.cards.draw(this, dt);
    for (const layer of this.layers) {
      if (layer.draw(this, dt)) moving = true;
    }
    this.layersMoving = moving;
  };

  // Finds where the page's text currently sits, so the matrix can keep
  // clear of it. The list of elements is refreshed twice a second.
  private updateCalm() {
    const now = performance.now();
    if (now - this.calmQueriedAt > 500) {
      this.calmQueriedAt = now;
      this.calmElements = Array.from(
        document.querySelectorAll<HTMLElement>("[data-calm]"),
      );
    }
    const { calm, pixelRatio } = this;
    let count = 0;
    for (const element of this.calmElements) {
      if (count >= CALM_ZONES) break;
      const bounds = element.getBoundingClientRect();
      if (
        bounds.width === 0 ||
        bounds.bottom < -80 ||
        bounds.top > this.height + 80
      ) {
        continue;
      }
      calm[count * 4] = bounds.left * pixelRatio;
      calm[count * 4 + 1] = bounds.top * pixelRatio;
      calm[count * 4 + 2] = bounds.right * pixelRatio;
      calm[count * 4 + 3] = bounds.bottom * pixelRatio;
      count += 1;
    }
    this.calmCount = count;
  }

  private updatePointer(dt: number) {
    const { pointer, light } = this;
    if (this.still) {
      pointer.presence = 0;
      light.strength = 0;
      return;
    }
    const follow = damping(22, dt);
    const previousX = pointer.x;
    const previousY = pointer.y;
    pointer.x += (this.rawX - pointer.x) * follow;
    pointer.y += (this.rawY - pointer.y) * follow;
    // Speed is smoothed too: one late event must not read as a jolt.
    const blend = damping(14, dt);
    pointer.vx += ((pointer.x - previousX) / dt - pointer.vx) * blend;
    pointer.vy += ((pointer.y - previousY) / dt - pointer.vy) * blend;
    pointer.presence = damp(
      pointer.presence,
      this.pointerInside ? 1 : 0,
      this.pointerInside ? 9 : 5,
      dt,
    );
    if (pointer.presence < 0.004) pointer.presence = 0;

    const trail = damping(7.5, dt);
    light.x += (this.rawX - light.x) * trail;
    light.y += (this.rawY - light.y) * trail;
    light.radius = clamp(Math.min(this.width, this.height) * 0.3, 170, 320);
    light.strength = pointer.presence * this.lightAmount;

    const ease = damping(4, dt);
    const halo = this.halo;
    const target = this.haloTarget;
    halo.x = target.x;
    halo.y = target.y;
    halo.radius = target.radius;
    halo.strength += (target.strength - halo.strength) * ease;
  }

  private updateMood(dt: number) {
    if (this.moodSettled) return;
    if (this.still) {
      approachMood(this.mood, this.moodTarget, 1);
      this.moodSettled = true;
      return;
    }
    approachMood(this.mood, this.moodTarget, damping(3.2, dt));
    const { bg, rest, accent } = this.mood;
    const target = this.moodTarget;
    const distance =
      Math.abs(bg[0] - target.bg[0]) +
      Math.abs(bg[1] - target.bg[1]) +
      Math.abs(bg[2] - target.bg[2]) +
      Math.abs(rest[0] - target.rest[0]) +
      Math.abs(accent[0] - target.accent[0]) +
      Math.abs(accent[2] - target.accent[2]) +
      Math.abs(this.mood.haloAmount - target.haloAmount) * 100;
    if (distance < 0.35) {
      approachMood(this.mood, target, 1);
      this.moodSettled = true;
    }
  }

  // Lowers the resolution when frames keep coming in late: sharpness is the
  // cheapest thing to give up, and squares survive it well.
  private measure(elapsed: number, calm: boolean) {
    if (this.still || calm || document.hidden) return;
    this.sampledFrames += 1;
    if (elapsed > 24) this.slowFrames += 1;
    if (this.sampledFrames < 90) return;
    const share = this.slowFrames / this.sampledFrames;
    this.sampledFrames = 0;
    this.slowFrames = 0;
    if (share > 0.4 && this.maxPixelRatio > MIN_PIXEL_RATIO) {
      this.maxPixelRatio = Math.max(MIN_PIXEL_RATIO, this.maxPixelRatio - 0.5);
      this.resize();
    }
  }

  // -- Environment -----------------------------------------------------------

  private resize() {
    if (this.disposed) return;
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      this.maxPixelRatio,
    );
    if (
      width === this.width &&
      height === this.height &&
      pixelRatio === this.pixelRatio
    ) {
      return;
    }
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    // Denser than the eye can count, coarse enough to read as squares.
    const spacing = width < 560 ? 5 : width < 1800 ? 6 : 7;
    this.grid.resize(width, height, spacing);
    this.world.resize({
      grid: this.grid,
      width,
      height,
      time: this.time,
      palette: this.mood,
      pointer: this.pointer,
    });
    if (!this.pointerSeen) {
      this.rawX = this.light.x = this.pointer.x = width * 0.5;
      this.rawY = this.light.y = this.pointer.y = height * 0.4;
    }
    this.invalidate();
  }

  private onPointerMove = (event: PointerEvent) => {
    // A finger scrolls: it carries no light, and brushes nothing.
    if (event.pointerType === "touch") return;
    this.rawX = event.clientX;
    this.rawY = event.clientY;
    if (!this.pointerSeen) {
      this.pointerSeen = true;
      this.pointer.x = this.light.x = this.rawX;
      this.pointer.y = this.light.y = this.rawY;
    }
    this.pointerInside = true;
    this.pointerMovedAt = this.time;
  };

  private onPointerUp = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") this.pointerInside = false;
  };

  private onPointerLeave = () => {
    this.pointerInside = false;
    this.pointerMovedAt = this.time;
  };

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private onMotionPreference = (event: MediaQueryListEvent) => {
    this.stop();
    this.still = event.matches;
    this.start();
  };

  dispose() {
    this.disposed = true;
    this.stop();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    this.resizeObserver.disconnect();
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerLeave);
    document.documentElement.removeEventListener(
      "pointerleave",
      this.onPointerLeave,
    );
    window.removeEventListener("blur", this.onPointerLeave);
    window.removeEventListener("scroll", this.invalidate);
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const layer of this.layers.splice(0)) layer.dispose();
    this.cards.dispose();
    this.portrait.dispose();
    this.matrix.dispose();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
