"use client";

import { useEffect, useRef } from "react";
import {
  computeEdgeMap,
  rgbaToGrayscale,
  type EdgeMap,
} from "@/lib/edge-detection";

type PixelCell = {
  x: number;
  y: number;
  opacity: number;
  edgeNoise: number;
  /** Field level shown before the current transition, 0 to 1. */
  from: number;
  /** Field level reached at the end of the current transition. */
  to: number;
  /** Stagger of the current transition, 0 to 1. */
  delay: number;
};

type PointerState = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  strength: number;
  targetStrength: number;
};

/** Fractions of the canvas where the field image is fitted. */
export type FieldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PixelMatrixProps = {
  color?: string;
  cellSpacing?: number;
  influenceRadius?: number;
  minScale?: number;
  maxScale?: number;
  edgeFade?: number;
  className?: string;
  /** Plays the initial full-cell sweep. */
  intro?: boolean;
  /** Precomputed edge map (grayscale PNG) drawn by the cells. */
  field?: string | null;
  /** Image whose edge map is computed in the browser when `field` is missing. */
  fieldSource?: string | null;
  fieldRect?: FieldRect;
  fieldFit?: "cover" | "contain";
  /** Scale reached by cells on the strongest edges. */
  fieldScale?: number;
  /** Opacity of cells away from the field, relative to cells on it. */
  restOpacity?: number;
};

const fullRect: FieldRect = { x: 0, y: 0, width: 1, height: 1 };
const fieldWidth = 384;
const fieldCache = new Map<string, Promise<EdgeMap | null>>();

