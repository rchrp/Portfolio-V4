import type { CellGrid } from "./cells";
import { createProgram, type GL, type Program } from "./gl";
import type { MatrixLight } from "./matrix-layer";
import { clamp, clamp01, hash2, smoothstep } from "./math";
import type { Mood } from "./moods";
import type { WorldPointer } from "./world";

// The portrait: a photograph, and the matrix it is made of.
//
// At rest it is the photograph itself, sharp. But the photograph is also
// sampled once per cell of the grid, and each sample is a square that can
// take over from the patch of picture it stands for. Under the pointer the
// picture gives way to its squares, which are swept along the pointer's
// path, glide, and are brought home by a spring; as each one settles, the
// photograph closes over it again.
//
// The same squares tell how the portrait arrives: they condense out of the
// resting dots, then sharpen into the photograph, from the face outwards.

export type PortraitRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const photoVertex = /* glsl */ `#version 300 es
in vec2 aCorner;
uniform vec2 uViewport;
// Left, top, width, height.
uniform vec4 uRect;
out vec2 vUv;

void main() {
  vUv = aCorner + 0.5;
  vec2 position = uRect.xy + vUv * uRect.zw;
  gl_Position = vec4(
    position.x / uViewport.x * 2.0 - 1.0,
    1.0 - position.y / uViewport.y * 2.0,
    0.0,
    1.0
  );
}`;

const photoFragment = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uPhoto;
// One texel per cell: how far the squares have taken over there.
uniform sampler2D uMask;
uniform vec2 uResolution;
// Centre of the mask's first cell, and the cells' spacing.
uniform vec2 uOrigin;
uniform float uSpacing;
uniform vec4 uLight;
out vec4 fragColor;

