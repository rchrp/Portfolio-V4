// The matrix as data: one record per cell of a regular grid covering the
// viewport. Every frame, the scene writes the level (0 = resting dot, 1 = a
// full square) and the colour each cell should reach; `resolve` eases the
// cells towards them (fast to grow, slow to fade, which leaves a short wake
// behind anything that moves) and packs the result into the texture the grid
// shader reads: one texel per cell.
//
// Figures are not sprites laid over the grid: they are implicit shapes
// sampled at the cell centres, with a few extra taps per cell so a cell that
// is only partly covered grows only partly. The grid itself is what moves.

/** What a shape function reports for the point it was asked about. */
export type Ink = { r: number; g: number; b: number; level: number };

/**
 * Tells whether the point (u, v) belongs to a shape, in the shape's own
 * frame: u runs along its heading and v across it, both in units of its
 * span. Fills `ink` when it does.
 */
export type ShapeFn = (u: number, v: number, ink: Ink) => boolean;

// Sub-cell taps around the centre, in cell units.
const taps = [-0.27, -0.27, 0.27, -0.27, -0.27, 0.27, 0.27, 0.27];

/** Alpha values of the cell texture. */
const HOLE = 1;

export class CellGrid {
  spacing = 6;
  cols = 0;
  rows = 0;
  /** Centre of cell (0, 0), in CSS pixels. */
  originX = 0;
  originY = 0;

  /** Per second: how fast cells grow towards a higher level, and fade back. */
  attack = 26;
  release = 5;

  /**
   * Colour a cell drifts to as it fades: what passes leaves a pale wake
   * rather than a dark smear.
   */
  wake: readonly number[] = [255, 255, 255];

  /** RGBA texels handed to the shader. */
  data = new Uint8Array(0);

  private level = new Float32Array(0);
  private red = new Uint8Array(0);
  private green = new Uint8Array(0);
  private blue = new Uint8Array(0);
  private current = new Float32Array(0);
  private hole = new Uint8Array(0);
  private readonly ink: Ink = { r: 0, g: 0, b: 0, level: 1 };

  resize(width: number, height: number, spacing: number) {
    const cols = Math.ceil(width / spacing) + 1;
    const rows = Math.ceil(height / spacing) + 1;
    this.spacing = spacing;
    this.originX = Math.round((width - (cols - 1) * spacing) / 2);
    this.originY = Math.round((height - (rows - 1) * spacing) / 2);
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    const count = cols * rows;
    this.level = new Float32Array(count);
    this.red = new Uint8Array(count);
    this.green = new Uint8Array(count);
    this.blue = new Uint8Array(count);
    this.current = new Float32Array(count);
    this.hole = new Uint8Array(count);
    this.data = new Uint8Array(count * 4);
  }

  /** Starts a frame: nothing is drawn, and no cell is hidden. */
  begin() {
    this.level.fill(0);
    this.hole.fill(0);
  }

  /** Index of the cell under a point, or -1 outside the grid. */
  indexAt(x: number, y: number) {
    const column = Math.round((x - this.originX) / this.spacing);
    const row = Math.round((y - this.originY) / this.spacing);
    return column < 0 || row < 0 || column >= this.cols || row >= this.rows
      ? -1
      : row * this.cols + column;
  }

  /** Raises a cell to `level`, unless it already shows something stronger. */
  plot(
    column: number,
    row: number,
    level: number,
    r: number,
    g: number,
    b: number,
  ) {
    if (column < 0 || row < 0 || column >= this.cols || row >= this.rows) {
      return;
    }
    const index = row * this.cols + column;
    if (level <= this.level[index]) return;
    this.level[index] = level > 1 ? 1 : level;
    this.red[index] = r;
    this.green[index] = g;
    this.blue[index] = b;
  }

  /**
   * A point of light at any position: its level is shared between the four
   * cells around it, so it glides from cell to cell instead of jumping.
   */
  splat(x: number, y: number, level: number, r: number, g: number, b: number) {
    const gx = (x - this.originX) / this.spacing;
    const gy = (y - this.originY) / this.spacing;
    const column = Math.floor(gx);
    const row = Math.floor(gy);
    const fx = gx - column;
    const fy = gy - row;
    // The square root keeps a point between two cells from fading out.
    this.plot(column, row, level * Math.sqrt((1 - fx) * (1 - fy)), r, g, b);
    this.plot(column + 1, row, level * Math.sqrt(fx * (1 - fy)), r, g, b);
    this.plot(column, row + 1, level * Math.sqrt((1 - fx) * fy), r, g, b);
    this.plot(column + 1, row + 1, level * Math.sqrt(fx * fy), r, g, b);
  }

