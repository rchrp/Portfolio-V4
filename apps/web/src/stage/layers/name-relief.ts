import { clamp01, damping, easeOutCubic, smoothstep, type RGB } from "../math";
import type { Layer, WorldFrame } from "../world";

// A word standing in the matrix, in relief. Its letters are drawn once, a
// few samples per cell; every frame, each cell is either under a letter's
// face, on the side the letter throws away from the light, or neither. The
// light is the pointer: move it and the relief turns, as a sundial's shadow
// would.
//
// The sides are always cells. The face is cells too when asked (`face`), or
// left to plain type set over the cells (see `name-face.ts`).
//
// The word may move with the page and may change: it is sampled again
// wherever it stands, and a new word rises in place of the old one.

export type ReliefRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ReliefOptions = {
  /** The word; a function when it changes over time. */
  text: string | (() => string);
  /** Where the word sits, in viewport pixels: it is fitted to the width. */
  rect: () => ReliefRect | null;
  /** 0: flat in the grid; 1: fully risen. Letters rise one after another. */
  rise: () => number;
  /**
   * What is fitted to the width instead of the word itself, so that words
   * of slightly different widths keep one size.
   */
  measure?: string;
  /** Draws the faces in cells of this size (0 to 1) instead of leaving them. */
  face?: number;
  /** Colours of the sides, against the face then away from it. */
  sides?: readonly [RGB, RGB];
};

/** How the word is set, for whoever draws its face over the sides. */
export type ReliefSetting = {
  text: string;
  family: string;
  /** In viewport pixels. */
  fontSize: number;
  /** Where the text starts, and its baseline. */
  x: number;
  baseline: number;
  /** The cells the word and its sides can reach. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Changes whenever the word is set again. */
  version: number;
};

/** How far a letter has risen, from the word's rise and where it stands. */
export const letterRise = (rise: number, across: number) =>
  smoothstep(0, 1, rise * 1.7 - across * 0.7);

/** Samples per cell, along each axis, when drawing the letters. */
const OVERSAMPLE = 3;
/** Seconds a new word takes to rise in place of the last. */
const CHANGE_SECONDS = 0.8;

export class NameRelief implements Layer {
  // The word as drawn: OVERSAMPLE samples per cell, from `offset` on, both
  // counted from the top left of its rectangle.
  private mask = new Uint8ClampedArray(0);
  private maskWidth = 0;
  private maskHeight = 0;
  private offsetX = 0;
  private offsetY = 0;
  private drawnFor = "";
  private fontSize = 0;
  private startX = 0;
  private baseline = 0;
  private family = "";

  // The word as the grid sees it where it now stands.
  private coverage = new Float32Array(0);
  private cols = 0;
  private rows = 0;
  private firstColumn = 0;
  private firstRow = 0;
  private sampledFor = "";

  /** Depth of the relief, in cells. */
  private depth = 6;
  private fontReady = false;
  // Which way the sides are thrown, eased as the light moves.
  private castX = 0.6;
  private castY = 0.8;
  private version = 0;
  private word = "";
  // Seconds since the word last changed.
  private wordAge = CHANGE_SECONDS;
  /** How the word is currently set; null until it has been. */
  setting: ReliefSetting | null = null;

  constructor(private readonly options: ReliefOptions) {
    const family = getComputedStyle(document.body).fontFamily;
    this.word = this.text();
    void document.fonts
      ?.load(`700 120px ${family}`, `${this.word}${options.measure ?? ""}`)
      .catch(() => {})
      .then(() => {
        this.fontReady = true;
        this.drawnFor = "";
      });
  }

  private text() {
    const { text } = this.options;
    return typeof text === "string" ? text : text();
  }

  /** Whether the letters have been drawn into the grid at least once. */
  get ready() {
    return this.fontReady && this.cols > 0;
  }

