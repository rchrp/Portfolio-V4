import type { CellGrid } from "./cells";
import {
  createFullscreenTriangle,
  createProgram,
  fullscreenVertex,
  type GL,
  type Program,
} from "./gl";
import type { Mood } from "./moods";

// Draws the matrix: one fragment shader over the whole canvas. Each pixel
// finds the cell it belongs to, reads that cell's texel (colour and level)
// and decides whether it falls inside the cell's square. Resting dots, the
// pointer's light and the scene's halo are all computed here, so an idle
// matrix costs one texture read per pixel and nothing on the CPU.

/** Most boxes of text the shader keeps clear at once. */
export const CALM_ZONES = 8;

const fragment = /* glsl */ `#version 300 es
precision highp float;

#define CALM_ZONES ${CALM_ZONES}

uniform sampler2D uCells;
uniform ivec2 uGrid;
uniform vec2 uResolution;
uniform vec2 uOrigin;
uniform float uSpacing;
uniform float uPixelRatio;
uniform float uTime;

uniform vec3 uBackground;
uniform vec3 uRest;
uniform float uRestAlpha;
uniform float uRestSize;
uniform float uBreath;

// xy: position, z: radius, w: strength.
uniform vec4 uLight;
uniform vec3 uLightColor;
uniform vec3 uBloom;
uniform float uBloomAmount;
uniform vec4 uHalo;
uniform vec3 uHaloColor;
// Boxes of text (left, top, right, bottom): figures fade behind them.
uniform vec4 uCalm[CALM_ZONES];
uniform int uCalmCount;

out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 cell = floor((pixel - uOrigin) / uSpacing + 0.5);
  vec2 center = uOrigin + cell * uSpacing;

  // The pointer's light: a soft pool on the paper, sharper on the cells.
  float pool = distance(pixel, uLight.xy) / uLight.z;
  float bloom = exp(-pool * pool * 1.5) * uLight.w;
  float reach = distance(center, uLight.xy) / uLight.z;
  float glow = exp(-reach * reach * 2.4) * uLight.w;
  float haloReach = distance(center, uHalo.xy) / max(uHalo.z, 1.0);
  float halo = exp(-haloReach * haloReach * 2.2) * uHalo.w;
  float haloPool = distance(pixel, uHalo.xy) / max(uHalo.z, 1.0);

  vec3 background = mix(uBackground, uBloom, bloom * uBloomAmount);
  background = mix(background, uHaloColor, exp(-haloPool * haloPool * 1.6) * uHalo.w * 0.1);

  vec4 texel = vec4(0.0);
  if (cell.x >= 0.0 && cell.y >= 0.0 && cell.x < float(uGrid.x) && cell.y < float(uGrid.y)) {
    texel = texelFetch(uCells, ivec2(cell), 0);
  }
  float code = texel.a * 255.0;
  // 0: resting dot, 1: hidden (something else is drawn there), 2+: level.
  float hidden = step(0.5, code) * step(code, 1.5);
  float level = clamp((code - 2.0) / 253.0, 0.0, 1.0);

  // Behind text, whatever is drawn steps back to a murmur.
  float calm = 0.0;
  for (int index = 0; index < CALM_ZONES; index++) {
    if (index >= uCalmCount) break;
    vec4 zone = uCalm[index];
    vec2 outside = max(zone.xy - center, center - zone.zw);
    float distanceOut = length(max(outside, 0.0));
    calm = max(calm, 1.0 - smoothstep(0.0, 48.0 * uPixelRatio, distanceOut));
  }
  level *= mix(1.0, 0.24, calm);

  // Resting dots: no two quite alike, slowly swelling and ebbing in waves.
  float grain = hash(cell);
  float wave = sin(cell.x * 0.085 + cell.y * 0.06 - uTime * 0.42 + grain * 1.2)
    * sin(cell.x * 0.031 - cell.y * 0.052 + uTime * 0.23);
  float restSize = uRestSize * (0.72 + 0.5 * grain) * (1.0 + uBreath * wave * 0.55);
  float restAlpha = uRestAlpha * (0.55 + 0.75 * grain) * (1.0 + uBreath * wave * 0.4);
  restAlpha *= mix(1.0, 0.7, calm);
  restSize += glow * 0.3 + halo * 0.13;
  restAlpha = min(1.0, restAlpha + glow * 0.5 + halo * 0.2);
  vec3 restColor = mix(uRest, uHaloColor, min(1.0, halo * 0.9));
  restColor = mix(restColor, uLightColor, min(1.0, glow * 1.15));

  // A figure grows out of the resting dot, taking its colour as it does.
  float size = mix(restSize, 0.88, level);
  float alpha = mix(restAlpha, 1.0, smoothstep(0.0, 0.3, level));
  vec3 color = mix(restColor, texel.rgb, smoothstep(0.0, 0.16, level));
  color *= 1.0 + glow * 0.14 * step(0.001, level);

  float halfSide = size * uSpacing * 0.5;
  float radius = min(halfSide * 0.32, 1.25 * uPixelRatio);
  vec2 q = abs(pixel - center) - (halfSide - radius);
  float distanceToEdge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  float coverage = clamp(0.5 - distanceToEdge, 0.0, 1.0);

  fragColor = vec4(mix(background, color, coverage * alpha * (1.0 - hidden)), 1.0);
}`;

