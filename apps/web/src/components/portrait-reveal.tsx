"use client";

import { useEffect, useRef, useState } from "react";

// Hero intro: the portrait is first drawn by its edges on the matrix grid,
// then its silhouette fills in, the cells shrink until they are single pixels
// and turn from orange to the photo's colors — and the real image takes over.
//
// Everything runs in one fragment shader over one quad, for ~2.5 s; the
// WebGL context is released and the canvas removed as soon as it ends.

type PortraitRevealProps = {
  /** Precomputed edge map of the portrait (see `pnpm --filter web edges`). */
  edgeSrc: string;
  /** Light color version of the portrait, with alpha. */
  colorSrc: string;
  /** Spacing of the hero matrix, so the first cells sit on its grid. */
  cellSpacing: number;
  accent?: string;
};

const vertexShader = /* glsl */ `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// Timeline, in milliseconds.
const EDGES = [80, 750] as const;
const FILL = [650, 1200] as const;
/** First cells start splitting; each split then takes SPLIT_DURATION. */
const SPLIT_START = 1200;
const SPLIT_DURATION = 190;
/** Random wait before a cell splits, per depth; shorter where there is detail. */
const SPLIT_SPREAD = [380, 260, 180, 130, 100] as const;
const TINT = [1300, 2500] as const;
const CLOSE_GAPS = [2400, 2850] as const;
const SHARP = [2850, 3100] as const;
const DURATION = 3150;
/** Skip the intro if its textures take longer than this to arrive. */
const LOAD_BUDGET = 2200;
const MAX_DEPTH = SPLIT_SPREAD.length;
/** Radius of the hover area, in CSS pixels. */
const HOVER_RADIUS = 150;

const glslFloat = (value: number) => value.toFixed(1);

// The portrait is a quadtree over the matrix grid: each cell splits on its
// own schedule — sooner where the image has detail — and its four children
// are born on top of it, then drift apart to their quadrants while they
// shrink, with a slight overshoot. Finer cells take on the photo's colors.
const fragmentShader = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uPhoto;
uniform sampler2D uEdges;
uniform vec2 uResolution;
uniform vec4 uImageRect;
uniform vec2 uOrigin;
uniform float uCell;
uniform int uDepth;
uniform float uTime;
uniform float uEdgeReveal;
uniform float uFill;
uniform float uTint;
uniform float uSquare;
uniform float uSharp;
uniform vec3 uAccent;
// Hover mode: around the pointer, the photo turns back into matrix cells.
uniform int uMode;
uniform vec2 uPointer;
uniform float uRadius;
uniform float uStrength;
out vec4 fragColor;

const float SPLIT_START = ${glslFloat(SPLIT_START)};
const float SPLIT_DURATION = ${glslFloat(SPLIT_DURATION)};
const float SPREAD[${MAX_DEPTH}] = float[](${SPLIT_SPREAD.map(glslFloat).join(", ")});

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float easeOut(float x) {
  return 1.0 - pow(1.0 - x, 3.0);
}

float easeOutBack(float x) {
  float t = x - 1.0;
  return 1.0 + 1.9 * t * t * t + 0.9 * t * t;
}

// Average of a texture over a square of 'size' pixels, through its mipmaps.
vec4 sampleArea(sampler2D map, vec2 center, float size, float bias) {
  vec2 uv = (center - uImageRect.xy) / uImageRect.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
  float texels = size / uImageRect.z * float(textureSize(map, 0).x);
  return textureLod(map, uv, max(log2(max(texels, 1.0)) + bias, 0.0));
}

float detailAt(vec2 center, float size) {
  return clamp(sampleArea(uEdges, center, size, -1.0).r * 2.5, 0.0, 1.0);
}

// When a cell splits: some time after its parent finished, less in detail.
float splitTime(float after, vec2 id, int depth, vec2 center, float size) {
  float wait = hash(id + vec2(float(depth) * 17.3, float(depth) * 7.1));
  return after + wait * SPREAD[depth] * (1.0 - 0.7 * detailAt(center, size));
}

vec4 square(vec2 pixel, vec2 center, float halfSize, vec3 color, float alpha) {
  vec2 cover = 1.0 - smoothstep(vec2(halfSize - 0.6), vec2(halfSize + 0.6), abs(pixel - center));
  float a = cover.x * cover.y * alpha;
  return vec4(color * a, a);
}

// Finer cells take on the photo's colors sooner.
vec3 tinted(vec4 photo, int depth) {
  float tint = clamp(uTint * 1.25 + float(depth) * 0.12 - 0.25, 0.0, 1.0);
  return mix(uAccent, photo.rgb, tint);
}

// Opacity from coverage: empty cells must not leave an antialiased speck.
float presence(float level) {
  return smoothstep(0.02, 0.08, level);
}

// Same quadtree, driven by distance instead of time: cells stay coarse near
// the pointer and refine outwards, with jittered thresholds for an organic
// boundary, down to the photo itself at the edge of the area.
vec4 hoverCells(vec2 pixel, vec4 direct) {
  float area = (1.0 - smoothstep(uRadius * 0.6, uRadius, distance(pixel, uPointer))) * uStrength;
  if (area <= 0.002) return vec4(0.0);

  vec2 id = floor((pixel - uOrigin) / uCell + 0.5);
  vec2 center = uOrigin + id * uCell;
  float size = uCell;
  float influence = 0.0;
  int depth = 0;
  for (; depth < ${MAX_DEPTH}; depth++) {
    if (depth >= uDepth) break;
    influence = (1.0 - smoothstep(0.0, uRadius, distance(center, uPointer))) * uStrength;
    float jitter = (hash(id + vec2(float(depth) * 17.3, 3.1)) - 0.5) * 0.2;
    float threshold = 1.0 - float(depth + 1) / (float(uDepth) + 0.5) + jitter;
    if (influence > threshold) break;
    vec2 quadrant = step(center, pixel);
    size *= 0.5;
    center += (quadrant - 0.5) * size;
    id = id * 2.0 + quadrant;
  }
  // Finest level: the photo as it is, so the area blends into the image.
  if (depth >= uDepth) return vec4(0.0);

  vec4 photo = sampleArea(uPhoto, center, size, 0.0);
  vec3 color = mix(photo.rgb, uAccent, influence * influence * 0.5);
  float gap = mix(0.9, 0.8, influence);
  vec4 cell = square(pixel, center, size * 0.5 * gap * photo.a, color, presence(photo.a));
  // The page shows between the cells, over the silhouette only.
  vec4 page = vec4(vec3(direct.a), direct.a);
  return (cell + page * (1.0 - cell.a)) * area;
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);

  // Last step: the photo itself, pixel for pixel.
  vec2 pixelUv = (pixel - uImageRect.xy) / uImageRect.zw;
  vec4 direct = vec4(0.0);
  if (all(greaterThanEqual(pixelUv, vec2(0.0))) && all(lessThanEqual(pixelUv, vec2(1.0)))) {
    vec4 texel = texture(uPhoto, pixelUv);
    direct = vec4(texel.rgb * texel.a, texel.a);
  }

  if (uMode == 1) {
    fragColor = hoverCells(pixel, direct);
    if (fragColor.a <= 0.001) discard;
    return;
  }

  vec2 id = floor((pixel - uOrigin) / uCell + 0.5);
  vec2 center = uOrigin + id * uCell;
  float size = uCell;
  vec4 cells = vec4(0.0);
  float splitAt = splitTime(SPLIT_START, id, 0, center, size);

  if (uTime < splitAt) {
    // Matrix cells: edges pop in at random, then the silhouette fills.
    vec4 photo = sampleArea(uPhoto, center, size, 0.0);
    float edge = clamp(sampleArea(uEdges, center, size, -1.5).r * 3.2, 0.0, 1.0);
    float noise = hash(id);
    float edges = edge * smoothstep(noise, noise + 0.2, uEdgeReveal * 1.2);
    float fill = smoothstep(noise * 0.6, noise * 0.6 + 0.4, uFill);
    float level = mix(edges, photo.a, fill);
    cells = square(pixel, center, level * uSquare * size * 0.5, tinted(photo, 0), presence(level) * 0.92);
  } else {
    for (int depth = 0; depth < ${MAX_DEPTH}; depth++) {
      float progress = clamp((uTime - splitAt) / SPLIT_DURATION, 0.0, 1.0);
      float childSize = size * 0.5;
      bool leaves = depth >= uDepth - 1;

      if (progress < 1.0 || leaves) {
        // Splitting: four children slide out of the parent and shrink.
        float slide = easeOutBack(progress);
        float shrink = easeOut(progress);
        for (int quadrant = 0; quadrant < 4; quadrant++) {
          vec2 direction = vec2(float(quadrant & 1), float(quadrant >> 1)) - 0.5;
          vec2 target = center + direction * childSize;
          vec4 photo = sampleArea(uPhoto, target, childSize, 0.0);
          vec2 position = mix(center, target, slide);
          float halfSize = mix(size, childSize, shrink) * 0.5 * uSquare * photo.a;
          vec4 child = square(pixel, position, halfSize, tinted(photo, depth + 1), presence(photo.a));
          cells += child * (1.0 - cells.a);
        }
        break;
      }

      // Split done: follow the child under this pixel.
      vec2 quadrant = step(center, pixel);
      center += (quadrant - 0.5) * childSize;
      size = childSize;
      id = id * 2.0 + quadrant;
      splitAt = splitTime(splitAt + SPLIT_DURATION, id, depth + 1, center, size);

      if (uTime < splitAt) {
        vec4 photo = sampleArea(uPhoto, center, size, 0.0);
        cells = square(pixel, center, size * 0.5 * uSquare * photo.a, tinted(photo, depth + 1), presence(photo.a));
        break;
      }
    }
  }

  fragColor = mix(cells, direct, uSharp);
  if (fragColor.a <= 0.001) discard;
}`;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => value * value * (3 - 2 * value);
const phase = (time: number, start: number, end: number) =>
  ease(clamp01((time - start) / (end - start)));

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compilation failed");
  }
  return shader;
}

