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

const fragmentShader = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uPhoto;
uniform sampler2D uEdges;
uniform vec2 uResolution;
uniform vec4 uImageRect;
uniform vec2 uOrigin;
uniform float uCell;
uniform float uEdgeReveal;
uniform float uFill;
uniform float uTint;
uniform float uSquare;
uniform float uSharp;
uniform vec3 uAccent;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Average of the texture over one cell, through its mipmaps; a finer
// level keeps thin contours visible.
vec4 sampleCell(sampler2D map, vec2 uv, float bias) {
  float texels = uCell / uImageRect.z * float(textureSize(map, 0).x);
  return textureLod(map, uv, max(log2(max(texels, 1.0)) + bias, 0.0));
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

  vec2 index = floor((pixel - uOrigin) / uCell + 0.5);
  vec2 center = uOrigin + index * uCell;
  vec2 uv = (center - uImageRect.xy) / uImageRect.zw;
  vec4 cells = vec4(0.0);

  if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) {
    vec4 photo = sampleCell(uPhoto, uv, 0.0);
    float edge = clamp(sampleCell(uEdges, uv, -1.5).r * 3.2, 0.0, 1.0);
    float noise = hash(index);
    // Edge cells pop in at random; the silhouette then fills cell by cell.
    float edges = edge * smoothstep(noise, noise + 0.2, uEdgeReveal * 1.2);
    float fill = smoothstep(noise * 0.6, noise * 0.6 + 0.4, uFill);
    float level = mix(edges, photo.a, fill);

    float halfSize = level * uSquare * 0.5;
    vec2 local = abs(pixel - center) / uCell;
    float aa = 0.6 / uCell;
    vec2 cover = 1.0 - smoothstep(vec2(halfSize - aa), vec2(halfSize + aa), local);
    // smoothstep on level: empty cells must not leave an antialiased speck.
    float alpha = cover.x * cover.y * smoothstep(0.02, 0.08, level) * mix(0.9, 1.0, uTint);
    vec3 color = mix(uAccent, photo.rgb, uTint);
    cells = vec4(color * alpha, alpha);
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

// Timeline, in milliseconds.
const EDGES = [80, 800] as const;
const FILL = [700, 1300] as const;
const SHRINK = [1150, 2150] as const;
const TINT = [1250, 2050] as const;
const CLOSE_GAPS = [1650, 2150] as const;
const SHARP = [2100, 2400] as const;
const DURATION = 2450;
/** Skip the intro if its textures take longer than this to arrive. */
const LOAD_BUDGET = 2200;

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
        edgeReveal: uniform("uEdgeReveal"),
        fill: uniform("uFill"),
        tint: uniform("uTint"),
        square: uniform("uSquare"),
        sharp: uniform("uSharp"),
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

      const render = (now: number) => {
        const time = now - startedAt;
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

        // Resolution doubles step by step, like a progressive image.
        const firstCell = spacing * pixelRatio;
        const steps = Math.max(1, Math.floor(Math.log2(firstCell)));
        const step = Math.min(
          steps,
          Math.floor(
            clamp01((time - SHRINK[0]) / (SHRINK[1] - SHRINK[0])) * (steps + 1),
          ),
        );
        const cell = firstCell / 2 ** step;

        context.viewport(0, 0, width, height);
        context.clear(context.COLOR_BUFFER_BIT);
        context.uniform2f(uniforms.resolution, width, height);
        context.uniform4f(
          uniforms.imageRect,
          (width - imageWidth) * alignX,
          (height - imageHeight) * alignY,
          imageWidth,
          imageHeight,
        );
        context.uniform2f(
          uniforms.origin,
          originX * pixelRatio,
          originY * pixelRatio,
        );
        context.uniform1f(uniforms.cell, Math.max(1, cell));
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

        // The real image fades in over the last frame, then the canvas goes.
        finish();
        removal = window.setTimeout(unmount, 700);
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