const uniformNames = [
  "uCells",
  "uGrid",
  "uResolution",
  "uOrigin",
  "uSpacing",
  "uPixelRatio",
  "uTime",
  "uBackground",
  "uRest",
  "uRestAlpha",
  "uRestSize",
  "uBreath",
  "uLight",
  "uLightColor",
  "uBloom",
  "uBloomAmount",
  "uHalo",
  "uHaloColor",
  "uCalm",
  "uCalmCount",
] as const;

export type MatrixLight = {
  x: number;
  y: number;
  radius: number;
  strength: number;
};

export class MatrixLayer {
  private readonly program: Program<(typeof uniformNames)[number]>;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly buffer: WebGLBuffer | null;
  private readonly texture: WebGLTexture | null;
  private textureCols = 0;
  private textureRows = 0;

  constructor(private readonly gl: GL) {
    this.program = createProgram(gl, fullscreenVertex, fragment, uniformNames);
    const triangle = createFullscreenTriangle(
      gl,
      this.program.attribute("aPosition"),
    );
    this.vao = triangle.vao;
    this.buffer = triangle.buffer;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Sends the cells to the GPU: one texel each. */
  upload(grid: CellGrid) {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (grid.cols !== this.textureCols || grid.rows !== this.textureRows) {
      this.textureCols = grid.cols;
      this.textureRows = grid.rows;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        grid.cols,
        grid.rows,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        grid.data,
      );
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        grid.cols,
        grid.rows,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        grid.data,
      );
    }
  }

  draw(
    grid: CellGrid,
    mood: Mood,
    light: MatrixLight,
    halo: MatrixLight,
    time: number,
    pixelRatio: number,
    calm: Float32Array,
    calmCount: number,
  ) {
    const { gl } = this;
    const { uniforms } = this.program;
    gl.useProgram(this.program.program);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(uniforms.uCells, 0);
    gl.uniform2i(uniforms.uGrid, grid.cols, grid.rows);
    gl.uniform2f(
      uniforms.uResolution,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    );
    gl.uniform2f(
      uniforms.uOrigin,
      grid.originX * pixelRatio,
      grid.originY * pixelRatio,
    );
    gl.uniform1f(uniforms.uSpacing, grid.spacing * pixelRatio);
    gl.uniform1f(uniforms.uPixelRatio, pixelRatio);
    gl.uniform1f(uniforms.uTime, time);
    gl.uniform3f(
      uniforms.uBackground,
      mood.bg[0] / 255,
      mood.bg[1] / 255,
      mood.bg[2] / 255,
    );
    gl.uniform3f(
      uniforms.uRest,
      mood.rest[0] / 255,
      mood.rest[1] / 255,
      mood.rest[2] / 255,
    );
    gl.uniform1f(uniforms.uRestAlpha, mood.restAlpha);
    gl.uniform1f(uniforms.uRestSize, mood.restSize);
    gl.uniform1f(uniforms.uBreath, mood.breath);
    gl.uniform4f(
      uniforms.uLight,
      light.x * pixelRatio,
      light.y * pixelRatio,
      light.radius * pixelRatio,
      light.strength,
    );
    gl.uniform3f(
      uniforms.uLightColor,
      mood.light[0] / 255,
      mood.light[1] / 255,
      mood.light[2] / 255,
    );
    gl.uniform3f(
      uniforms.uBloom,
      mood.bloom[0] / 255,
      mood.bloom[1] / 255,
      mood.bloom[2] / 255,
    );
    gl.uniform1f(uniforms.uBloomAmount, mood.bloomAmount);
    gl.uniform4f(
      uniforms.uHalo,
      halo.x * pixelRatio,
      halo.y * pixelRatio,
      halo.radius * pixelRatio,
      halo.strength * mood.haloAmount,
    );
    gl.uniform3f(
      uniforms.uHaloColor,
      mood.halo[0] / 255,
      mood.halo[1] / 255,
      mood.halo[2] / 255,
    );
    gl.uniform4fv(uniforms.uCalm, calm);
    gl.uniform1i(uniforms.uCalmCount, calmCount);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose() {
    const { gl } = this;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program.program);
  }
}
