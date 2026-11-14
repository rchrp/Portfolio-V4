import type { StageEngine, StageLayer } from "./engine";
import { createProgram, type GL, type Program } from "./gl";

// Pictures in the stage: project covers and screenshots, drawn as planes in
// the same canvas as the matrix. A plane can bend around an axis (so a column
// of cards wraps over a drum and a strip of screenshots around a cylinder),
// and can dissolve into the matrix's own squares: seen from afar, a picture
// is a mosaic of cells that sharpens into the photograph as it comes into
// focus.
//
// The layer keeps no scene of its own. Every frame, whoever wants a picture
// on screen pushes a `CardDraw`; the list is drawn, then forgotten.

export type CardDraw = {
  /** Picture to show; nothing is drawn until it has loaded. */
  src: string;
  /** Centre and size in viewport pixels, before any bending. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Bend around a horizontal axis at `pivotY`: 1 / radius, in 1 / pixels. */
  curveY?: number;
  pivotY?: number;
  /** Bend around a vertical axis at `pivotX`. */
  curveX?: number;
  pivotX?: number;
  /** Rotation about the card's centre, in radians. */
  roll?: number;
  /** 0 to 1. */
  alpha?: number;
  /** 0: the photograph; 1: a mosaic of matrix cells. */
  pixel?: number;
  /** Corner radius, in pixels. */
  radius?: number;
  /** How far the picture fades into the paper, 0 to 1. */
  dim?: number;
  /** Strength of the shadow under the card, 0 to 1. */
  shadow?: number;
  /** Which part of a picture taller than its card shows: 0 top, 0.5 centre. */
  anchor?: number;
};

type Texture = {
  texture: WebGLTexture | null;
  width: number;
  height: number;
  ready: boolean;
  /** Stage time of the last frame it was drawn. */
  usedAt: number;
  /** Eased 0 to 1 once loaded: pictures fade in instead of popping. */
  shown: number;
};

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;

uniform vec2 uViewport;
// Centre and size.
uniform vec4 uRect;
// Curvature and pivot around the horizontal axis, then the vertical one.
uniform vec4 uCurve;
uniform float uRoll;
uniform float uFocal;
// Outward margin, in pixels: the shadow is drawn on a larger plane.
uniform float uMargin;

out vec2 vLocal;
out float vDepth;

void main() {
  vec2 local = aPosition * (uRect.zw + uMargin * 2.0);
  vLocal = local;
  float c = cos(uRoll);
  float s = sin(uRoll);
  vec2 point = uRect.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  float depth = 0.0;

  if (abs(uCurve.x) > 0.000001) {
    float angle = clamp((point.y - uCurve.y) * uCurve.x, -1.45, 1.45);
    point.y = uCurve.y + sin(angle) / uCurve.x;
    depth += (1.0 - cos(angle)) / uCurve.x;
  }
  if (abs(uCurve.z) > 0.000001) {
    float angle = clamp((point.x - uCurve.w) * uCurve.z, -1.45, 1.45);
    point.x = uCurve.w + sin(angle) / uCurve.z;
    depth += (1.0 - cos(angle)) / uCurve.z;
  }

  // What bends away shrinks towards the centre of the screen.
  float scale = uFocal / (uFocal + depth);
  vec2 center = uViewport * 0.5;
  point = center + (point - center) * scale;
  vDepth = depth / uFocal;

  gl_Position = vec4(
    point.x / uViewport.x * 2.0 - 1.0,
    1.0 - point.y / uViewport.y * 2.0,
    0.0,
    1.0
  );
}`;

const fragment = /* glsl */ `#version 300 es
precision highp float;

in vec2 vLocal;
in float vDepth;

uniform sampler2D uImage;
uniform vec2 uImageSize;
uniform vec4 uRect;
uniform float uRadius;
uniform float uAlpha;
uniform float uPixel;
uniform float uCell;
uniform float uDim;
uniform float uAnchor;
uniform vec3 uPaper;
uniform vec3 uInk;
// 0: the picture; 1: its shadow.
uniform float uShadow;

out vec4 fragColor;

