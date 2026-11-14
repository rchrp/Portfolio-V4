import type { StageEngine } from "./engine";
import { createProgram, type GL, type Program } from "./gl";

// Liquid glass, drawn by the stage itself. Everything behind the page's
// floating controls is the stage's own picture, so the stage can bend it:
// under each element marked `.glass`, the picture just drawn is copied and
// drawn back refracted (pulled inwards along the rim, as a thick pane does),
// softened, with a thin split of colours on the edge.
//
// CSS could do part of this with `backdrop-filter`, but over a canvas that
// changes every frame the browser has to read the whole canvas back each
// time: measured here, that alone cost one frame in six. Done in the stage
// it is one small copy and one small quad per element, in every browser.

const vertex = /* glsl */ `#version 300 es
in vec2 aCorner;
uniform vec2 uResolution;
// Left, top, width, height, in device pixels from the top left.
uniform vec4 uRect;

void main() {
  vec2 position = uRect.xy + (aCorner + 0.5) * uRect.zw;
  gl_Position = vec4(
    position.x / uResolution.x * 2.0 - 1.0,
    1.0 - position.y / uResolution.y * 2.0,
    0.0,
    1.0
  );
}`;

const fragment = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
uniform vec4 uRect;
// Where the copied patch starts in the framebuffer, and the texture's size.
uniform vec2 uPatchOrigin;
uniform vec2 uPatchSize;
// How much of the texture the patch fills.
uniform vec2 uPatchExtent;
uniform float uRadius;
uniform float uOpacity;
uniform float uPixelRatio;

out vec4 fragColor;