  /** A stroke one cell wide, its level running from `level0` to `level1`. */
  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    level0: number,
    level1: number,
    r: number,
    g: number,
    b: number,
  ) {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(length / (this.spacing * 0.5)));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      this.splat(
        x0 + (x1 - x0) * t,
        y0 + (y1 - y0) * t,
        level0 + (level1 - level0) * t,
        r,
        g,
        b,
      );
    }
  }

  /** A soft round glow: full at its centre, gone at `radius`. */
  glow(
    x: number,
    y: number,
    radius: number,
    level: number,
    r: number,
    g: number,
    b: number,
  ) {
    const { spacing, originX, originY } = this;
    const c0 = Math.max(0, Math.floor((x - radius - originX) / spacing));
    const c1 = Math.min(
      this.cols - 1,
      Math.ceil((x + radius - originX) / spacing),
    );
    const r0 = Math.max(0, Math.floor((y - radius - originY) / spacing));
    const r1 = Math.min(
      this.rows - 1,
      Math.ceil((y + radius - originY) / spacing),
    );
    for (let row = r0; row <= r1; row += 1) {
      const dy = originY + row * spacing - y;
      for (let column = c0; column <= c1; column += 1) {
        const dx = originX + column * spacing - x;
        const distance = Math.sqrt(dx * dx + dy * dy) / radius;
        if (distance >= 1) continue;
        const falloff = 1 - distance;
        this.plot(column, row, level * falloff * falloff, r, g, b);
      }
    }
  }

  /**
   * Rasterises an implicit shape placed at (x, y), turned by `heading` and
   * `span` pixels long. `extent` bounds it, in spans, around its origin.
   * Cells on its outline get a level in proportion to how much of them the
   * shape covers.
   */
  shape(
    x: number,
    y: number,
    heading: number,
    span: number,
    extent: number,
    fn: ShapeFn,
    alpha = 1,
  ) {
    const { spacing, originX, originY, ink } = this;
    const cos = Math.cos(heading) / span;
    const sin = Math.sin(heading) / span;
    const reach = extent * span;
    const c0 = Math.max(0, Math.floor((x - reach - originX) / spacing));
    const c1 = Math.min(
      this.cols - 1,
      Math.ceil((x + reach - originX) / spacing),
    );
    const r0 = Math.max(0, Math.floor((y - reach - originY) / spacing));
    const r1 = Math.min(
      this.rows - 1,
      Math.ceil((y + reach - originY) / spacing),
    );

    for (let row = r0; row <= r1; row += 1) {
      const py = originY + row * spacing - y;
      for (let column = c0; column <= c1; column += 1) {
        const px = originX + column * spacing - x;
        ink.level = 1;
        let hits = fn(px * cos + py * sin, py * cos - px * sin, ink) ? 1 : 0;
        let r = ink.r;
        let g = ink.g;
        let b = ink.b;
        let level = ink.level;
        for (let tap = 0; tap < 8; tap += 2) {
          const tx = px + taps[tap] * spacing;
          const ty = py + taps[tap + 1] * spacing;
          ink.level = 1;
          if (!fn(tx * cos + ty * sin, ty * cos - tx * sin, ink)) continue;
          if (hits === 0) {
            r = ink.r;
            g = ink.g;
            b = ink.b;
            level = ink.level;
          }
          hits += 1;
        }
        if (hits === 0) continue;
        this.plot(column, row, (hits / 5) * level * alpha, r, g, b);
      }
    }
  }

  /** Hides the cell under a point: something else is drawn in its place. */
  punch(x: number, y: number) {
    const index = this.indexAt(x, y);
    if (index >= 0) this.hole[index] = 1;
  }

  /** Hides the cell at a grid position. */
  punchCell(column: number, row: number) {
    if (column < 0 || row < 0 || column >= this.cols || row >= this.rows) {
      return;
    }
    this.hole[row * this.cols + column] = 1;
  }

  /**
   * Eases every cell towards what was drawn this frame and packs the texture.
   * Returns whether any cell is still on the move.
   */
  resolve(dt: number, instant = false) {
    const { level, current, red, green, blue, hole, data } = this;
    const up = instant ? 1 : 1 - Math.exp(-this.attack * dt);
    const down = instant ? 1 : 1 - Math.exp(-this.release * dt);
    const tint = Math.min(1, down * 2.5);
    const [wakeR, wakeG, wakeB] = this.wake;
    let moving = false;

    for (
      let index = 0, texel = 0;
      index < level.length;
      index += 1, texel += 4
    ) {
      const target = level[index];
      let value = current[index];

      if (target > 0) {
        // A cell that shows something takes its colour at once: fading
        // between two colours would pass through a muddy third one.
        data[texel] = red[index];
        data[texel + 1] = green[index];
        data[texel + 2] = blue[index];
      } else if (value > 0) {
        data[texel] += (wakeR - data[texel]) * tint;
        data[texel + 1] += (wakeG - data[texel + 1]) * tint;
        data[texel + 2] += (wakeB - data[texel + 2]) * tint;
      }
      if (target !== value) {
        value += (target - value) * (target > value ? up : down);
        if (Math.abs(target - value) < 0.004) value = target;
        else moving = true;
        current[index] = value;
      }

      data[texel + 3] = hole[index]
        ? HOLE
        : value > 0
          ? 2 + Math.round(value * 253)
          : 0;
    }

    return moving;
  }
}
