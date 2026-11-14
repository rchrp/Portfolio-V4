import type { CellGrid } from "./cells";
import { createProgram, type GL, type Program } from "./gl";
import type { MatrixLight } from "./matrix-layer";
import { clamp, clamp01, damp, hash2, smoothstep } from "./math";
import type { Mood } from "./moods";
import type { WorldPointer } from "./world";

// The portrait, made of the matrix's own cells. The photograph is sampled
// once per cell of the grid: each sample becomes a square that sits exactly
// on its cell, sized by how dark the photograph is there and coloured like
// it. At rest it is indistinguishable from the grid showing a picture.
//
// Unlike the grid's cells, these squares can leave their place. The pointer
// sweeps them along as it passes (the push follows its motion, as a hand
// through sand would), they glide, then a spring brings each one home. The
// same squares condense out of the resting dots when the portrait appears
// and melt back into them when it goes.

export type PortraitRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const vertex = /* glsl */ `#version 300 es
in vec2 aCorner;
// x, y, size (CSS pixels) and presence (0: a resting dot, 1: the photograph).
in vec4 iState;
in vec4 iColor;

uniform vec2 uViewport;
uniform float uPixelRatio;
uniform vec3 uRest;

out vec2 vLocal;
out float vHalf;
out vec4 vColor;

void main() {
  float side = iState.z + 2.0;
  vec2 position = iState.xy + aCorner * side;
  vLocal = aCorner * side * uPixelRatio;
  vHalf = iState.z * 0.5 * uPixelRatio;
  float presence = iState.w;
  vColor = vec4(
    mix(uRest, iColor.rgb, smoothstep(0.1, 0.7, presence)),
    smoothstep(0.0, 0.3, presence) * iColor.a
  );
  gl_Position = vec4(
    position.x / uViewport.x * 2.0 - 1.0,
    1.0 - position.y / uViewport.y * 2.0,
    0.0,
    1.0
  );
}`;

const fragment = /* glsl */ `#version 300 es
precision highp float;

in vec2 vLocal;
in float vHalf;
in vec4 vColor;

uniform vec2 uResolution;
uniform float uPixelRatio;
uniform vec4 uLight;

out vec4 fragColor;

void main() {
  float radius = min(vHalf * 0.32, 1.25 * uPixelRatio);
  vec2 q = abs(vLocal) - (vHalf - radius);
  float distanceToEdge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  float coverage = clamp(0.5 - distanceToEdge, 0.0, 1.0) * vColor.a;
  if (coverage <= 0.002) discard;

  // The pointer's light lifts the photograph where it falls.
  vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  float reach = distance(pixel, uLight.xy) / uLight.z;
  float glow = exp(-reach * reach * 2.0) * uLight.w;
  vec3 color = vColor.rgb * (1.0 + glow * 0.2) + vec3(0.05, 0.028, 0.012) * glow;

  fragColor = vec4(color * coverage, coverage);
}`;

const uniformNames = [
  "uViewport",
  "uPixelRatio",
  "uRest",
  "uResolution",
  "uLight",
] as const;

/** How many photograph samples are averaged per cell, along each axis. */
const OVERSAMPLE = 3;
/** Seconds the portrait takes to condense when it first appears. */
const INTRO_SECONDS = 2.1;
/** Share of the appearance during which squares start at different times. */
const STAGGER = 0.62;

export class PortraitLayer {
  private readonly program: Program<(typeof uniformNames)[number]>;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly cornerBuffer: WebGLBuffer | null;
  private readonly stateBuffer: WebGLBuffer | null;
  private readonly colorBuffer: WebGLBuffer | null;

  private image: HTMLImageElement | null = null;
  private rect: PortraitRect | null = null;
  private builtFor = "";

  private count = 0;
  private homeX = new Float32Array(0);
  private homeY = new Float32Array(0);
  private offsetX = new Float32Array(0);
  private offsetY = new Float32Array(0);
  private speedX = new Float32Array(0);
  private speedY = new Float32Array(0);
  /** 1 just after the pointer hit a square, 0 once the spring holds it again. */
  private heat = new Float32Array(0);
  private baseSize = new Float32Array(0);
  private stagger = new Float32Array(0);
  private spring = new Float32Array(0);
  private driftX = new Float32Array(0);
  private driftY = new Float32Array(0);
  private column = new Int16Array(0);
  private row = new Int16Array(0);
  /** Whether each square currently covers its own cell. */
  private home = new Uint8Array(0);
  private state = new Float32Array(0);

  /** Bounds of the squares at rest, to tell whether the pointer is near. */
  private left = 0;
  private top = 0;
  private right = 0;
  private bottom = 0;

