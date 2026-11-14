import { clamp01, damping, smoothstep } from "../math";
import type { Layer, WorldFrame } from "../world";

// A word standing in the matrix, in relief. Its letters are rasterised once
// into the grid; every frame, each cell is either under a letter's face, on
// the side the letter throws away from the light, or neither. This layer
// draws the sides, in cells; the face itself is set in plain type over them
// (see `name-face.ts`). The light is the pointer: move it and the relief
// turns, as a sundial's shadow would.

export type ReliefRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ReliefOptions = {
  text: string;
  /** Where the word sits, in viewport pixels: it is fitted to the width. */
  rect: () => ReliefRect | null;
  /** 0: flat in the grid; 1: fully risen. Letters rise one after another. */
  rise: () => number;
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

/** Samples per cell, along each axis, when rasterising the letters. */
const OVERSAMPLE = 3;

export class NameRelief implements Layer {
  private coverage = new Float32Array(0);
  private cols = 0;
  private rows = 0;
  private firstColumn = 0;
  private firstRow = 0;
  /** Depth of the relief, in cells. */
  private depth = 6;
  private builtFor = "";
  private fontReady = false;
  // Which way the sides are thrown, eased as the light moves.
  private castX = 0.6;
  private castY = 0.8;
  private version = 0;
  /** How the word is currently set; null until it has been. */
  setting: ReliefSetting | null = null;

  constructor(private readonly options: ReliefOptions) {
    const family = getComputedStyle(document.body).fontFamily;
    void document.fonts
      ?.load(`700 120px ${family}`, options.text)
      .catch(() => {})
      .then(() => {
        this.fontReady = true;
        this.builtFor = "";
      });
  }

  /** Whether the letters have been drawn into the grid at least once. */
  get ready() {
    return this.fontReady && this.cols > 0;
  }

  private build(frame: WorldFrame, rect: ReliefRect) {
    const { grid } = frame;
    const { spacing } = grid;
    const family = getComputedStyle(document.body).fontFamily;
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe) return;
    probe.font = `700 100px ${family}`;
    const metrics = probe.measureText(this.options.text);
    const inkWidth =
      metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
    const inkHeight =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    if (inkWidth <= 0) return;
    const fontSize = (100 * rect.width) / inkWidth;
    const scale = fontSize / 100;
    // As deep as a stem is wide: the letters read as blocks.
    this.depth = Math.max(3, Math.round((fontSize * 0.15) / spacing));

    const margin = this.depth + 2;
    const c0 = Math.max(
      0,
      Math.floor((rect.x - grid.originX) / spacing) - margin,
    );
    const c1 = Math.min(
      grid.cols - 1,
      Math.ceil((rect.x + rect.width - grid.originX) / spacing) + margin,
    );
    const top = rect.y + (rect.height - inkHeight * scale) / 2;
    const r0 = Math.max(0, Math.floor((top - grid.originY) / spacing) - margin);
    const r1 = Math.min(
      grid.rows - 1,
      Math.ceil((top + inkHeight * scale - grid.originY) / spacing) + margin,
    );
    const cols = c1 - c0 + 1;
    const rows = r1 - r0 + 1;
    if (cols < 2 || rows < 2) return;

    const canvas = document.createElement("canvas");
    canvas.width = cols * OVERSAMPLE;
    canvas.height = rows * OVERSAMPLE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const perPixel = OVERSAMPLE / spacing;
    const left = grid.originX + c0 * spacing - spacing / 2;
    const above = grid.originY + r0 * spacing - spacing / 2;
    context.font = `700 ${fontSize * perPixel}px ${family}`;
    context.textBaseline = "alphabetic";
    context.fillStyle = "#000";
    context.fillText(
      this.options.text,
      (rect.x + metrics.actualBoundingBoxLeft * scale - left) * perPixel,
      (top + metrics.actualBoundingBoxAscent * scale - above) * perPixel,
    );
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    const coverage = new Float32Array(cols * rows);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        let sum = 0;
        for (let sy = 0; sy < OVERSAMPLE; sy += 1) {
          const line = (row * OVERSAMPLE + sy) * canvas.width;
          for (let sx = 0; sx < OVERSAMPLE; sx += 1) {
            sum += pixels[(line + column * OVERSAMPLE + sx) * 4 + 3];
          }
        }
        coverage[row * cols + column] = sum / (255 * OVERSAMPLE * OVERSAMPLE);
      }
    }
    this.coverage = coverage;
    this.cols = cols;
    this.rows = rows;
    this.firstColumn = c0;
    this.firstRow = r0;
    this.version += 1;
    this.setting = {
      text: this.options.text,
      family,
      fontSize,
      x: rect.x + metrics.actualBoundingBoxLeft * scale,
      baseline: top + metrics.actualBoundingBoxAscent * scale,
      left,
      top: above,
      width: cols * spacing,
      height: rows * spacing,
      version: this.version,
    };
  }

  resize() {
    this.builtFor = "";
  }

  step(frame: WorldFrame, dt: number) {
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
    const key = `${rect.x}|${rect.y}|${rect.width}|${rect.height}|${grid.cols}|${grid.rows}|${grid.spacing}`;
    if (key !== this.builtFor) {
      this.builtFor = key;
      this.build(frame, rect);
    }
    const { coverage, cols, rows, firstColumn, firstRow, depth } = this;
    if (cols === 0) return;

    const rise = clamp01(this.options.rise()) * presence;
    if (rise <= 0.002) return;
    const length = Math.hypot(this.castX, this.castY) || 1;
    const stepX = this.castX / length;
    const stepY = this.castY / length;
    const { accent, accent2 } = palette;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        // Letters rise from left to right.
        const local = letterRise(rise, column / cols);
        if (local <= 0) continue;
        // Under a face: the type set over the cells covers it.
        if (coverage[row * cols + column] > 0.6) continue;

        // Not under a face: perhaps on the side a face throws.
        const reach = Math.round(depth * local);
        for (let far = 1; far <= reach; far += 1) {
          const fromColumn = column - Math.round(stepX * far);
          const fromRow = row - Math.round(stepY * far);
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
          const fall = far / Math.max(1, depth);
          grid.plot(
            firstColumn + column,
            firstRow + row,
            (0.94 - 0.22 * fall) * local,
            accent[0] + (accent2[0] - accent[0]) * fall,
            accent[1] + (accent2[1] - accent[1]) * fall,
            accent[2] + (accent2[2] - accent[2]) * fall,
          );
          break;
        }
      }
    }
  }
}