float roundedBox(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - (halfSize - radius);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  vec2 halfSize = uRect.zw * 0.5;
  float edge = roundedBox(vLocal, halfSize, min(uRadius, min(halfSize.x, halfSize.y)));

  if (uShadow > 0.0) {
    // A soft pool below the card, tighter right under its edge.
    float soft = 1.0 - smoothstep(-8.0, 46.0, edge);
    fragColor = vec4(uInk * soft * soft * uShadow * uAlpha * 0.2, soft * soft * uShadow * uAlpha * 0.2);
    return;
  }

  float pixelSize = fwidth(vLocal.x) + 0.0001;
  float mask = clamp(0.5 - edge / pixelSize, 0.0, 1.0);
  if (mask <= 0.0) discard;

  // The picture fills the card, cropped rather than stretched.
  vec2 uv = vLocal / uRect.zw + 0.5;
  float cardAspect = uRect.z / uRect.w;
  float imageAspect = uImageSize.x / uImageSize.y;
  vec2 fit = cardAspect > imageAspect
    ? vec2(1.0, imageAspect / cardAspect)
    : vec2(cardAspect / imageAspect, 1.0);
  vec2 offset = vec2(0.5, uAnchor);

  // The mosaic: the card is cut into cells the size of the matrix's own.
  vec2 cells = max(vec2(1.0), floor(uRect.zw / uCell));
  vec2 grid = uv * cells;
  vec2 cellUv = (floor(grid) + 0.5) / cells;
  vec2 inCell = abs(fract(grid) - 0.5);
  float mosaic = smoothstep(0.0, 0.55, uPixel);

  vec2 sampleUv = mix(uv, cellUv, mosaic);
  vec2 imageUv = (sampleUv - offset) * fit + offset;
  // Averaged over the whole cell, not picked from its centre.
  float texelsPerPixel = uImageSize.x * fit.x / uRect.z;
  float lod = mosaic * log2(max(1.0, uCell * texelsPerPixel));
  vec3 color = textureLod(uImage, imageUv, lod).rgb;

  // As in the portrait: darker cells are larger.
  float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float side = mix(0.5, 0.5 * (0.92 - 0.34 * smoothstep(0.3, 0.98, grey)), uPixel);
  float cellPixel = uCell / max(pixelSize, 0.0001);
  float gap = clamp(0.5 + (side - max(inCell.x, inCell.y)) * cellPixel, 0.0, 1.0);
  mask *= mix(1.0, gap, smoothstep(0.02, 0.2, uPixel));

  // What bends away sinks into the paper.
  float far = clamp(uDim + vDepth * 3.4, 0.0, 1.0);
  color = mix(color, uPaper, far);

  float alpha = mask * uAlpha;
  fragColor = vec4(color * alpha, alpha);
}`;

const uniformNames = [
  "uViewport",
  "uRect",
  "uCurve",
  "uRoll",
  "uFocal",
  "uMargin",
  "uImage",
  "uImageSize",
  "uRadius",
  "uAlpha",
  "uPixel",
  "uCell",
  "uDim",
  "uAnchor",
  "uPaper",
  "uInk",
  "uShadow",
] as const;

/** Planes are subdivided so they can bend. */
const SEGMENTS = 24;
/** Larger pictures are scaled down before reaching the GPU. */
const MAX_TEXTURE = 2048;
/** Seconds an unused picture stays in memory. */
const KEEP_SECONDS = 40;
const SHADOW_MARGIN = 56;

export class CardsLayer implements StageLayer {
  private readonly gl: GL;
  private readonly program: Program<(typeof uniformNames)[number]>;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly vertexBuffer: WebGLBuffer | null;
  private readonly indexBuffer: WebGLBuffer | null;
  private readonly indexCount: number;
  private readonly textures = new Map<string, Texture>();
  private readonly anisotropy: number;
  private readonly anisotropyExtension: EXT_texture_filter_anisotropic | null;
  private draws: CardDraw[] = [];
  private disposed = false;
  private sweptAt = 0;

  constructor(private readonly stage: StageEngine) {
    const gl = stage.gl;
    this.gl = gl;
    this.program = createProgram(gl, vertex, fragment, uniformNames);

    const side = SEGMENTS + 1;
    const positions = new Float32Array(side * side * 2);
    for (let row = 0; row < side; row += 1) {
      for (let column = 0; column < side; column += 1) {
        const index = (row * side + column) * 2;
        positions[index] = column / SEGMENTS - 0.5;
        positions[index + 1] = row / SEGMENTS - 0.5;
      }
    }
    const indices = new Uint16Array(SEGMENTS * SEGMENTS * 6);
    let cursor = 0;
    for (let row = 0; row < SEGMENTS; row += 1) {
      for (let column = 0; column < SEGMENTS; column += 1) {
        const a = row * side + column;
        const b = a + 1;
        const c = a + side;
        const d = c + 1;
        indices.set([a, c, b, b, c, d], cursor);
        cursor += 6;
      }
    }
    this.indexCount = indices.length;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const location = this.program.attribute("aPosition");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.anisotropyExtension = gl.getExtension(
      "EXT_texture_filter_anisotropic",
    );
    this.anisotropy = this.anisotropyExtension
      ? Math.min(
          8,
          gl.getParameter(
            this.anisotropyExtension.MAX_TEXTURE_MAX_ANISOTROPY_EXT,
          ) as number,
        )
      : 1;
  }

  /** Asks for a picture on screen this frame. */
  push(draw: CardDraw) {
    this.draws.push(draw);
  }

  /** Starts loading a picture ahead of its first appearance. */
  preload(src: string) {
    this.textureFor(src);
  }

  /** Whether a picture is ready to be drawn. */
  isReady(src: string) {
    return this.textures.get(src)?.ready ?? false;
  }

  private textureFor(src: string) {
    let entry = this.textures.get(src);
    if (entry) return entry;
    entry = {
      texture: null,
      width: 1,
      height: 1,
      ready: false,
      usedAt: this.stage.time,
      shown: 0,
    };
    this.textures.set(src, entry);
    const pending = entry;

    const image = new Image();
    if (!src.startsWith("/")) image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.src = src;
    image
      .decode()
      .then(() => {
        if (this.disposed || this.textures.get(src) !== pending) return;
        this.upload(pending, image);
        this.stage.invalidate();
      })
      .catch(() => {
        // Left unloaded: the page shows its own picture instead.
      });
    return entry;
  }

  private upload(entry: Texture, image: HTMLImageElement) {
    const { gl } = this;
    let source: TexImageSource = image;
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    const largest = Math.max(width, height);
    if (largest > MAX_TEXTURE) {
      const scale = MAX_TEXTURE / largest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, width, height);
      source = canvas;
    }

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
    } catch {
      // A cross-origin picture served without CORS headers cannot be read.
      gl.deleteTexture(texture);
      return;
    }
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.anisotropyExtension) {
      gl.texParameterf(
        gl.TEXTURE_2D,
        this.anisotropyExtension.TEXTURE_MAX_ANISOTROPY_EXT,
        this.anisotropy,
      );
    }
    gl.activeTexture(gl.TEXTURE0);
    entry.texture = texture;
    entry.width = width;
    entry.height = height;
    entry.ready = true;
  }

  // Frees pictures nobody has drawn for a while.
  private sweep(time: number) {
    if (time - this.sweptAt < 5) return;
    this.sweptAt = time;
    for (const [src, entry] of this.textures) {
      if (time - entry.usedAt < KEEP_SECONDS) continue;
      this.gl.deleteTexture(entry.texture);
      this.textures.delete(src);
    }
  }

  draw(stage: StageEngine, dt: number) {
    const draws = this.draws;
    this.draws = [];
    this.sweep(stage.time);
    if (draws.length === 0) return false;

    const { gl } = this;
    const { uniforms } = this.program;
    const { mood } = stage;
    let fading = false;

    gl.useProgram(this.program.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE1);
    gl.uniform1i(uniforms.uImage, 1);
    gl.uniform2f(uniforms.uViewport, stage.width, stage.height);
    gl.uniform1f(uniforms.uFocal, Math.max(stage.width, stage.height) * 1.15);
    gl.uniform1f(uniforms.uCell, stage.grid.spacing);
    gl.uniform3f(
      uniforms.uPaper,
      mood.bg[0] / 255,
      mood.bg[1] / 255,
      mood.bg[2] / 255,
    );
    gl.uniform3f(
      uniforms.uInk,
      mood.ink[0] / 255,
      mood.ink[1] / 255,
      mood.ink[2] / 255,
    );

    for (const card of draws) {
      const entry = this.textureFor(card.src);
      entry.usedAt = stage.time;
      if (!entry.ready) continue;
      if (entry.shown < 1) {
        entry.shown = stage.still ? 1 : Math.min(1, entry.shown + dt / 0.45);
        fading = true;
      }
      const alpha = (card.alpha ?? 1) * entry.shown;
      if (alpha <= 0.003 || card.width < 1 || card.height < 1) continue;

      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      gl.uniform2f(uniforms.uImageSize, entry.width, entry.height);
      gl.uniform4f(uniforms.uRect, card.x, card.y, card.width, card.height);
      gl.uniform4f(
        uniforms.uCurve,
        card.curveY ?? 0,
        card.pivotY ?? stage.height / 2,
        card.curveX ?? 0,
        card.pivotX ?? stage.width / 2,
      );
      gl.uniform1f(uniforms.uRoll, card.roll ?? 0);
      gl.uniform1f(uniforms.uRadius, card.radius ?? 10);
      gl.uniform1f(uniforms.uAlpha, alpha);
      gl.uniform1f(uniforms.uPixel, card.pixel ?? 0);
      gl.uniform1f(uniforms.uDim, card.dim ?? 0);
      gl.uniform1f(uniforms.uAnchor, card.anchor ?? 0.5);

      const shadow = card.shadow ?? 0;
      if (shadow > 0.01) {
        gl.uniform1f(uniforms.uShadow, shadow);
        gl.uniform1f(uniforms.uMargin, SHADOW_MARGIN);
        gl.uniform4f(
          uniforms.uRect,
          card.x,
          card.y + card.height * 0.035,
          card.width,
          card.height,
        );
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
        gl.uniform4f(uniforms.uRect, card.x, card.y, card.width, card.height);
      }
      gl.uniform1f(uniforms.uShadow, 0);
      gl.uniform1f(uniforms.uMargin, 0);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.BLEND);
    return fading;
  }

  dispose() {
    this.disposed = true;
    const { gl } = this;
    for (const entry of this.textures.values()) gl.deleteTexture(entry.texture);
    this.textures.clear();
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program.program);
  }
}