  /** Where the director wants the portrait: 0 gone, 1 fully there. */
  target = 0;
  private presence = 0;
  private drawnPresence = -1;
  private introStartedAt = -1;
  private restless = false;
  private stateDirty = false;

  constructor(private readonly gl: GL) {
    this.program = createProgram(gl, vertex, fragment, uniformNames);
    const corner = this.program.attribute("aCorner");
    const state = this.program.attribute("iState");
    const color = this.program.attribute("iColor");

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.cornerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

    this.stateBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.stateBuffer);
    gl.enableVertexAttribArray(state);
    gl.vertexAttribPointer(state, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(state, 1);

    this.colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.vertexAttribDivisor(color, 1);

    gl.bindVertexArray(null);
  }

  setImage(image: HTMLImageElement) {
    this.image = image;
    this.builtFor = "";
  }

  /** Where the portrait stands, in viewport pixels; null removes it. */
  setRect(rect: PortraitRect | null) {
    this.rect = rect;
  }

  /** Whether the squares are on the move, or about to be. */
  get busy() {
    return (
      this.count > 0 &&
      (this.restless || Math.abs(this.presence - this.target) > 0.001)
    );
  }

  get visible() {
    return this.count > 0 && this.presence > 0.003;
  }

  private build(grid: CellGrid) {
    const { image, rect, gl } = this;
    this.count = 0;
    if (!image || !rect || rect.width < 8 || rect.height < 8) return;

    const spacing = grid.spacing;
    // The photograph is fitted whole in its box, standing on its bottom edge.
    const scale = Math.min(
      rect.width / image.naturalWidth,
      rect.height / image.naturalHeight,
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const left = rect.x + (rect.width - width) / 2;
    const top = rect.y + rect.height - height;

    const c0 = Math.max(0, Math.ceil((left - grid.originX) / spacing));
    const c1 = Math.min(
      grid.cols - 1,
      Math.floor((left + width - grid.originX) / spacing),
    );
    const r0 = Math.max(0, Math.ceil((top - grid.originY) / spacing));
    const r1 = Math.min(
      grid.rows - 1,
      Math.floor((top + height - grid.originY) / spacing),
    );
    const cols = c1 - c0 + 1;
    const rows = r1 - r0 + 1;
    if (cols < 4 || rows < 4) return;

    // Drawn a few samples per cell, then averaged by hand: the browser's own
    // downscaling may skip pixels at this ratio.
    const canvas = document.createElement("canvas");
    canvas.width = cols * OVERSAMPLE;
    canvas.height = rows * OVERSAMPLE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const perPixel = OVERSAMPLE / spacing;
    context.drawImage(
      image,
      (left - (grid.originX + c0 * spacing - spacing / 2)) * perPixel,
      (top - (grid.originY + r0 * spacing - spacing / 2)) * perPixel,
      width * perPixel,
      height * perPixel,
    );
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    const capacity = cols * rows;
    const homeX = new Float32Array(capacity);
    const homeY = new Float32Array(capacity);
    const baseSize = new Float32Array(capacity);
    const stagger = new Float32Array(capacity);
    const spring = new Float32Array(capacity);
    const driftX = new Float32Array(capacity);
    const driftY = new Float32Array(capacity);
    const column = new Int16Array(capacity);
    const row = new Int16Array(capacity);
    const colors = new Uint8Array(capacity * 4);

    // The appearance spreads from the face outwards.
    const faceX = left + width * 0.5;
    const faceY = top + height * 0.34;
    const farthest = Math.hypot(width * 0.5, height * 0.66);
    let count = 0;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        let red = 0;
        let green = 0;
        let blue = 0;
        let alpha = 0;
        for (let sy = 0; sy < OVERSAMPLE; sy += 1) {
          const line = (y * OVERSAMPLE + sy) * canvas.width;
          for (let sx = 0; sx < OVERSAMPLE; sx += 1) {
            const index = (line + x * OVERSAMPLE + sx) * 4;
            const a = pixels[index + 3];
            red += pixels[index] * a;
            green += pixels[index + 1] * a;
            blue += pixels[index + 2] * a;
            alpha += a;
          }
        }
        const coverage = alpha / (255 * OVERSAMPLE * OVERSAMPLE);
        if (coverage < 0.5) continue;
        red /= alpha;
        green /= alpha;
        blue /= alpha;

        // A little more contrast and colour than the photograph: squares
        // with gaps between them read paler than a continuous picture.
        const grey = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        const tone = (value: number) =>
          clamp((grey + (value - grey) * 1.14 - 128) * 1.08 + 126, 0, 255);
        const px = grid.originX + (c0 + x) * spacing;
        const py = grid.originY + (r0 + y) * spacing;
        const grain = hash2(c0 + x, r0 + y, 21);

        homeX[count] = px;
        homeY[count] = py;
        // Darker means larger, as in a halftone.
        baseSize[count] =
          spacing * (0.93 - 0.36 * smoothstep(0.3, 0.98, grey / 255));
        stagger[count] =
          clamp01(Math.hypot(px - faceX, py - faceY) / farthest) * 0.72 +
          grain * 0.28;
        spring[count] = 0.62 + 0.76 * hash2(c0 + x, r0 + y, 22);
        // Where the square drifts to as it melts away: up and to the side.
        const angle = -Math.PI / 2 + (hash2(c0 + x, r0 + y, 23) - 0.5) * 2.4;
        const reach = spacing * (4 + 20 * hash2(c0 + x, r0 + y, 24));
        driftX[count] = Math.cos(angle) * reach;
        driftY[count] = Math.sin(angle) * reach;
        column[count] = c0 + x;
        row[count] = r0 + y;
        colors[count * 4] = tone(red);
        colors[count * 4 + 1] = tone(green);
        colors[count * 4 + 2] = tone(blue);
        colors[count * 4 + 3] = 255;
        count += 1;
      }
    }