  // Draws the word, at the size its rectangle gives it.
  private drawWord(text: string, rect: ReliefRect, spacing: number) {
    const family = getComputedStyle(document.body).fontFamily;
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe) return;
    probe.font = `700 100px ${family}`;
    const fitted = probe.measureText(this.options.measure ?? text);
    const fittedWidth =
      fitted.actualBoundingBoxLeft + fitted.actualBoundingBoxRight;
    const inkHeight =
      fitted.actualBoundingBoxAscent + fitted.actualBoundingBoxDescent;
    if (fittedWidth <= 0) return;
    const metrics = probe.measureText(text);
    const fontSize = (100 * rect.width) / fittedWidth;
    const scale = fontSize / 100;
    // As deep as a stem is wide: the letters read as blocks.
    this.depth = Math.max(3, Math.round((fontSize * 0.15) / spacing));

    const margin = (this.depth + 2) * spacing;
    const top = (rect.height - inkHeight * scale) / 2;
    const perPixel = OVERSAMPLE / spacing;
    const width = Math.ceil((rect.width + margin * 2) * perPixel);
    const height = Math.ceil((inkHeight * scale + margin * 2) * perPixel);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    this.offsetX = -margin;
    this.offsetY = top - margin;
    this.fontSize = fontSize;
    this.family = family;
    this.startX = metrics.actualBoundingBoxLeft * scale;
    this.baseline = top + fitted.actualBoundingBoxAscent * scale;
    context.font = `700 ${fontSize * perPixel}px ${family}`;
    context.textBaseline = "alphabetic";
    context.fillStyle = "#000";
    context.fillText(
      text,
      (this.startX - this.offsetX) * perPixel,
      (this.baseline - this.offsetY) * perPixel,
    );
    const pixels = context.getImageData(0, 0, width, height).data;
    const mask = new Uint8ClampedArray(width * height);
    for (let index = 0; index < mask.length; index += 1) {
      mask[index] = pixels[index * 4 + 3];
    }
    this.mask = mask;
    this.maskWidth = width;
    this.maskHeight = height;
    this.sampledFor = "";
  }

  // Reads the drawn word through the grid, where the word now stands.
  private sample(frame: WorldFrame, rect: ReliefRect) {
    const { grid } = frame;
    const { spacing } = grid;
    const { mask, maskWidth, maskHeight } = this;
    const left = rect.x + this.offsetX;
    const above = rect.y + this.offsetY;
    const c0 = Math.max(0, Math.floor((left - grid.originX) / spacing));
    const c1 = Math.min(
      grid.cols - 1,
      Math.ceil(
        (left + maskWidth / (OVERSAMPLE / spacing) - grid.originX) / spacing,
      ),
    );
    const r0 = Math.max(0, Math.floor((above - grid.originY) / spacing));
    const r1 = Math.min(
      grid.rows - 1,
      Math.ceil(
        (above + maskHeight / (OVERSAMPLE / spacing) - grid.originY) / spacing,
      ),
    );
    const cols = c1 - c0 + 1;
    const rows = r1 - r0 + 1;
    if (cols < 2 || rows < 2) {
      this.cols = 0;
      return;
    }
    if (this.coverage.length < cols * rows) {
      this.coverage = new Float32Array(cols * rows);
    }
    const { coverage } = this;
    const perPixel = OVERSAMPLE / spacing;
    // The first sample of the first cell, in the drawn word.
    const startX = Math.round(
      (grid.originX + c0 * spacing - spacing / 2 - left) * perPixel,
    );
    const startY = Math.round(
      (grid.originY + r0 * spacing - spacing / 2 - above) * perPixel,
    );
    const full = 255 * OVERSAMPLE * OVERSAMPLE;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        let sum = 0;
        for (let sy = 0; sy < OVERSAMPLE; sy += 1) {
          const y = startY + row * OVERSAMPLE + sy;
          if (y < 0 || y >= maskHeight) continue;
          for (let sx = 0; sx < OVERSAMPLE; sx += 1) {
            const x = startX + column * OVERSAMPLE + sx;
            if (x >= 0 && x < maskWidth) sum += mask[y * maskWidth + x];
          }
        }
        coverage[row * cols + column] = sum / full;
      }
    }
    this.cols = cols;
    this.rows = rows;
    this.firstColumn = c0;
    this.firstRow = r0;
    this.version += 1;
    this.setting = {
      text: this.word,
      family: this.family,
      fontSize: this.fontSize,
      x: rect.x + this.startX,
      baseline: rect.y + this.baseline,
      left: grid.originX + c0 * spacing - spacing / 2,
      top: grid.originY + r0 * spacing - spacing / 2,
      width: cols * spacing,
      height: rows * spacing,
      version: this.version,
    };
  }

  resize() {
    this.drawnFor = "";
  }

  step(frame: WorldFrame, dt: number) {
    this.wordAge += dt;
    const rect = this.options.rect();
    if (!rect) return;
    const { pointer } = frame;
    // Lit from the upper left unless the pointer says otherwise.
    let targetX = 0.6;
    let targetY = 0.8;
    if (pointer.presence > 0) {
      const dx = rect.x + rect.width / 2 - pointer.x;
      const dy = rect.y + rect.height / 2 - pointer.y;
      const distance = Math.hypot(dx, dy) || 1;
      targetX += (dx / distance - targetX) * pointer.presence;
      targetY += (dy / distance - targetY) * pointer.presence;
    }
    const ease = damping(5, dt);
    this.castX += (targetX - this.castX) * ease;
    this.castY += (targetY - this.castY) * ease;
  }

  draw(frame: WorldFrame, presence: number) {
    const rect = this.options.rect();
    if (!rect || !this.fontReady) return;
    const { grid, palette } = frame;

    const text = this.text();
    if (text !== this.word) {
      this.word = text;
      this.wordAge = 0;
    }
    const drawnFor = `${text}|${rect.width}|${rect.height}|${grid.spacing}`;
    if (drawnFor !== this.drawnFor) {
      this.drawnFor = drawnFor;
      this.drawWord(text, rect, grid.spacing);
    }
    const sampledFor = `${rect.x}|${rect.y}|${grid.cols}|${grid.rows}`;
    if (sampledFor !== this.sampledFor) {
      this.sampledFor = sampledFor;
      this.sample(frame, rect);
    }
    const { coverage, cols, rows, firstColumn, firstRow, depth } = this;
    if (cols === 0) return;

    // A word that has just replaced another rises again, from the left.
    const settled = frame.still
      ? 1
      : easeOutCubic(clamp01(this.wordAge / CHANGE_SECONDS));
    const rise = clamp01(this.options.rise()) * presence * settled;
    if (rise <= 0.002) return;
    const length = Math.hypot(this.castX, this.castY) || 1;
    const stepX = this.castX / length;
    const stepY = this.castY / length;
    const [near, far] = this.options.sides ?? [palette.accent, palette.accent2];
    const faceLevel = this.options.face ?? 0;
    const { ink } = palette;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        // Letters rise from left to right.
        const local = letterRise(rise, column / cols);
        if (local <= 0) continue;
        const face = coverage[row * cols + column];
        if (faceLevel > 0 && face > 0.04) {
          grid.plot(
            firstColumn + column,
            firstRow + row,
            face * local * faceLevel,
            ink[0],
            ink[1],
            ink[2],
          );
        }
        // Under a face: nothing else shows there.
        if (face > 0.6) continue;

        // Not under a face: perhaps on the side a face throws.
        const reach = Math.round(depth * local);
        for (let away = 1; away <= reach; away += 1) {
          const fromColumn = column - Math.round(stepX * away);
          const fromRow = row - Math.round(stepY * away);
          if (
            fromColumn < 0 ||
            fromRow < 0 ||
            fromColumn >= cols ||
            fromRow >= rows
          ) {
            break;
          }
          if (coverage[fromRow * cols + fromColumn] < 0.5) continue;
          // Bright against the face, deeper as it falls away.
          const fall = away / Math.max(1, depth);
          grid.plot(
            firstColumn + column,
            firstRow + row,
            (0.94 - 0.22 * fall) * local,
            near[0] + (far[0] - near[0]) * fall,
            near[1] + (far[1] - near[1]) * fall,
            near[2] + (far[2] - near[2]) * fall,
          );
          break;
        }
      }
    }
  }
}