float roundedBox(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - (halfSize - radius);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

vec3 scene(vec2 pixel) {
  // Framebuffer coordinates: origin at the bottom left.
  vec2 uv = (vec2(pixel.x, uResolution.y - pixel.y) - uPatchOrigin) / uPatchSize;
  return texture(uScene, clamp(uv, vec2(0.0), uPatchExtent)).rgb;
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 halfSize = uRect.zw * 0.5;
  vec2 local = pixel - (uRect.xy + halfSize);
  float radius = min(uRadius, min(halfSize.x, halfSize.y));
  float distanceToEdge = roundedBox(local, halfSize, radius);
  float mask = clamp(0.5 - distanceToEdge, 0.0, 1.0);
  if (mask <= 0.0) discard;

  // Which way is "out", from the shape's own slope.
  float nudge = 1.5;
  vec2 normal = normalize(vec2(
    roundedBox(local + vec2(nudge, 0.0), halfSize, radius) - roundedBox(local - vec2(nudge, 0.0), halfSize, radius),
    roundedBox(local + vec2(0.0, nudge), halfSize, radius) - roundedBox(local - vec2(0.0, nudge), halfSize, radius)
  ) + 0.00001);

  // The rim is where the glass is thick: the picture bends there, and
  // stays true in the middle.
  float rim = smoothstep(-13.0 * uPixelRatio, 0.0, distanceToEdge);
  float bend = rim * rim * 15.0 * uPixelRatio;
  vec2 at = pixel - normal * bend;

  // A little softness, and the colours part slightly along the rim.
  float blur = 2.6 * uPixelRatio;
  vec2 split = normal * rim * 2.4 * uPixelRatio;
  vec3 color = vec3(0.0);
  for (int index = 0; index < 5; index++) {
    vec2 tap = index == 0
      ? vec2(0.0)
      : blur * vec2(
          index == 1 ? 1.0 : index == 2 ? -1.0 : 0.0,
          index == 3 ? 1.0 : index == 4 ? -1.0 : 0.0
        );
    color.r += scene(at + tap - split).r;
    color.g += scene(at + tap).g;
    color.b += scene(at + tap + split).b;
  }
  color /= 5.0;

  // Glass gathers colour: a touch more saturation than what lies behind.
  float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(grey), color, 1.25);
  // Light catches the upper rim, and leaves the lower one.
  float catchLight = rim * rim * (0.5 - 0.5 * normal.y) * 0.22;
  color += catchLight;

  float alpha = mask * uOpacity;
  fragColor = vec4(color * alpha, alpha);
}`;

const uniformNames = [
  "uScene",
  "uResolution",
  "uRect",
  "uPatchOrigin",
  "uPatchSize",
  "uPatchExtent",
  "uRadius",
  "uOpacity",
  "uPixelRatio",
] as const;

type Pane = {
  element: HTMLElement;
  /** Its own computed style and its ancestors': their opacities multiply. */
  styles: CSSStyleDeclaration[];
  radius: number;
};

/** Pixels copied around a pane, so the bent rim has something to show. */
const MARGIN = 22;
/** Milliseconds between two looks for panes in the page. */
const REFRESH_MS = 400;

export class GlassLayer {
  private readonly gl: GL;
  private readonly program: Program<(typeof uniformNames)[number]>;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly buffer: WebGLBuffer | null;
  private readonly texture: WebGLTexture | null;
  private textureWidth = 0;
  private textureHeight = 0;
  private panes: Pane[] = [];
  private lookedAt = -Infinity;

  constructor(gl: GL) {
    this.gl = gl;
    this.program = createProgram(gl, vertex, fragment, uniformNames);
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
      gl.STATIC_DRAW,
    );
    const corner = this.program.attribute("aCorner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }

  // Finds the panes currently in the page, and what decides their opacity.
  private look() {
    const now = performance.now();
    if (now - this.lookedAt < REFRESH_MS) return;
    this.lookedAt = now;
    this.panes = Array.from(
      document.querySelectorAll<HTMLElement>(".glass"),
    ).map((element) => {
      const styles: CSSStyleDeclaration[] = [];
      for (
        let node: HTMLElement | null = element;
        node && node !== document.body;
        node = node.parentElement
      ) {
        styles.push(getComputedStyle(node));
      }
      return {
        element,
        styles,
        radius: parseFloat(styles[0].borderTopLeftRadius) || 0,
      };
    });
  }

  /** Draws the panes over whatever the stage has drawn so far. */
  draw(stage: StageEngine) {
    this.look();
    if (this.panes.length === 0) return;
    const { gl } = this;
    const { uniforms } = this.program;
    const ratio = stage.pixelRatio;
    const bufferWidth = gl.drawingBufferWidth;
    const bufferHeight = gl.drawingBufferHeight;
    let prepared = false;

    for (const pane of this.panes) {
      if (!pane.element.isConnected) continue;
      const bounds = pane.element.getBoundingClientRect();
      if (
        bounds.width < 2 ||
        bounds.bottom < 0 ||
        bounds.top > stage.height ||
        bounds.right < 0 ||
        bounds.left > stage.width
      ) {
        continue;
      }
      let opacity = 1;
      for (const style of pane.styles) {
        if (style.visibility === "hidden") {
          opacity = 0;
          break;
        }
        opacity *= Number(style.opacity);
        if (opacity < 0.01) break;
      }
      if (opacity < 0.01) continue;

      // The patch of picture behind the pane, with room around it.
      const left = Math.max(0, Math.floor((bounds.left - MARGIN) * ratio));
      const right = Math.min(
        bufferWidth,
        Math.ceil((bounds.right + MARGIN) * ratio),
      );
      const top = Math.max(0, Math.floor((bounds.top - MARGIN) * ratio));
      const bottom = Math.min(
        bufferHeight,
        Math.ceil((bounds.bottom + MARGIN) * ratio),
      );
      const width = right - left;
      const height = bottom - top;
      if (width < 2 || height < 2) continue;

      if (!prepared) {
        prepared = true;
        gl.useProgram(this.program.program);
        gl.bindVertexArray(this.vao);
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(uniforms.uScene, 4);
        gl.uniform2f(uniforms.uResolution, bufferWidth, bufferHeight);
        gl.uniform1f(uniforms.uPixelRatio, ratio);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      if (width > this.textureWidth || height > this.textureHeight) {
        this.textureWidth = Math.max(this.textureWidth, width);
        this.textureHeight = Math.max(this.textureHeight, height);
        // The canvas has no alpha: its picture can only fill an RGB texture.
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGB8,
          this.textureWidth,
          this.textureHeight,
          0,
          gl.RGB,
          gl.UNSIGNED_BYTE,
          null,
        );
      }
      const originY = bufferHeight - bottom;
      gl.copyTexSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        left,
        originY,
        width,
        height,
      );

      gl.uniform4f(
        uniforms.uRect,
        bounds.left * ratio,
        bounds.top * ratio,
        bounds.width * ratio,
        bounds.height * ratio,
      );
      gl.uniform2f(uniforms.uPatchOrigin, left, originY);
      gl.uniform2f(uniforms.uPatchSize, this.textureWidth, this.textureHeight);
      gl.uniform2f(
        uniforms.uPatchExtent,
        (width - 0.5) / this.textureWidth,
        (height - 0.5) / this.textureHeight,
      );
      gl.uniform1f(uniforms.uRadius, pane.radius * ratio);
      gl.uniform1f(uniforms.uOpacity, opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (prepared) {
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
      gl.disable(gl.BLEND);
    }
  }

  dispose() {
    const { gl } = this;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program.program);
  }
}