function createTexture(gl: WebGL2RenderingContext, image: HTMLImageElement) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const parsePosition = (value: string) => {
  const [x = "50%", y = "50%"] = value.split(" ");
  const toFraction = (part: string) =>
    part.endsWith("%") ? parseFloat(part) / 100 : 0.5;
  return [toFraction(x), toFraction(y)] as const;
};

export function PortraitReveal({
  edgeSrc,
  colorSrc,
  cellSpacing,
  accent = "#f15a24",
}: PortraitRevealProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    let gl: WebGL2RenderingContext | null = null;
    // Releases the GPU context, then removes the canvas.
    const unmount = () => {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      setMounted(false);
    };
    const finish = (immediately = false) => {
      host.dataset.intro = "done";
      if (immediately) unmount();
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish(true);
      return;
    }

    gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    });
    if (!gl) {
      finish(true);
      return;
    }
    const context = gl;

    const requestedAt = performance.now();
    let disposed = false;
    let frame = 0;
    let removal = 0;
    const resources: (() => void)[] = [];

    const start = ([edges, photo]: HTMLImageElement[]) => {
      if (disposed) return;
      if (performance.now() - requestedAt > LOAD_BUDGET) {
        finish(true);
        return;
      }

      const program = context.createProgram()!;
      const vertex = compile(context, context.VERTEX_SHADER, vertexShader);
      const fragment = compile(
        context,
        context.FRAGMENT_SHADER,
        fragmentShader,
      );
      context.attachShader(program, vertex);
      context.attachShader(program, fragment);
      context.linkProgram(program);
      if (!context.getProgramParameter(program, context.LINK_STATUS)) {
        throw new Error(context.getProgramInfoLog(program) ?? "Link failed");
      }
      context.useProgram(program);

      const buffer = context.createBuffer();
      context.bindBuffer(context.ARRAY_BUFFER, buffer);
      context.bufferData(
        context.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        context.STATIC_DRAW,
      );
      const position = context.getAttribLocation(program, "aPosition");
      context.enableVertexAttribArray(position);
      context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);

      context.activeTexture(context.TEXTURE0);
      const photoTexture = createTexture(context, photo);
      context.activeTexture(context.TEXTURE1);
      const edgeTexture = createTexture(context, edges);
      resources.push(() => {
        context.deleteTexture(photoTexture);
        context.deleteTexture(edgeTexture);
        context.deleteBuffer(buffer);
        context.deleteProgram(program);
        context.deleteShader(vertex);
        context.deleteShader(fragment);
      });

      const uniform = (name: string) =>
        context.getUniformLocation(program, name);
      const uniforms = {
        resolution: uniform("uResolution"),
        imageRect: uniform("uImageRect"),
        origin: uniform("uOrigin"),
        cell: uniform("uCell"),
        depth: uniform("uDepth"),
        time: uniform("uTime"),
        edgeReveal: uniform("uEdgeReveal"),
        fill: uniform("uFill"),
        tint: uniform("uTint"),
        square: uniform("uSquare"),
        sharp: uniform("uSharp"),
        mode: uniform("uMode"),
        pointer: uniform("uPointer"),
        radius: uniform("uRadius"),
        strength: uniform("uStrength"),
      };
      context.uniform1i(uniform("uPhoto"), 0);
      context.uniform1i(uniform("uEdges"), 1);
      const rgb = [1, 3, 5].map(
        (offset) => parseInt(accent.slice(offset, offset + 2), 16) / 255,
      );
      context.uniform3f(uniform("uAccent"), rgb[0], rgb[1], rgb[2]);
      context.clearColor(0, 0, 0, 0);

      const image = host.querySelector("img");
      const matrix = host
        .closest(".portfolio-hero")
        ?.querySelector<HTMLCanvasElement>(".hero-matrix");
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const startedAt = performance.now();
      host.dataset.intro = "running";

      let layout = {
        width: 1,
        height: 1,
        left: 0,
        top: 0,
        imageRect: [0, 0, 1, 1],
      };

      // Sizes the canvas and sets the uniforms shared by both modes.
      const prepare = () => {
        const bounds = host.getBoundingClientRect();
        const width = Math.max(1, Math.round(bounds.width * pixelRatio));
        const height = Math.max(1, Math.round(bounds.height * pixelRatio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        // Where `object-fit: contain` places the image inside the box.
        const scale = Math.min(
          width / photo.naturalWidth,
          height / photo.naturalHeight,
        );
        const imageWidth = photo.naturalWidth * scale;
        const imageHeight = photo.naturalHeight * scale;
        const [alignX, alignY] = parsePosition(
          image ? getComputedStyle(image).objectPosition : "100% 100%",
        );

        // First cells are centered on the hero matrix's own cells.
        const spacing = Math.max(8, cellSpacing);
        let originX = 0;
        let originY = 0;
        if (matrix) {
          const area = matrix.getBoundingClientRect();
          const columns = Math.ceil(area.width / spacing) + 2;
          const rows = Math.ceil(area.height / spacing) + 2;
          originX =
            area.left +
            (area.width - (columns - 1) * spacing) / 2 -
            bounds.left;
          originY =
            area.top + (area.height - (rows - 1) * spacing) / 2 - bounds.top;
        }

        // Root cells sit on the hero matrix; leaves end up about 1 px wide.
        const cell = spacing * pixelRatio;
        const depth = Math.min(
          MAX_DEPTH,
          Math.max(1, Math.floor(Math.log2(cell))),
        );
        const imageRect = [
          (width - imageWidth) * alignX,
          (height - imageHeight) * alignY,
          imageWidth,
          imageHeight,
        ];
        layout = {
          width,
          height,
          left: bounds.left,
          top: bounds.top,
          imageRect,
        };

        context.viewport(0, 0, width, height);
        context.clear(context.COLOR_BUFFER_BIT);
        context.uniform2f(uniforms.resolution, width, height);
        context.uniform4f(
          uniforms.imageRect,
          imageRect[0],
          imageRect[1],
          imageRect[2],
          imageRect[3],
        );
        context.uniform2f(
          uniforms.origin,
          originX * pixelRatio,
          originY * pixelRatio,
        );
        context.uniform1f(uniforms.cell, cell);
        context.uniform1i(uniforms.depth, depth);
      };

      const render = (now: number) => {
        frame = 0;
        const time = now - startedAt;
        prepare();
        context.uniform1i(uniforms.mode, 0);
        context.uniform1f(uniforms.time, time);
        context.uniform1f(uniforms.edgeReveal, phase(time, ...EDGES));
        context.uniform1f(uniforms.fill, phase(time, ...FILL));
        context.uniform1f(uniforms.tint, phase(time, ...TINT));
        context.uniform1f(
          uniforms.square,
          0.86 + 0.14 * phase(time, ...CLOSE_GAPS),
        );
        context.uniform1f(uniforms.sharp, phase(time, ...SHARP));
        context.drawArrays(context.TRIANGLES, 0, 3);

        if (time < DURATION) {
          frame = requestAnimationFrame(render);
          return;
        }

        // The real image fades in over the last frame, then the canvas is
        // cleared and only wakes up again under a mouse pointer.
        finish();
        removal = window.setTimeout(() => {
          if (
            !window.matchMedia("(hover: hover) and (pointer: fine)").matches
          ) {
            unmount();
            return;
          }
          context.clear(context.COLOR_BUFFER_BIT);
          enableHover();
        }, 700);
      };

      // Hover: rendered on demand only, while the pointer is around.
      const pointer = {
        clientX: 0,
        clientY: 0,
        x: 0,
        y: 0,
        strength: 0,
        target: 0,
      };

      const hoverFrame = () => {
        frame = 0;
        prepare();
        const targetX = (pointer.clientX - layout.left) * pixelRatio;
        const targetY = (pointer.clientY - layout.top) * pixelRatio;
        if (pointer.strength < 0.01) {
          pointer.x = targetX;
          pointer.y = targetY;
        }
        pointer.x += (targetX - pointer.x) * 0.22;
        pointer.y += (targetY - pointer.y) * 0.22;
        pointer.strength +=
          (pointer.target - pointer.strength) *
          (pointer.target > pointer.strength ? 0.16 : 0.1);

        if (pointer.target === 0 && pointer.strength < 0.004) {
          pointer.strength = 0;
          context.clear(context.COLOR_BUFFER_BIT);
          return;
        }

        context.uniform1i(uniforms.mode, 1);
        context.uniform2f(uniforms.pointer, pointer.x, pointer.y);
        context.uniform1f(uniforms.radius, HOVER_RADIUS * pixelRatio);
        context.uniform1f(uniforms.strength, pointer.strength);
        context.drawArrays(context.TRIANGLES, 0, 3);

        const moving =
          Math.abs(targetX - pointer.x) + Math.abs(targetY - pointer.y) > 0.3;
        const fading = Math.abs(pointer.target - pointer.strength) > 0.004;
        if (moving || fading) frame = requestAnimationFrame(hoverFrame);
      };

      const wake = () => {
        if (!frame && !disposed) frame = requestAnimationFrame(hoverFrame);
      };

      const onPointerMove = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        pointer.clientX = event.clientX;
        pointer.clientY = event.clientY;
        // Active over the photo itself, not the whole box around it.
        const [x, y, width, height] = layout.imageRect;
        const localX = (event.clientX - layout.left) * pixelRatio;
        const localY = (event.clientY - layout.top) * pixelRatio;
        const inside =
          localX >= x &&
          localX <= x + width &&
          localY >= y &&
          localY <= y + height;
        pointer.target = inside ? 1 : 0;
        if (inside || pointer.strength > 0) wake();
      };
      const onLeave = () => {
        pointer.target = 0;
        wake();
      };

      const enableHover = () => {
        if (disposed) return;
        prepare();
        context.clear(context.COLOR_BUFFER_BIT);
        window.addEventListener("pointermove", onPointerMove, {
          passive: true,
        });
        document.documentElement.addEventListener("pointerleave", onLeave);
        window.addEventListener("blur", onLeave);
        window.addEventListener("scroll", onLeave, { passive: true });
        resources.push(() => {
          window.removeEventListener("pointermove", onPointerMove);
          document.documentElement.removeEventListener("pointerleave", onLeave);
          window.removeEventListener("blur", onLeave);
          window.removeEventListener("scroll", onLeave);
        });
      };

      frame = requestAnimationFrame(render);
    };

    Promise.all([loadImage(edgeSrc), loadImage(colorSrc)])
      .then(start)
      .catch(() => {
        if (!disposed) finish(true);
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(removal);
      for (const release of resources) release();
      // Leaving it running would keep the image hidden under a stale canvas.
      if (host.dataset.intro === "running") host.dataset.intro = "done";
    };
  }, [accent, cellSpacing, colorSrc, edgeSrc]);

  if (!mounted) return null;
  return (
    <canvas
      ref={canvasRef}
      className="hero-portrait-reveal"
      aria-hidden="true"
    />
  );
}