    this.count = count;
    this.homeX = homeX;
    this.homeY = homeY;
    this.baseSize = baseSize;
    this.stagger = stagger;
    this.spring = spring;
    this.driftX = driftX;
    this.driftY = driftY;
    this.column = column;
    this.row = row;
    this.offsetX = new Float32Array(count);
    this.offsetY = new Float32Array(count);
    this.speedX = new Float32Array(count);
    this.speedY = new Float32Array(count);
    this.heat = new Float32Array(count);
    this.home = new Uint8Array(count);
    this.state = new Float32Array(count * 4);
    this.left = left;
    this.top = top;
    this.right = left + width;
    this.bottom = top + height;
    this.restless = false;
    this.drawnPresence = -1;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      colors.subarray(0, count * 4),
      gl.STATIC_DRAW,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, this.stateBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.state.byteLength, gl.DYNAMIC_DRAW);
  }

  /**
   * Moves the squares and hides the grid cells they cover. `still` skips
   * every animation: the portrait is simply there or not.
   */
  update(
    grid: CellGrid,
    pointer: WorldPointer,
    mood: Mood,
    time: number,
    dt: number,
    still: boolean,
  ) {
    const key = this.rect
      ? `${this.rect.x}|${this.rect.y}|${this.rect.width}|${this.rect.height}|${grid.cols}|${grid.rows}|${grid.spacing}`
      : "";
    if (key !== this.builtFor && (this.image || !this.rect)) {
      this.builtFor = key;
      this.build(grid);
    }
    if (this.count === 0) return;

    // The first appearance takes its time; afterwards the director leads.
    let target = this.target;
    if (still) {
      this.presence = target;
    } else {
      if (target > 0 && this.introStartedAt < 0) this.introStartedAt = time;
      if (this.introStartedAt >= 0) {
        const intro = clamp01((time - this.introStartedAt) / INTRO_SECONDS);
        target = Math.min(target, intro);
      }
      this.presence = damp(this.presence, target, 9, dt);
      if (Math.abs(this.presence - target) < 0.0005) this.presence = target;
    }
    const presence = this.presence;
    if (presence <= 0.003) {
      this.drawnPresence = presence;
      return;
    }

    const spacing = grid.spacing;
    const reach = clamp(spacing * 15, 72, 124);
    const pointerSpeed = Math.hypot(pointer.vx, pointer.vy);
    const near =
      !still &&
      pointer.presence > 0.01 &&
      pointer.x > this.left - reach &&
      pointer.x < this.right + reach &&
      pointer.y > this.top - reach &&
      pointer.y < this.bottom + reach;

    const moved = presence !== this.drawnPresence;
    if (near || this.restless || moved) {
      this.simulate(
        grid,
        pointer,
        mood,
        presence,
        near,
        reach,
        pointerSpeed,
        dt,
      );
      this.drawnPresence = presence;
      this.stateDirty = true;
    }

    // Cells under a square that is in place stay hidden.
    const { home, column, row, count } = this;
    for (let index = 0; index < count; index += 1) {
      if (home[index]) grid.punchCell(column[index], row[index]);
    }
  }

  private simulate(
    grid: CellGrid,
    pointer: WorldPointer,
    mood: Mood,
    presence: number,
    near: boolean,
    reach: number,
    pointerSpeed: number,
    dt: number,
  ) {
    const {
      count,
      homeX,
      homeY,
      offsetX,
      offsetY,
      speedX,
      speedY,
      heat,
      baseSize,
      stagger,
      spring,
      driftX,
      driftY,
      home,
      state,
    } = this;
    const spacing = grid.spacing;
    const reachSquared = reach * reach;
    const sweepX = clamp(pointer.vx, -1500, 1500);
    const sweepY = clamp(pointer.vy, -1500, 1500);
    // A resting pointer still parts the squares a little.
    const press = 150 + Math.min(pointerSpeed, 1400) * 0.55;
    const scatter = Math.min(pointerSpeed, 1400) * 0.5;
    const strength = pointer.presence;
    const cooling = dt / 0.95;
    const restSize = mood.restSize * spacing;
    const span = 1 - STAGGER;
    let restless = false;

    for (let index = 0; index < count; index += 1) {
      let ox = offsetX[index];
      let oy = offsetY[index];
      let vx = speedX[index];
      let vy = speedY[index];
      let warmth = heat[index];

      if (near) {
        const dx = homeX[index] + ox - pointer.x;
        const dy = homeY[index] + oy - pointer.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < reachSquared) {
          const distance = Math.sqrt(distanceSquared) || 1;
          const falloff = 1 - distance / reach;
          const force = falloff * falloff * strength;
          // Swept along the pointer's path, pushed aside, and jostled.
          vx +=
            (sweepX * 13 +
              (dx / distance) * press +
              (Math.random() - 0.5) * scatter * 9) *
            force *
            dt;
          vy +=
            (sweepY * 13 +
              (dy / distance) * press +
              (Math.random() - 0.5) * scatter * 9) *
            force *
            dt;
          const hit = force * clamp01(pointerSpeed / 260 + 0.3);
          if (hit > warmth) warmth = hit;
        }
      }

      if (ox !== 0 || oy !== 0 || vx !== 0 || vy !== 0 || warmth > 0) {
        // While warm, a square glides freely; as it cools, the spring that
        // ties it to its cell takes hold again.
        const grip = (1 - warmth) * (1 - warmth) * 42 * spring[index];
        vx -= ox * grip * dt;
        vy -= oy * grip * dt;
        const drag = Math.exp(-(2.4 + 5.4 * (1 - warmth)) * dt);
        vx *= drag;
        vy *= drag;
        ox += vx * dt;
        oy += vy * dt;
        warmth = warmth > cooling ? warmth - cooling : 0;

        if (
          warmth === 0 &&
          Math.abs(ox) < 0.04 &&
          Math.abs(oy) < 0.04 &&
          Math.abs(vx) < 0.4 &&
          Math.abs(vy) < 0.4
        ) {
          ox = 0;
          oy = 0;
          vx = 0;
          vy = 0;
        } else {
          restless = true;
        }
        offsetX[index] = ox;
        offsetY[index] = oy;
        speedX[index] = vx;
        speedY[index] = vy;
        heat[index] = warmth;
      }

      // Each square has its own moment within the appearance.
      const start = stagger[index] * STAGGER;
      const local = clamp01((presence - start) / span);
      const shown = local * local * (3 - 2 * local);
      const away = 1 - shown;
      const drift = away * away;
      const displacement = Math.sqrt(ox * ox + oy * oy);
      const base = index * 4;
      state[base] = homeX[index] + ox + driftX[index] * drift;
      state[base + 1] = homeY[index] + oy + driftY[index] * drift;
      state[base + 2] =
        (restSize + (baseSize[index] - restSize) * shown) *
        (1 - 0.45 * clamp01(displacement / (spacing * 16)));
      state[base + 3] = shown;
      home[index] = shown > 0.5 && displacement < spacing * 0.7 ? 1 : 0;
    }

    this.restless = restless;
  }

  draw(
    width: number,
    height: number,
    mood: Mood,
    light: MatrixLight,
    pixelRatio: number,
  ) {
    if (!this.visible) return;
    const { gl } = this;
    const { uniforms } = this.program;

    if (this.stateDirty) {
      this.stateDirty = false;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.stateBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.state, 0, this.count * 4);
    }

    gl.useProgram(this.program.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(uniforms.uViewport, width, height);
    gl.uniform1f(uniforms.uPixelRatio, pixelRatio);
    gl.uniform2f(
      uniforms.uResolution,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    );
    gl.uniform3f(
      uniforms.uRest,
      mood.rest[0] / 255,
      mood.rest[1] / 255,
      mood.rest[2] / 255,
    );
    gl.uniform4f(
      uniforms.uLight,
      light.x * pixelRatio,
      light.y * pixelRatio,
      light.radius * pixelRatio,
      light.strength,
    );
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose() {
    const { gl } = this;
    gl.deleteBuffer(this.cornerBuffer);
    gl.deleteBuffer(this.stateBuffer);
    gl.deleteBuffer(this.colorBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program.program);
  }
}
