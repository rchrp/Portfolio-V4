import type { CellGrid } from "./cells";
import { createProgram, type GL, type Program } from "./gl";
import type { ReliefSetting } from "./layers/name-relief";
import type { Mood } from "./moods";

// The face of the first name: plain type, set over the cells that draw its
// sides. It is the one thing in the hero's matrix that is not made of
// squares, so it reads as the top of the relief, the surface the letters
// were cut from.
//
// It still comes out of the matrix. As a letter rises, its face is a field
// of the grid's own squares that grow until they join into solid type.

const vertex = /* glsl */ `#version 300 es
in vec2 aCorner;
uniform vec2 uResolution;
// Left, top, width, height, in device pixels from the top left.
uniform vec4 uRect;
out vec2 vUv;

void main() {
  vUv = aCorner;
  vec2 position = uRect.xy + aCorner * uRect.zw;
  gl_Position = vec4(
    position.x / uResolution.x * 2.0 - 1.0,
    1.0 - position.y / uResolution.y * 2.0,
    0.0,
    1.0
  );
}`;

const fragment = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uType;
uniform vec2 uResolution;
uniform vec2 uOrigin;
uniform float uSpacing;
uniform float uRise;
uniform vec3 uColor;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float type = texture(uType, vUv).a;
  if (type <= 0.0) discard;

  // Letters rise from left to right, as their sides do.
  float risen = smoothstep(0.0, 1.0, uRise * 1.7 - vUv.x * 0.7);
  // Each cell's square grows past its own cell: the squares join.
  vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 inCell = abs(fract((pixel - uOrigin) / uSpacing + 0.5) - 0.5);
  float halfSide = smoothstep(0.05, 0.9, risen) * 0.58;
  float square = clamp((halfSide - max(inCell.x, inCell.y)) * uSpacing + 0.5, 0.0, 1.0);

  float alpha = type * square * smoothstep(0.0, 0.2, risen);
  fragColor = vec4(uColor * alpha, alpha);
}`;

const uniformNames = [
  "uType",
  "uResolution",
  "uRect",
  "uOrigin",
  "uSpacing",
  "uRise",
  "uColor",
] as const;

/** The largest picture of the word, in device pixels along its width. */
const MAX_WIDTH = 4096;

export class NameFace {
  private readonly program: Program<(typeof uniformNames)[number]>;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly buffer: WebGLBuffer | null;
  private readonly texture: WebGLTexture | null;
  private builtFor = "";

  constructor(private readonly gl: GL) {
    this.program = createProgram(gl, vertex, fragment, uniformNames);
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const corner = this.program.attribute("aCorner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }

  // Sets the word in type, at the size of the screen's own pixels.
  private build(setting: ReliefSetting, pixelRatio: number) {
    const { gl } = this;
    const scale = Math.min(pixelRatio, MAX_WIDTH / setting.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(setting.width * scale));
    canvas.height = Math.max(1, Math.round(setting.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.font = `700 ${setting.fontSize * scale}px ${setting.family}`;
    context.textBaseline = "alphabetic";
    context.fillStyle = "#fff";
    context.fillText(
      setting.text,
      (setting.x - setting.left) * scale,
      (setting.baseline - setting.top) * scale,
    );
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Draws the face over the cells, as far as the word has risen. */
  draw(
    setting: ReliefSetting | null,
    rise: number,
    grid: CellGrid,
    mood: Mood,
    pixelRatio: number,
  ) {
    if (!setting || rise <= 0.002) return;
    const key = `${setting.version}|${pixelRatio}`;
    if (key !== this.builtFor) {
      this.builtFor = key;
      this.build(setting, pixelRatio);
    }
    const { gl } = this;
    const { uniforms } = this.program;
    gl.useProgram(this.program.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(uniforms.uType, 5);
    gl.uniform2f(
      uniforms.uResolution,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    );
    gl.uniform4f(
      uniforms.uRect,
      setting.left * pixelRatio,
      setting.top * pixelRatio,
      setting.width * pixelRatio,
      setting.height * pixelRatio,
    );
    gl.uniform2f(
      uniforms.uOrigin,
      grid.originX * pixelRatio,
      grid.originY * pixelRatio,
    );
    gl.uniform1f(uniforms.uSpacing, grid.spacing * pixelRatio);
    gl.uniform1f(uniforms.uRise, rise);
    gl.uniform3f(
      uniforms.uColor,
      mood.ink[0] / 255,
      mood.ink[1] / 255,
      mood.ink[2] / 255,
    );
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.BLEND);
  }

  dispose() {
    const { gl } = this;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program.program);
  }
}