const loadImage = (src: string, crossOrigin: boolean) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const readPixels = (image: HTMLImageElement, width: number) => {
  const height = Math.max(
    1,
    Math.round((width * image.naturalHeight) / Math.max(1, image.naturalWidth)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas unavailable");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  // Throws for cross-origin images served without CORS headers.
  return {
    width,
    height,
    rgba: context.getImageData(0, 0, width, height).data,
  };
};

async function loadField(
  field: string | null | undefined,
  source: string | null | undefined,
): Promise<EdgeMap | null> {
  if (field) {
    // Remote edge maps (uploaded to S3) need CORS to be read back.
    const image = await loadImage(field, !field.startsWith("/"));
    const { width, height, rgba } = readPixels(image, image.naturalWidth);
    const data = new Uint8ClampedArray(width * height);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = rgba[index * 4];
    }
    return { width, height, data };
  }

  if (!source) return null;
  // Fallback for images added without running the edge-map script.
  const image = await loadImage(source, !source.startsWith("/"));
  const { width, height, rgba } = readPixels(image, fieldWidth);
  return computeEdgeMap(rgbaToGrayscale(rgba, width, height), width, height);
}

function getField(
  field: string | null | undefined,
  source: string | null | undefined,
) {
  const key = field ?? source;
  if (!key) return Promise.resolve(null);
  if (!fieldCache.has(key)) {
    fieldCache.set(
      key,
      loadField(field, source).catch(() => null),
    );
  }
  return fieldCache.get(key)!;
}

const parseColor = (value: string): [number, number, number] => {
  const hex = value.replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : hex.padEnd(6, "0");
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

const randomAt = (column: number, row: number, salt: number) => {
  const value =
    Math.sin(column * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;

  return value - Math.floor(value);
};

const smoothstep = (value: number) => value * value * (3 - 2 * value);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function PixelMatrix({
  color = "#f15a24",
  cellSpacing = 22,
  influenceRadius = 230,
  minScale = 0.17,
  maxScale = 0.76,
  edgeFade = 120,
  className,
  intro = true,
  field,
  fieldSource,
  fieldRect = fullRect,
  fieldFit = "cover",
  fieldScale,
  restOpacity = 1,
}: PixelMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Props that change while mounted are read through refs: updating them
  // morphs the matrix instead of rebuilding it (and replaying its intro).
  const liveRef = useRef({ color, field, fieldSource, fieldRect, fieldFit });
  const syncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    liveRef.current = { color, field, fieldSource, fieldRect, fieldFit };
    syncRef.current?.();
  }, [color, field, fieldSource, fieldRect, fieldFit]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const spacing = Math.max(8, cellSpacing);
    const radius = Math.max(1, influenceRadius);
    const baseScale = clamp(minScale, 0.04, 0.9);
    const expandedScale = clamp(maxScale, baseScale, 0.96);
    const fieldExpandedScale = clamp(fieldScale ?? maxScale, baseScale, 0.98);
    const restAlpha = clamp(restOpacity, 0, 1);
    const fadeDistance = Math.max(0, edgeFade);
    const introDuration = 1250;
    const introSweepDuration = 760;
    const introCellDuration = 400;
    const introFullScale = 0.92;
    const fieldSweepDuration = 720;
    const fieldCellDuration = 560;
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const pointer: PointerState = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      strength: 0,
      targetStrength: 0,
    };

    let width = 0;
    let height = 0;
    let cells: PixelCell[] = [];
    let animationFrame = 0;
    let isVisible = true;
    let isPointerInside = false;
    let prefersReducedMotion = reducedMotionQuery.matches;
    let introComplete = prefersReducedMotion || !intro;
    const introStartedAt = performance.now();
    let edgeMap: EdgeMap | null = null;
    let fieldKey: string | null = null;
    let fieldStartedAt = -Infinity;
    let fieldRequest = 0;
    const currentColor = parseColor(liveRef.current.color);
    let targetColor = currentColor.slice() as typeof currentColor;

    const fieldTransitionActive = (timestamp: number) =>
      timestamp - fieldStartedAt < fieldSweepDuration + fieldCellDuration;

    const levelOf = (cell: PixelCell, timestamp: number) => {
      if (cell.from === cell.to) return cell.to;
      const progress = clamp(
        (timestamp - fieldStartedAt - cell.delay * fieldSweepDuration) /
          fieldCellDuration,
        0,
        1,
      );
      return cell.from + (cell.to - cell.from) * smoothstep(progress);
    };

    // Field level under a cell: blend of the mean and the maximum of the edge
    // map over the cell footprint, so thin contours survive the downsampling.
    const sampleField = (cell: PixelCell) => {
      if (!edgeMap) return 0;
      const rect = liveRef.current.fieldRect;
      const rectX = rect.x * width;
      const rectY = rect.y * height;
      const rectWidth = rect.width * width;
      const rectHeight = rect.height * height;
      const localX = (cell.x - rectX) / rectWidth;
      const localY = (cell.y - rectY) / rectHeight;

      if (localX < 0 || localX > 1 || localY < 0 || localY > 1) return 0;

      const scale =
        liveRef.current.fieldFit === "contain"
          ? Math.min(rectWidth / edgeMap.width, rectHeight / edgeMap.height)
          : Math.max(rectWidth / edgeMap.width, rectHeight / edgeMap.height);
      const offsetX = rectX + (rectWidth - edgeMap.width * scale) / 2;
      const offsetY = rectY + (rectHeight - edgeMap.height * scale) / 2;
      const centerX = (cell.x - offsetX) / scale;
      const centerY = (cell.y - offsetY) / scale;
      const half = Math.max(0.5, spacing / scale / 2);
      const startX = Math.max(0, Math.floor(centerX - half));
      const endX = Math.min(edgeMap.width - 1, Math.ceil(centerX + half));
      const startY = Math.max(0, Math.floor(centerY - half));
      const endY = Math.min(edgeMap.height - 1, Math.ceil(centerY + half));

      if (startX > endX || startY > endY) return 0;

      let sum = 0;
      let maximum = 0;
      let count = 0;
      for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
          const value = edgeMap.data[y * edgeMap.width + x];
          sum += value;
          maximum = Math.max(maximum, value);
          count += 1;
        }
      }

      const feather =
        smoothstep(clamp(Math.min(localX, 1 - localX) / 0.08, 0, 1)) *
        smoothstep(clamp(Math.min(localY, 1 - localY) / 0.08, 0, 1));

      return ((0.4 * sum) / count / 255 + (0.6 * maximum) / 255) * feather;
    };

    const retargetField = (animate: boolean) => {
      const timestamp = performance.now();
      const sweepOriginX = width * (0.35 + Math.random() * 0.3);
      const sweepOriginY = height * 0.5;
      const sweepRadius = Math.hypot(width, height) * 0.6;

      for (const cell of cells) {
        const target = sampleField(cell);
        cell.from = animate ? levelOf(cell, timestamp) : target;
        cell.to = target;
        // Radial sweep with grain: the new image condenses out of the old one.
        cell.delay = clamp(
          (Math.hypot(cell.x - sweepOriginX, cell.y - sweepOriginY) /
            sweepRadius) *
            0.8 +
            cell.edgeNoise * 0.2,
          0,
          1,
        );
      }

      fieldStartedAt = animate && !prefersReducedMotion ? timestamp : -Infinity;
    };

    const buildCells = () => {
      const columns = Math.ceil(width / spacing) + 2;
      const rows = Math.ceil(height / spacing) + 2;
      const startX = (width - (columns - 1) * spacing) / 2;
      const startY = (height - (rows - 1) * spacing) / 2;
      const nextCells: PixelCell[] = [];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          nextCells.push({
            x: startX + column * spacing,
            y: startY + row * spacing,
            opacity: 0.56 + randomAt(column, row, 5) * 0.34,
            edgeNoise: randomAt(column, row, 6),
            from: 0,
            to: 0,
            delay: 0,
          });
        }
      }

      cells = nextCells;
      retargetField(false);
    };

    // Cells are batched by opacity: one path and one fill per level instead
    // of one per cell, which keeps dense matrices cheap to redraw.
    const alphaLevels = 24;
    let batches: (Path2D | null)[] = [];

    const drawCell = (cell: PixelCell, scale: number, alpha: number) => {
      const level = Math.round(clamp(alpha, 0, 1) * alphaLevels);
      if (level === 0) return;
      const size = spacing * scale;
      const halfSize = size / 2;
      const path = (batches[level] ??= new Path2D());

      if (size < 6) {
        path.rect(cell.x - halfSize, cell.y - halfSize, size, size);
      } else {
        path.roundRect(
          cell.x - halfSize,
          cell.y - halfSize,
          size,
          size,
          Math.min(2, size * 0.16),
        );
      }
    };

    const flushCells = () => {
      batches.forEach((path, level) => {
        if (!path) return;
        context.globalAlpha = level / alphaLevels;
        context.fill(path);
      });
      batches = [];
    };

    const draw = (timestamp = performance.now()) => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = `rgb(${currentColor.map(Math.round).join(" ")})`;
      const responsiveRadius = Math.min(radius, Math.max(170, width * 0.25));
      const introElapsed = timestamp - introStartedAt;

      for (const cell of cells) {
        const distanceFromPointer = Math.hypot(
          cell.x - pointer.x,
          cell.y - pointer.y,
        );
        const proximity = clamp(
          1 - distanceFromPointer / responsiveRadius,
          0,
          1,
        );
        const influence = smoothstep(proximity) * pointer.strength;
        const level = levelOf(cell, timestamp);
        const interactiveScale = Math.max(
          baseScale + (expandedScale - baseScale) * influence,
          baseScale + (fieldExpandedScale - baseScale) * level,
        );
        const distanceFromEdge = Math.min(
          cell.x,
          width - cell.x,
          cell.y,
          height - cell.y,
        );
        const irregularEdgeDistance =
          distanceFromEdge + (cell.edgeNoise - 0.5) * fadeDistance * 0.45;
        const edgeOpacity =
          fadeDistance === 0
            ? 1
            : 0.32 +
              smoothstep(clamp(irregularEdgeDistance / fadeDistance, 0, 1)) *
                0.68;
        const fieldOpacity =
          restAlpha + (1 - restAlpha) * Math.max(level, influence * 0.6);
        const interactiveAlpha = cell.opacity * edgeOpacity * fieldOpacity;

        if (introComplete) {
          drawCell(cell, interactiveScale, interactiveAlpha);
          continue;
        }

        const rowProgress = clamp(
          (cell.y + spacing) / (height + spacing * 2),
          0,
          1,
        );
        const cellDelay =
          rowProgress * introSweepDuration + cell.edgeNoise * 60;
        const collapseProgress = clamp(
          (introElapsed - cellDelay) / introCellDuration,
          0,
          1,
        );
        const collapseEase = 1 - Math.pow(1 - collapseProgress, 3);
        const introScale =
          introFullScale + (interactiveScale - introFullScale) * collapseEase;
        const introAlpha = 0.96 + (interactiveAlpha - 0.96) * collapseEase;

        drawCell(cell, introScale, introAlpha);
      }

      flushCells();

      if (!introComplete && introElapsed >= introDuration) {
        introComplete = true;
        pointer.targetStrength = isPointerInside ? 1 : 0;
      }
    };

    const animate = (timestamp: number) => {
      animationFrame = 0;

      if (!isVisible || prefersReducedMotion) {
        return;
      }

      const positionEase = 0.19;
      const strengthEase =
        pointer.targetStrength > pointer.strength ? 0.22 : 0.12;
      let colorDelta = 0;

      pointer.x += (pointer.targetX - pointer.x) * positionEase;
      pointer.y += (pointer.targetY - pointer.y) * positionEase;
      pointer.strength +=
        (pointer.targetStrength - pointer.strength) * strengthEase;
      for (let channel = 0; channel < 3; channel += 1) {
        currentColor[channel] +=
          (targetColor[channel] - currentColor[channel]) * 0.08;
        colorDelta += Math.abs(targetColor[channel] - currentColor[channel]);
      }
      draw(timestamp);

      const positionDelta =
        Math.abs(pointer.targetX - pointer.x) +
        Math.abs(pointer.targetY - pointer.y);
      const strengthDelta = Math.abs(pointer.targetStrength - pointer.strength);

      if (
        !introComplete ||
        strengthDelta > 0.006 ||
        colorDelta > 0.5 ||
        fieldTransitionActive(timestamp) ||
        (pointer.targetStrength > 0 && positionDelta > 0.15)
      ) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const requestDraw = () => {
      if (prefersReducedMotion) {
        draw();
        return;
      }

      if (!animationFrame && isVisible) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    // Applies color and field props changed after mount.
    const sync = () => {
      const live = liveRef.current;
      targetColor = parseColor(live.color);

      if (prefersReducedMotion) {
        currentColor.splice(0, 3, ...targetColor);
      }

      const nextKey = live.field ?? live.fieldSource ?? null;

      if (nextKey === fieldKey) {
        retargetField(false);
        requestDraw();
        return;
      }

      fieldKey = nextKey;
      const request = ++fieldRequest;
      void getField(live.field, live.fieldSource).then((map) => {
        if (request !== fieldRequest) return;
        edgeMap = map;
        retargetField(true);
        requestDraw();
      });
    };

    const deactivatePointer = () => {
      isPointerInside = false;
      pointer.targetStrength = 0;
      requestDraw();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (prefersReducedMotion) {
        return;
      }

      const bounds = canvas.getBoundingClientRect();
      const isInside =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;

      if (!isInside) {
        if (isPointerInside) deactivatePointer();
        return;
      }

      isPointerInside = true;
      pointer.targetX = event.clientX - bounds.left;
      pointer.targetY = event.clientY - bounds.top;

      if (pointer.strength < 0.01) {
        pointer.x = pointer.targetX;
        pointer.y = pointer.targetY;
      }

      if (introComplete) {
        pointer.targetStrength = 1;
        requestDraw();
      }
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) {
        deactivatePointer();
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        deactivatePointer();
      }
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, bounds.width);
      const nextHeight = Math.max(1, bounds.height);

      if (nextWidth === width && nextHeight === height) {
        return;
      }

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const pointerScaleX = width > 0 ? nextWidth / width : 1;
      const pointerScaleY = height > 0 ? nextHeight / height : 1;

      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      if (
        isPointerInside ||
        pointer.strength > 0.01 ||
        pointer.targetStrength > 0
      ) {
        pointer.x *= pointerScaleX;
        pointer.y *= pointerScaleY;
        pointer.targetX *= pointerScaleX;
        pointer.targetY *= pointerScaleY;
      } else {
        pointer.x = width / 2;
        pointer.y = height / 2;
        pointer.targetX = pointer.x;
        pointer.targetY = pointer.y;
      }

      buildCells();
      draw();
    };

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
      introComplete = true;
      pointer.strength = 0;
      pointer.targetStrength = 0;
      fieldStartedAt = -Infinity;
      currentColor.splice(0, 3, ...targetColor);

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }

      draw();
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;

      if (!isVisible && animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }

      if (isVisible) {
        draw();
        requestDraw();
      }
    });

    resizeObserver.observe(canvas);
    window.addEventListener("resize", resize, { passive: true });
    intersectionObserver.observe(canvas);
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerout", handlePointerOut);
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("blur", deactivatePointer);
    reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
    resize();
    syncRef.current = sync;
    sync();
    requestDraw();

    return () => {
      syncRef.current = null;
      fieldRequest += 1;
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("blur", deactivatePointer);
      reducedMotionQuery.removeEventListener(
        "change",
        handleReducedMotionChange,
      );

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [
    cellSpacing,
    edgeFade,
    fieldScale,
    influenceRadius,
    intro,
    maxScale,
    minScale,
    restOpacity,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{
        display: "block",
        height: "100%",
        pointerEvents: "none",
        width: "100%",
      }}
    />
  );
}
