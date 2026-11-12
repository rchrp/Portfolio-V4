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
  /** Resting opacity, fade towards the canvas edges included. */
  baseAlpha: number;
  edgeNoise: number;
  /** Time at which the cell starts collapsing during the intro, in ms. */
  introDelay: number;
  /** Field level shown before the current transition, 0 to 1. */
  from: number;
  /** Field level reached at the end of the current transition. */
  to: number;
  /** Stagger of the current transition, 0 to 1. */
  delay: number;
};

/** Geometry of some cells, one path per opacity level. */
type LevelBatches = { level: number; path: Path2D }[];

/**
 * Square block of neighbouring cells. While none of them is mid-transition
 * or within the pointer's reach, their levels are constant and the tile is
 * drawn from a cached geometry.
 */
type CellTile = {
  cells: PixelCell[];
  /** Bounds of the cell centres, to tell whether the pointer reaches them. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Every cell at field level 0. Built with the grid. */
  restBatches: LevelBatches;
  /** Delays of the first and last cells that change level, if any does. */
  transition: { firstDelay: number; lastDelay: number } | null;
  /** Before the first changing cell starts. Built on first use. */
  pendingBatches: LevelBatches | null;
  /** Once the last changing cell has finished. Built on first use. */
  settledBatches: LevelBatches | null;
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

/**
 * Loads and reads an edge map ahead of its first display, so that showing it
 * later neither fetches nor reads pixels. Takes the same props as the matrix.
 */
export function prefetchField(
  field: string | null | undefined,
  source: string | null | undefined,
) {
  void getField(field, source);
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
    // Below this strength the pointer moves cells by a fraction of a pixel.
    const negligiblePointerStrength = 0.01;
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
    let tiles: CellTile[] = [];
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

    const transitionProgress = (delay: number, timestamp: number) =>
      clamp(
        (timestamp - fieldStartedAt - delay * fieldSweepDuration) /
          fieldCellDuration,
        0,
        1,
      );

    const levelOf = (cell: PixelCell, timestamp: number) => {
      if (cell.from === cell.to) return cell.to;
      const progress = transitionProgress(cell.delay, timestamp);
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

    // Cells are batched by opacity: one path and one fill per level instead
    // of one per cell, which keeps dense matrices cheap to redraw.
    const alphaLevels = 24;
    let batches: (Path2D | undefined)[] = [];
    // Side of a tile, in cells. A static tile joins the batches with one
    // `addPath` per opacity level instead of one `rect` per cell.
    const tileSize = 8;

    const interactiveScaleOf = (level: number, influence: number) =>
      Math.max(
        baseScale + (expandedScale - baseScale) * influence,
        baseScale + (fieldExpandedScale - baseScale) * level,
      );

    const interactiveAlphaOf = (
      cell: PixelCell,
      level: number,
      influence: number,
    ) =>
      cell.baseAlpha *
      (restAlpha + (1 - restAlpha) * Math.max(level, influence * 0.6));

    const appendCell = (
      target: (Path2D | undefined)[],
      cell: PixelCell,
      scale: number,
      alpha: number,
    ) => {
      const level = Math.round(clamp(alpha, 0, 1) * alphaLevels);
      if (level === 0) return;
      const size = spacing * scale;
      const halfSize = size / 2;
      const path = (target[level] ??= new Path2D());

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

    // Same arithmetic as `draw` for cells out of the pointer's reach, so a
    // cached geometry renders exactly like the cells drawn one by one.
    const buildBatches = (
      tileCells: PixelCell[],
      levelOfCell: (cell: PixelCell) => number,
    ) => {
      const paths: (Path2D | undefined)[] = [];

      for (const cell of tileCells) {
        const level = levelOfCell(cell);
        appendCell(
          paths,
          cell,
          interactiveScaleOf(level, 0),
          interactiveAlphaOf(cell, level, 0),
        );
      }

      const levelBatches: LevelBatches = [];
      paths.forEach((path, level) => {
        if (path) levelBatches.push({ level, path });
      });
      return levelBatches;
    };

    // Progress is monotonic in the delay: once the last changing cell has
    // finished, or while the first has not started, no cell of the tile moves.
    const phaseOf = (tile: CellTile, timestamp: number) => {
      const { transition } = tile;

      if (
        transition === null ||
        transitionProgress(transition.lastDelay, timestamp) === 1
      ) {
        return "settled";
      }

      return transitionProgress(transition.firstDelay, timestamp) === 0
        ? "pending"
        : "moving";
    };

    // Levels are constant while the tile is not moving.
    const buildBatchesAt = (tile: CellTile, timestamp: number) =>
      buildBatches(tile.cells, (cell) => levelOf(cell, timestamp));

    // Cached geometry of a tile out of the pointer's reach, or null while
    // some of its cells are mid-transition.
    const staticBatchesOf = (tile: CellTile, timestamp: number) => {
      const phase = phaseOf(tile, timestamp);
      if (phase === "moving") return null;

      return phase === "settled"
        ? (tile.settledBatches ??= buildBatchesAt(tile, timestamp))
        : (tile.pendingBatches ??= buildBatchesAt(tile, timestamp));
    };

    const retargetField = (animate: boolean) => {
      const timestamp = performance.now();
      const sweepOriginX = width * (0.35 + Math.random() * 0.3);
      const sweepOriginY = height * 0.5;
      const sweepRadius = Math.hypot(width, height) * 0.6;

      for (const tile of tiles) {
        // Where the new transition starts from, when the tile was not moving.
        const previousBatches =
          phaseOf(tile, timestamp) === "settled" ? tile.settledBatches : null;
        let firstDelay = Infinity;
        let lastDelay = -Infinity;
        let startsAtRest = true;
        let endsAtRest = true;

        for (const cell of tile.cells) {
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

          if (cell.from !== cell.to) {
            firstDelay = Math.min(firstDelay, cell.delay);
            lastDelay = Math.max(lastDelay, cell.delay);
          }
          if (cell.from !== 0) startsAtRest = false;
          if (cell.to !== 0) endsAtRest = false;
        }

        tile.transition =
          firstDelay <= lastDelay ? { firstDelay, lastDelay } : null;
        tile.pendingBatches = startsAtRest ? tile.restBatches : previousBatches;
        tile.settledBatches = endsAtRest ? tile.restBatches : null;
      }

      fieldStartedAt = animate && !prefersReducedMotion ? timestamp : -Infinity;
    };

    // Cells are listed row by row: the first one is the top-left corner of
    // the tile and the last one its bottom-right corner.
    const createTile = (tileCells: PixelCell[]): CellTile => {
      const first = tileCells[0];
      const last = tileCells[tileCells.length - 1];

      return {
        cells: tileCells,
        minX: first.x,
        minY: first.y,
        maxX: last.x,
        maxY: last.y,
        restBatches: buildBatches(tileCells, () => 0),
        transition: null,
        pendingBatches: null,
        settledBatches: null,
      };
    };

    const buildCells = () => {
      const columns = Math.ceil(width / spacing) + 2;
      const rows = Math.ceil(height / spacing) + 2;
      const startX = (width - (columns - 1) * spacing) / 2;
      const startY = (height - (rows - 1) * spacing) / 2;
      const tileColumns = Math.ceil(columns / tileSize);
      const tileCells: PixelCell[][] = [];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = startX + column * spacing;
          const y = startY + row * spacing;
          const edgeNoise = randomAt(column, row, 6);
          const distanceFromEdge = Math.min(x, width - x, y, height - y);
          const irregularEdgeDistance =
            distanceFromEdge + (edgeNoise - 0.5) * fadeDistance * 0.45;
          const edgeOpacity =
            fadeDistance === 0
              ? 1
              : 0.32 +
                smoothstep(clamp(irregularEdgeDistance / fadeDistance, 0, 1)) *
                  0.68;
          const rowProgress = clamp(
            (y + spacing) / (height + spacing * 2),
            0,
            1,
          );
          const tileIndex =
            Math.floor(row / tileSize) * tileColumns +
            Math.floor(column / tileSize);

          (tileCells[tileIndex] ??= []).push({
            x,
            y,
            baseAlpha: (0.56 + randomAt(column, row, 5) * 0.34) * edgeOpacity,
            edgeNoise,
            introDelay: rowProgress * introSweepDuration + edgeNoise * 60,
            from: 0,
            to: 0,
            delay: 0,
          });
        }
      }

      tiles = tileCells.map(createTile);
      retargetField(false);
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
      const responsiveRadiusSquared = responsiveRadius * responsiveRadius;
      const pointerStrength =
        pointer.strength < negligiblePointerStrength ? 0 : pointer.strength;
      const introElapsed = timestamp - introStartedAt;

      const drawLiveCell = (cell: PixelCell) => {
        let influence = 0;

        if (pointerStrength > 0) {
          const offsetX = cell.x - pointer.x;
          const offsetY = cell.y - pointer.y;
          const distanceSquared = offsetX * offsetX + offsetY * offsetY;

          // Cells out of reach of the pointer keep a zero influence.
          if (distanceSquared < responsiveRadiusSquared) {
            const proximity = 1 - Math.sqrt(distanceSquared) / responsiveRadius;
            influence = smoothstep(proximity) * pointerStrength;
          }
        }

        const level = levelOf(cell, timestamp);
        const interactiveScale = interactiveScaleOf(level, influence);
        const interactiveAlpha = interactiveAlphaOf(cell, level, influence);

        if (introComplete) {
          appendCell(batches, cell, interactiveScale, interactiveAlpha);
          return;
        }

        const collapseProgress = clamp(
          (introElapsed - cell.introDelay) / introCellDuration,
          0,
          1,
        );
        const collapseEase = 1 - Math.pow(1 - collapseProgress, 3);
        const introScale =
          introFullScale + (interactiveScale - introFullScale) * collapseEase;
        const introAlpha = 0.96 + (interactiveAlpha - 0.96) * collapseEase;

        appendCell(batches, cell, introScale, introAlpha);
      };

      // The closest point of the tile is never farther than any of its
      // cells: out of reach, every cell keeps a zero influence.
      const pointerReaches = (tile: CellTile) => {
        if (pointerStrength === 0) return false;
        const offsetX = Math.max(
          tile.minX - pointer.x,
          0,
          pointer.x - tile.maxX,
        );
        const offsetY = Math.max(
          tile.minY - pointer.y,
          0,
          pointer.y - tile.maxY,
        );
        return offsetX * offsetX + offsetY * offsetY < responsiveRadiusSquared;
      };

      for (const tile of tiles) {
        const tileBatches =
          introComplete && !pointerReaches(tile)
            ? staticBatchesOf(tile, timestamp)
            : null;

        if (tileBatches) {
          for (const { level, path } of tileBatches) {
            (batches[level] ??= new Path2D()).addPath(path);
          }
          continue;
        }

        for (const cell of tile.cells) {
          drawLiveCell(cell);
        }
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