void main() {
  // Premultiplied by the upload.
  vec4 photo = texture(uPhoto, vUv);
  if (photo.a <= 0.003) discard;

  vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  ivec2 cell = ivec2(floor((pixel - uOrigin) / uSpacing + 0.5));
  ivec2 size = textureSize(uMask, 0);
  float taken = 0.0;
  if (cell.x >= 0 && cell.y >= 0 && cell.x < size.x && cell.y < size.y) {
    taken = texelFetch(uMask, cell, 0).r;
  }
  float shown = 1.0 - taken;
  if (shown <= 0.003) discard;

  // The pointer's light lifts the picture where it falls.
  float reach = distance(pixel, uLight.xy) / uLight.z;
  float glow = exp(-reach * reach * 2.0) * uLight.w;
  vec3 color = photo.rgb * (1.0 + glow * 0.12);

  fragColor = vec4(color, photo.a) * shown;
}`;

const squareVertex = /* glsl */ `#version 300 es
in vec2 aCorner;
// x, y, size (CSS pixels), then how far the square has left the resting
// dots for the photograph's colour (0 to 1).
in vec4 iState;
in float iAlpha;
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
  vColor = vec4(mix(uRest, iColor.rgb, smoothstep(0.1, 0.7, iState.w)), iAlpha);
  gl_Position = vec4(
    position.x / uViewport.x * 2.0 - 1.0,
    1.0 - position.y / uViewport.y * 2.0,
    0.0,
    1.0
  );
}`;

const squareFragment = /* glsl */ `#version 300 es
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

  vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  float reach = distance(pixel, uLight.xy) / uLight.z;
  float glow = exp(-reach * reach * 2.0) * uLight.w;
  vec3 color = vColor.rgb * (1.0 + glow * 0.2) + vec3(0.05, 0.028, 0.012) * glow;

  fragColor = vec4(color * coverage, coverage);
}`;

const photoUniforms = [
  "uViewport",
  "uRect",
  "uPhoto",
  "uMask",
  "uResolution",
  "uOrigin",
  "uSpacing",
  "uLight",
] as const;

const squareUniforms = [
  "uViewport",
  "uPixelRatio",
  "uRest",
  "uResolution",
  "uLight",
] as const;

/** How many photograph samples are averaged per cell, along each axis. */
const OVERSAMPLE = 3;
/** Share of an appearance during which squares start at different times. */
const STAGGER = 0.6;
/** Larger photographs are scaled down before reaching the GPU. */
const MAX_PHOTO = 4096;

export class PortraitLayer {
  private readonly photo: Program<(typeof photoUniforms)[number]>;
  private readonly squares: Program<(typeof squareUniforms)[number]>;
  private readonly photoVao: WebGLVertexArrayObject | null;
  private readonly squareVao: WebGLVertexArrayObject | null;
  private readonly cornerBuffer: WebGLBuffer | null;
  private readonly stateBuffer: WebGLBuffer | null;
  private readonly alphaBuffer: WebGLBuffer | null;
  private readonly colorBuffer: WebGLBuffer | null;
  private readonly photoTexture: WebGLTexture | null;
  private readonly maskTexture: WebGLTexture | null;

  private image: HTMLImageElement | null = null;
  private rect: PortraitRect | null = null;
  private builtFor = "";

  // The photograph's place, and the block of cells it covers.
  private left = 0;
  private top = 0;
  private width = 0;
  private height = 0;
  private cols = 0;
  private rows = 0;
  private originX = 0;
  private originY = 0;
  private spacing = 6;

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
  /** Index of each square's cell in the mask. */
  private cell = new Int32Array(0);
  private state = new Float32Array(0);
  private alpha = new Float32Array(0);
  private mask = new Uint8Array(0);

  /**
   * How far the portrait has arrived, 0 to 1: squares condense during the
   * first half, the photograph takes over during the second.
   */
  arrival = 0;
  private drawnArrival = -1;
  private restless = false;
  private dirty = false;
  private visibleSquares = false;

  constructor(private readonly gl: GL) {
    this.photo = createProgram(gl, photoVertex, photoFragment, photoUniforms);
    this.squares = createProgram(
      gl,
      squareVertex,
      squareFragment,
      squareUniforms,
    );

    this.cornerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
      gl.STATIC_DRAW,
    );

    this.photoVao = gl.createVertexArray();
    gl.bindVertexArray(this.photoVao);
    const photoCorner = this.photo.attribute("aCorner");
    gl.enableVertexAttribArray(photoCorner);
    gl.vertexAttribPointer(photoCorner, 2, gl.FLOAT, false, 0, 0);

    this.squareVao = gl.createVertexArray();
    gl.bindVertexArray(this.squareVao);
    const corner = this.squares.attribute("aCorner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

    this.stateBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.stateBuffer);
    const state = this.squares.attribute("iState");
    gl.enableVertexAttribArray(state);
    gl.vertexAttribPointer(state, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(state, 1);

    this.alphaBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.alphaBuffer);
    const alpha = this.squares.attribute("iAlpha");
    gl.enableVertexAttribArray(alpha);
    gl.vertexAttribPointer(alpha, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(alpha, 1);

    this.colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    const color = this.squares.attribute("iColor");
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.vertexAttribDivisor(color, 1);
    gl.bindVertexArray(null);

    this.photoTexture = gl.createTexture();
    this.maskTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setImage(image: HTMLImageElement) {
    const { gl } = this;
    this.image = image;
    this.builtFor = "";

    let source: TexImageSource = image;
    const largest = Math.max(image.naturalWidth, image.naturalHeight);
    if (largest > MAX_PHOTO) {
      const scale = MAX_PHOTO / largest;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas
        .getContext("2d")
        ?.drawImage(image, 0, 0, canvas.width, canvas.height);
      source = canvas;
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.photoTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // Premultiplied: the silhouette's edge stays clean when filtered.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Where the portrait stands, in viewport pixels; null removes it. */
  setRect(rect: PortraitRect | null) {
    this.rect = rect;
  }

  /** Whether a photograph has been given and placed. */
  get ready() {
    return this.count > 0;
  }

  /** Whether the squares are on the move. */
  get busy() {
    return this.count > 0 && (this.restless || this.arrival < 1);
  }

  /** Centre of the face, for whoever wants to start something from it. */
  get face() {
    return {
      x: this.left + this.width * 0.5,
      y: this.top + this.height * 0.32,
    };
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
    const cell = new Int32Array(capacity);
    const colors = new Uint8Array(capacity * 4);

    // Everything spreads from the face outwards.
    const faceX = left + width * 0.5;
    const faceY = top + height * 0.32;
    const farthest = Math.hypot(width * 0.5, height * 0.68);
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

        const grey = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        const px = grid.originX + (c0 + x) * spacing;
        const py = grid.originY + (r0 + y) * spacing;
        const grain = hash2(c0 + x, r0 + y, 21);

        homeX[count] = px;
        homeY[count] = py;
        // Darker means larger, as in a halftone.
        baseSize[count] =
          spacing * (0.95 - 0.3 * smoothstep(0.3, 0.98, grey / 255));
        stagger[count] =
          clamp01(Math.hypot(px - faceX, py - faceY) / farthest) * 0.74 +
          grain * 0.26;
        spring[count] = 0.62 + 0.76 * hash2(c0 + x, r0 + y, 22);
        // Where the square comes from as it condenses: below and aside.
        const angle = Math.PI / 2 + (hash2(c0 + x, r0 + y, 23) - 0.5) * 2.6;
        const reach = spacing * (3 + 16 * hash2(c0 + x, r0 + y, 24));
        driftX[count] = Math.cos(angle) * reach;
        driftY[count] = Math.sin(angle) * reach;
        cell[count] = y * cols + x;
        colors[count * 4] = red;
        colors[count * 4 + 1] = green;
        colors[count * 4 + 2] = blue;
        colors[count * 4 + 3] = 255;
        count += 1;
      }
    }

    this.count = count;
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
    this.cols = cols;
    this.rows = rows;
    this.originX = grid.originX + c0 * spacing;
    this.originY = grid.originY + r0 * spacing;
    this.spacing = spacing;
    this.homeX = homeX;
    this.homeY = homeY;
    this.baseSize = baseSize;
    this.stagger = stagger;
    this.spring = spring;
    this.driftX = driftX;
    this.driftY = driftY;
    this.cell = cell;
    this.offsetX = new Float32Array(count);
    this.offsetY = new Float32Array(count);
    this.speedX = new Float32Array(count);
    this.speedY = new Float32Array(count);
    this.heat = new Float32Array(count);
    this.state = new Float32Array(count * 4);
    this.alpha = new Float32Array(count);
    this.mask = new Uint8Array(capacity);
    this.restless = false;
    this.drawnArrival = -1;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      colors.subarray(0, count * 4),
      gl.STATIC_DRAW,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, this.stateBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.state.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.alphaBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.alpha.byteLength, gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      cols,
      rows,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      this.mask,
    );
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Moves the squares. `still` skips every animation. */
  update(
    grid: CellGrid,
    pointer: WorldPointer,
    mood: Mood,
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
    if (still) this.arrival = 1;

    const spacing = grid.spacing;
    const reach = clamp(spacing * 19, 90, 150);
    const near =
      !still &&
      this.arrival >= 1 &&
      pointer.presence > 0.01 &&
      pointer.x > this.left - reach &&
      pointer.x < this.left + this.width + reach &&
      pointer.y > this.top - reach &&
      pointer.y < this.top + this.height + reach;

    if (near || this.restless || this.arrival !== this.drawnArrival) {
      this.simulate(mood, pointer, near, reach, dt);
      this.drawnArrival = this.arrival;
      this.dirty = true;
    }
  }

  private simulate(
    mood: Mood,
    pointer: WorldPointer,
    near: boolean,
    reach: number,
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
      cell,
      state,
      alpha,
      mask,
      spacing,
    } = this;
    const reachSquared = reach * reach;
    const pointerSpeed = Math.hypot(pointer.vx, pointer.vy);
    const sweepX = clamp(pointer.vx, -1500, 1500);
    const sweepY = clamp(pointer.vy, -1500, 1500);
    // A resting pointer still parts the squares a little.
    const press = 150 + Math.min(pointerSpeed, 1400) * 0.55;
    const scatter = Math.min(pointerSpeed, 1400) * 0.5;
    const strength = pointer.presence;
    const cooling = dt / 0.95;
    const restSize = mood.restSize * spacing;
    const span = 1 - STAGGER;
    // First the squares condense, then the photograph takes over.
    const condensed = clamp01(this.arrival / 0.55);
    const sharpened = clamp01((this.arrival - 0.45) / 0.55);
    let restless = false;
    let visible = false;

    // Cells with no square of their own (the silhouette's edge) follow the
    // photograph's arrival as a whole.
    mask.fill(Math.round((1 - smoothstep(0.55, 1, sharpened)) * 255));

    for (let index = 0; index < count; index += 1) {
      let ox = offsetX[index];
      let oy = offsetY[index];
      let vx = speedX[index];
      let vy = speedY[index];
      let warmth = heat[index];
      let touch = 0;

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
            (sweepX * 16 +
              (dx / distance) * press +
              (Math.random() - 0.5) * scatter * 9) *
            force *
            dt;
          vy +=
            (sweepY * 16 +
              (dy / distance) * press +
              (Math.random() - 0.5) * scatter * 9) *
            force *
            dt;
          const hit = force * clamp01(pointerSpeed / 260 + 0.3);
          if (hit > warmth) warmth = hit;
          // Even untouched, the picture shows its grain near the pointer.
          touch = force * 1.5;
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

      // Each square has its own moment within the arrival.
      const start = stagger[index] * STAGGER;
      const local = clamp01((condensed - start) / span);
      const shown = local * local * (3 - 2 * local);
      const sharp = smoothstep(start, start + span, sharpened);
      const away = 1 - shown;
      const displacement = Math.sqrt(ox * ox + oy * oy);

      // How far this square has taken over from the photograph.
      const disturbed = clamp01(
        Math.max(warmth * 1.4, displacement / (spacing * 0.5), touch),
      );
      const taken = Math.max(1 - sharp, disturbed);
      mask[cell[index]] = Math.round(taken * 255);

      const base = index * 4;
      state[base] = homeX[index] + ox + driftX[index] * away * away;
      state[base + 1] = homeY[index] + oy + driftY[index] * away * away;
      state[base + 2] =
        (restSize + (baseSize[index] - restSize) * shown) *
        (1 - 0.45 * clamp01(displacement / (spacing * 16)));
      state[base + 3] = shown;
      const opacity = taken * smoothstep(0, 0.3, shown);
      alpha[index] = opacity;
      if (opacity > 0.003) visible = true;
    }

    this.restless = restless;
    this.visibleSquares = visible;
  }

  /** Draws into whatever framebuffer is bound. */
  draw(
    width: number,
    height: number,
    mood: Mood,
    light: MatrixLight,
    pixelRatio: number,
  ) {
    if (this.count === 0 || this.arrival <= 0.003) return;
    const { gl } = this;

    if (this.dirty) {
      this.dirty = false;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.stateBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.state, 0, this.count * 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.alphaBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.alpha, 0, this.count);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        this.cols,
        this.rows,
        gl.RED,
        gl.UNSIGNED_BYTE,
        this.mask,
      );
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const bufferWidth = width * pixelRatio;
    const bufferHeight = height * pixelRatio;

    // The photograph, with holes where its squares have taken over.
    {
      const { uniforms } = this.photo;
      gl.useProgram(this.photo.program);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.photoTexture);
      gl.uniform1i(uniforms.uPhoto, 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
      gl.uniform1i(uniforms.uMask, 3);
      gl.uniform2f(uniforms.uViewport, width, height);
      gl.uniform4f(
        uniforms.uRect,
        this.left,
        this.top,
        this.width,
        this.height,
      );
      gl.uniform2f(uniforms.uResolution, bufferWidth, bufferHeight);
      gl.uniform2f(
        uniforms.uOrigin,
        this.originX * pixelRatio,
        this.originY * pixelRatio,
      );
      gl.uniform1f(uniforms.uSpacing, this.spacing * pixelRatio);
      gl.uniform4f(
        uniforms.uLight,
        light.x * pixelRatio,
        light.y * pixelRatio,
        light.radius * pixelRatio,
        light.strength,
      );
      gl.bindVertexArray(this.photoVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (this.visibleSquares) {
      const { uniforms } = this.squares;
      gl.useProgram(this.squares.program);
      gl.uniform2f(uniforms.uViewport, width, height);
      gl.uniform1f(uniforms.uPixelRatio, pixelRatio);
      gl.uniform2f(uniforms.uResolution, bufferWidth, bufferHeight);
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
      gl.bindVertexArray(this.squareVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    }

    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.BLEND);
  }

  dispose() {
    const { gl } = this;
    gl.deleteBuffer(this.cornerBuffer);
    gl.deleteBuffer(this.stateBuffer);
    gl.deleteBuffer(this.alphaBuffer);
    gl.deleteBuffer(this.colorBuffer);
    gl.deleteTexture(this.photoTexture);
    gl.deleteTexture(this.maskTexture);
    gl.deleteVertexArray(this.photoVao);
    gl.deleteVertexArray(this.squareVao);
    gl.deleteProgram(this.photo.program);
    gl.deleteProgram(this.squares.program);
  }
}
