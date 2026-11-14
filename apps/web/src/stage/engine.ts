import { CardsLayer } from "./cards-layer";
import { GlassLayer } from "./glass-layer";
import type { GL } from "./gl";
import { HeroScene } from "./hero-scene";
import { CALM_ZONES, type MatrixLight } from "./matrix-layer";
import { MatrixScene } from "./matrix-scene";
import { clamp, damp, damping } from "./math";
import { approachMood, cloneMood, quietMood, type Mood } from "./moods";
import type { Scene, WorldPointer } from "./world";

// The stage: one canvas fixed behind the whole page, one WebGL context, one
// loop. It draws two matrices and the pictures over them:
//
// - the hero, a scene of its own (meadow, birds, the name in relief, the
//   portrait), which fills the screen at the top of the page;
// - the backdrop, the matrix behind everything else. When the page scrolls
//   on, it is drawn over the hero as a veil that closes block by block.
//
// The page tells the stage what to show through small setters and through
// directors, callbacks run at the start of every frame that translate the
// scroll position into a scene.

export type Director = (stage: StageEngine, dt: number) => void;

/** Something else drawn in the stage's canvas, after everything. */
export interface StageLayer {
  /** Returns whether it is animating and needs the next frame at full rate. */
  draw(stage: StageEngine, dt: number): boolean;
  dispose(): void;
}

/**
 * How the hero is shown: filling the screen, being covered by the backdrop,
 * or not at all.
 */
export type HeroMode = "full" | "leaving" | "hidden";

const MAX_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 1;

export class StageEngine {
  readonly gl: GL;
  /** The matrix behind the page. */
  readonly backdrop: MatrixScene;
  readonly hero: HeroScene;
  /** Pictures drawn over the matrix: covers and screenshots. */
  readonly cards: CardsLayer;
  /** Liquid glass under the page's floating controls. */
  private readonly glass: GlassLayer;
  heroMode: HeroMode = "full";
  /** While the hero is leaving: how much of it the backdrop has covered. */
  heroLeave = 0;
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

  /** The backdrop's mood: eases towards the one last set. */
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
  private readonly noHalo: MatrixLight = { x: 0, y: 0, radius: 1, strength: 0 };

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

  constructor(
    readonly canvas: HTMLCanvasElement,
    firstName: string,
  ) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.backdrop = new MatrixScene(gl, this.mood, this.pointer);
    this.hero = new HeroScene(gl, firstName);
    this.cards = new CardsLayer(this);
    this.glass = new GlassLayer(gl);

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
    // Any scrolling box: the page, or a project's own.
    document.addEventListener("scroll", this.invalidate, {
      capture: true,
      passive: true,
    });
    document.addEventListener("visibilitychange", this.onVisibility);

    this.resize();
    this.start();
  }

  // -- What the page asks for ------------------------------------------------

  /** The backdrop's cells: their spacing is the matrix's everywhere. */
  get grid() {
    return this.backdrop.grid;
  }

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

  /** What lives in the backdrop. */
  setScene(scene: Scene | null) {
    this.backdrop.world.setScene(scene);
    this.invalidate();
  }

  /** Sends a ring through the matrix currently on screen. */
  pulse(x: number, y: number) {
    if (this.still) return;
    (this.heroMode === "full" ? this.hero.matrix : this.backdrop).startPulse(
      x,
      y,
    );
    this.wake(1.6);
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
      this.heroMode === "hidden" &&
      !this.backdrop.moving &&
      !this.backdrop.world.active &&
      !this.backdrop.pulsing &&
      !this.layersMoving &&
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
    this.updateCalm();

    const { gl, hero, backdrop, heroMode, time, pixelRatio } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    if (heroMode !== "hidden") {
      hero.update(this.pointer, time, dt, this.still);
      hero.draw(this.light, time, pixelRatio, this.calm, this.calmCount);
    }
    if (heroMode !== "full") {
      backdrop.update(this.mood, this.pointer, time, dt, this.still);
      backdrop.draw(
        this.mood,
        this.light,
        this.noHalo,
        time,
        pixelRatio,
        this.calm,
        this.calmCount,
        heroMode === "leaving" ? this.heroLeave : 1,
      );
    }

    let moving = this.cards.draw(this, dt);
    for (const layer of this.layers) {
      if (layer.draw(this, dt)) moving = true;
    }
    this.glass.draw(this);
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
        bounds.top > this.height + 80 ||
        // Text that is hidden or faded out keeps nothing clear.
        element.checkVisibility?.({
          opacityProperty: true,
          visibilityProperty: true,
        }) === false
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
    light.strength = pointer.presence;
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
      Math.abs(accent[2] - target.accent[2]);
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
    this.backdrop.resize(width, height, spacing);
    this.hero.resize(width, height, spacing);
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
    document.removeEventListener("scroll", this.invalidate, { capture: true });
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const layer of this.layers.splice(0)) layer.dispose();
    this.cards.dispose();
    this.glass.dispose();
    this.hero.dispose();
    this.backdrop.dispose();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
