// Draws what the monitor displays into a 2D canvas, the screen's texture:
// each project laid out like the hero of its showcase — its picture, a blur
// deepening towards the bottom where the project introduces itself — so that
// opening it feels like stepping into the glass. Between the projects, a few
// words typed after a blinking cursor, and in the other chapters the cards
// of `screen-cards.ts`.

import {
  cardSettleTime,
  drawCard,
  palette,
  type Pen,
  type ScreenCard,
} from "./screen-cards";

export type ScreenProject = {
  slug: string;
  title: string;
  summary: string;
  /** Context and period, e.g. "Freelance" and "2022 – 2024". */
  kicker: [string, string];
  /** Short facts beside the summary, on wide screens only. */
  facts: { label: string; value: string }[];
  imageUrl: string;
  accentColor: string;
  index: number;
  total: number;
};

/** "compact" enlarges the text for the small screens of phones. */
export type ScreenLayout = "wide" | "compact";

/** A few words shown between the projects. */
export type ScreenMessage = {
  kicker: string;
  text: string;
  footnote?: string;
};

type Mode =
  | { kind: "off" }
  | { kind: "project"; startedAt: number; project: ScreenProject }
  | { kind: "message"; startedAt: number; message: ScreenMessage }
  | { kind: "card"; startedAt: number; card: ScreenCard };

const noRegions: ScreenRegion[] = [];

/** A clickable part of the glass, as shares of its width and height. */
export type ScreenRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Artwork = {
  image: HTMLImageElement;
  /** The picture blurred, fading in towards the bottom. */
  blur: HTMLCanvasElement;
  width: number;
  height: number;
};

// Drawing units, about 1.69:1 like the glass. The canvas holds 4/3 as many
// pixels.
const WIDTH = 1296;
const HEIGHT = 768;
const pixelRatio = 4 / 3;

const { phosphor, soft, dim, hairline, glassTint, night, accent } = palette;
// The picture scans in, then the text rises element by element.
const revealDuration = 520;
const textDelay = 240;
const textDuration = 520;
const textStagger = 70;
const settleTime = textDelay + textDuration + textStagger * 4;
// Messages are typed one character at a time, after the cursor.
const typeDelay = 260;
const typeInterval = 55;
const cursorPeriod = 1060;
// Display titles are tightly tracked, as on the site (in ems).
const titleTracking = -0.065;
// "↗" in a 3×3 pixel grid, like the site's buttons.
const arrowCells = new Set([0, 1, 2, 4, 5, 6, 8]);

type Metrics = {
  margin: number;
  top: number;
  bottom: number;
  kicker: number;
  title: number;
  titleMin: number;
  summary: number;
  summaryLeading: number;
  summaryWidth: number;
  summaryLines: number;
  /** Width of the facts column; 0 leaves it out. */
  side: number;
  label: number;
  value: number;
  pill: number;
  pillLabel: string;
  counter: number;
  /** The words of a message, and its kicker. */
  message: number;
  messageKicker: number;
};

const metrics: Record<ScreenLayout, Metrics> = {
  // The glass's corners are well rounded: margins keep clear of them.
  wide: {
    margin: 96,
    top: 64,
    bottom: 72,
    kicker: 28,
    title: 130,
    titleMin: 68,
    summary: 34,
    summaryLeading: 46,
    summaryWidth: 680,
    summaryLines: 3,
    side: 340,
    label: 22,
    value: 24,
    pill: 24,
    pillLabel: "Découvrir le projet",
    counter: 22,
    message: 190,
    messageKicker: 40,
  },
  compact: {
    margin: 96,
    top: 72,
    bottom: 80,
    kicker: 42,
    title: 200,
    titleMin: 110,
    summary: 56,
    summaryLeading: 70,
    summaryWidth: 1104,
    summaryLines: 2,
    side: 0,
    label: 0,
    value: 0,
    pill: 42,
    pillLabel: "Ouvrir",
    counter: 42,
    message: 230,
    messageKicker: 52,
  },
};

const artworkCache = new Map<string, Promise<Artwork | null>>();
const loadedArtwork = new Map<string, Artwork | null>();

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable.");
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    if (!src.startsWith("/")) image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** Where a picture of this size lands when it covers `width` × `height`. */
function coverRect(
  imageWidth: number,
  imageHeight: number,
  width = WIDTH,
  height = HEIGHT,
) {
  const scale = Math.max(width / imageWidth, height / imageHeight);
  return {
    x: (width - imageWidth * scale) / 2,
    y: (height - imageHeight * scale) / 2,
    width: imageWidth * scale,
    height: imageHeight * scale,
  };
}

// Scaled down then up, the picture blurs without canvas filters, which not
// every browser supports.
function prepareArtwork(image: HTMLImageElement): Artwork {
  // Vector pictures without intrinsic size report 0.
  const width = image.naturalWidth || WIDTH;
  const height = image.naturalHeight || HEIGHT;
  const step = createCanvas(288, 192);
  const cover = coverRect(width, height, 288, 192);
  step.context.drawImage(image, cover.x, cover.y, cover.width, cover.height);
  const tiny = createCanvas(48, 32);
  tiny.context.drawImage(step.canvas, 0, 0, 48, 32);
  const blur = createCanvas(288, 192);
  blur.context.drawImage(tiny.canvas, 0, 0, 288, 192);
  // Sharp at the top, blurred from mid-height down, as in the showcase.
  const fade = blur.context.createLinearGradient(0, 0, 0, 192);
  fade.addColorStop(0.3, "rgba(0, 0, 0, 0)");
  fade.addColorStop(0.75, "rgba(0, 0, 0, 1)");
  blur.context.globalCompositeOperation = "destination-in";
  blur.context.fillStyle = fade;
  blur.context.fillRect(0, 0, 288, 192);
  return { image, blur: blur.canvas, width, height };
}

function loadArtwork(src: string) {
  let pending = artworkCache.get(src);
  if (!pending) {
    pending = loadImage(src).then((image) => {
      const artwork = image && prepareArtwork(image);
      loadedArtwork.set(src, artwork);
      return artwork;
    });
    artworkCache.set(src, pending);
  }
  return pending;
}

const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);
const easeInOut = (value: number) => value * value * (3 - 2 * value);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const pad = (value: number) => String(value).padStart(2, "0");

export class ScreenComposer {
  readonly canvas: HTMLCanvasElement;
  /** Average color of what is displayed, used to tint the screen's light. */
  readonly lightColor: [number, number, number] = [0.9, 0.88, 0.82];
  private readonly context: CanvasRenderingContext2D;
  private readonly sans: string;
  private mode: Mode = { kind: "off" };
  private artwork: Artwork | null = null;
  private layout: ScreenLayout = "wide";
  private hovered = false;
  private focus = 0;
  private drawnFocus = 0;
  // What the last message frame showed: characters typed, cursor lit.
  private drawnTyped = -1;
  private drawnCursor = false;
  // Cards: the region under the pointer or the focus, the copy button that
  // just copied, the chapter's scroll progress, and the regions drawn.
  private highlight: string | null = null;
  private copied: string | null = null;
  private progress = 0;
  private drawnProgress = -1;
  private cardRegions: ScreenRegion[] = [];
  private readonly pen: Pen;
  /** Something changed outside the animations: redraw once. */
  private stale = false;

  constructor(fonts: { sans: string }) {
    const { canvas, context } = createCanvas(
      WIDTH * pixelRatio,
      HEIGHT * pixelRatio,
    );
    this.canvas = canvas;
    this.context = context;
    this.sans = fonts.sans;
    this.pen = {
      context,
      font: (weight, size, tracking) => this.font(weight, size, tracking),
      wrap: (text, maxWidth, maxLines) => this.wrap(text, maxWidth, maxLines),
      pill: (x, y, height, label, options) =>
        this.pill(x, y, height, label, options),
      pillWidth: (height, label, arrow) => this.pillWidth(height, label, arrow),
    };
    this.clear();
  }

  /** What the glass shows: "off", "project", "message" or a card's kind. */
  get showing(): string {
    return this.mode.kind === "card" ? this.mode.card.kind : this.mode.kind;
  }

  /** The regions of the card on the glass, from its last frame. */
  get regions(): ScreenRegion[] {
    return this.mode.kind === "card" ? this.cardRegions : noRegions;
  }

  off() {
    this.mode = { kind: "off" };
    this.clear();
  }

  showProject(project: ScreenProject, now: number, instant = false) {
    this.mode = {
      kind: "project",
      project,
      startedAt: instant ? -Infinity : now,
    };
    // An instant switch has no animation left to redraw it.
    this.stale = true;
    const src = project.imageUrl;
    this.artwork = loadedArtwork.get(src) ?? null;
    this.measureLight(this.artwork?.image ?? null, project.accentColor);
    if (loadedArtwork.has(src)) return;
    void loadArtwork(src).then((artwork) => {
      if (this.mode.kind !== "project" || this.mode.project.imageUrl !== src)
        return;
      this.artwork = artwork;
      this.stale = true;
      this.measureLight(artwork?.image ?? null, project.accentColor);
    });
  }

  showMessage(message: ScreenMessage, now: number, instant = false) {
    this.mode = {
      kind: "message",
      message,
      startedAt: instant ? -Infinity : now,
    };
    this.stale = true;
    this.artwork = null;
    // The warm glow of the words.
    this.lightColor[0] = 0.98;
    this.lightColor[1] = 0.82;
    this.lightColor[2] = 0.72;
  }

  showCard(card: ScreenCard, now: number, instant = false) {
    this.mode = { kind: "card", card, startedAt: instant ? -Infinity : now };
    this.stale = true;
    this.artwork = null;
    this.cardRegions = [];
    this.lightColor[0] = 0.98;
    this.lightColor[1] = 0.84;
    this.lightColor[2] = 0.76;
  }

  /** Lights up a card's region, under the pointer or the focus. */
  setHighlight(id: string | null) {
    if (id === this.highlight) return;
    this.highlight = id;
    this.stale = true;
  }

  /** Marks a copy button as done, or clears it. */
  setCopied(id: string | null) {
    if (id === this.copied) return;
    this.copied = id;
    this.stale = true;
  }

  /** Scroll progress of the chapter shown by the card, 0 → 1. */
  setProgress(progress: number) {
    this.progress = progress;
  }

  setLayout(layout: ScreenLayout) {
    if (layout === this.layout) return;
    this.layout = layout;
    this.stale = true;
  }

  /** The pointer is over the glass: the "open" button lights up. */
  setHovered(hovered: boolean) {
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.stale = true;
  }

  /** 0 → the project's hero, 1 → its picture alone. */
  setFocus(amount: number) {
    this.focus = amount;
  }

  /** Redraws the screen; returns false when nothing changed since last call. */
  draw(now: number): boolean {
    const mode = this.mode;
    if (mode.kind === "off") return false;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const elapsed = now - mode.startedAt;
    if (mode.kind === "message") {
      const { text } = mode.message;
      const typed = Math.min(
        text.length,
        Math.max(0, Math.floor((elapsed - typeDelay) / typeInterval)),
      );
      // Steady while typing, blinking once done.
      const cursor =
        typed < text.length || Math.floor(now / (cursorPeriod / 2)) % 2 === 0;
      if (
        !this.stale &&
        typed === this.drawnTyped &&
        cursor === this.drawnCursor
      )
        return false;
      this.stale = false;
      this.drawnTyped = typed;
      this.drawnCursor = cursor;
      this.drawMessage(mode.message, typed, cursor);
      return true;
    }

    if (mode.kind === "card") {
      const progress = mode.card.kind === "manifesto" ? this.progress : 0;
      if (
        !this.stale &&
        elapsed >= cardSettleTime &&
        progress === this.drawnProgress
      )
        return false;
      this.stale = false;
      this.drawnProgress = progress;
      const regions: ScreenRegion[] = [];
      drawCard(
        this.pen,
        {
          width: WIDTH,
          height: HEIGHT,
          compact: this.layout === "compact",
          elapsed,
          progress,
          highlight: this.highlight,
          copied: this.copied,
          region: (id, x, y, width, height) =>
            regions.push({
              id,
              x: x / WIDTH,
              y: y / HEIGHT,
              width: width / WIDTH,
              height: height / HEIGHT,
            }),
        },
        mode.card,
      );
      this.cardRegions = regions;
      return true;
    }

    if (elapsed >= settleTime && !this.stale && this.focus === this.drawnFocus)
      return false;
    this.stale = false;
    this.drawnFocus = this.focus;
    this.drawProject(mode.project, elapsed);
    return true;
  }

  private clear() {
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.fillStyle = "#000";
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private measureLight(image: HTMLImageElement | null, accent: string) {
    const { context } = createCanvas(8, 8);
    context.fillStyle = accent;
    context.fillRect(0, 0, 8, 8);
    try {
      if (image) context.drawImage(image, 0, 0, 8, 8);
      const data = context.getImageData(0, 0, 8, 8).data;
      const sum = [0, 0, 0];
      for (let index = 0; index < data.length; index += 4) {
        sum[0] += data[index];
        sum[1] += data[index + 1];
        sum[2] += data[index + 2];
      }
      // Lean towards white: a CRT's light reads mostly as a cool glow.
      for (let channel = 0; channel < 3; channel += 1) {
        this.lightColor[channel] = (sum[channel] / 64 / 255) * 0.55 + 0.45;
      }
    } catch {
      // Cross-origin image without CORS: keep the previous tint.
    }
  }

  /** Sets the font and its tracking, in ems, so none leaks to the next text. */
  private font(weight: number, size: number, tracking = 0) {
    this.context.font = `${weight} ${size}px ${this.sans}`;
    this.context.letterSpacing = `${tracking * size}px`;
  }

  /** Words of `text` in at most `maxLines` lines, the last one cut short. */
  private wrap(text: string, maxWidth: number, maxLines: number) {
    const context = this.context;
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      lines.push(line);
      line = word;
    }
    if (line) lines.push(line);
    const overflow = lines.length > maxLines;
    const shown = lines.slice(0, maxLines);
    if (overflow) {
      let last = shown[maxLines - 1];
      while (last && context.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1).trimEnd();
      }
      shown[maxLines - 1] = `${last}…`;
    }
    return { lines: shown, overflow };
  }

  /** The largest title size that fits on one line, else on two. */
  private fitTitle(title: string, maxWidth: number, sizes: Metrics) {
    const context = this.context;
    for (let size = sizes.title; size >= sizes.titleMin; size -= 4) {
      this.font(450, size, titleTracking);
      if (context.measureText(title).width <= maxWidth) {
        return { size, lines: [title] };
      }
    }
    for (
      let size = Math.round(sizes.title * 0.8);
      size > sizes.titleMin;
      size -= 4
    ) {
      this.font(450, size, titleTracking);
      const { lines, overflow } = this.wrap(title, maxWidth, 2);
      if (
        !overflow &&
        lines.every((line) => context.measureText(line).width <= maxWidth)
      )
        return { size, lines };
    }
    this.font(450, sizes.titleMin, titleTracking);
    return { size: sizes.titleMin, lines: this.wrap(title, maxWidth, 2).lines };
  }

  private drawMessage(message: ScreenMessage, typed: number, cursor: boolean) {
    const context = this.context;
    const sizes = metrics[this.layout];
    context.globalAlpha = 1;
    context.fillStyle = night;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    // A faint warmth in the middle of the tube.
    const glow = context.createRadialGradient(
      WIDTH / 2,
      HEIGHT * 0.55,
      0,
      WIDTH / 2,
      HEIGHT * 0.55,
      WIDTH * 0.62,
    );
    glow.addColorStop(0, "rgba(241, 90, 36, 0.16)");
    glow.addColorStop(1, "rgba(241, 90, 36, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.textBaseline = "top";
    context.textAlign = "left";
    const left = sizes.margin;
    this.font(500, sizes.messageKicker, 0.02);
    context.fillStyle = soft;
    context.fillText(message.kicker, left, sizes.top + 8);

    // As large as the words fit, cursor included.
    let size = sizes.message;
    this.font(450, size, titleTracking);
    const fullWidth = context.measureText(message.text).width + size * 0.6;
    const maxWidth = WIDTH - left * 2;
    if (fullWidth > maxWidth) {
      size = Math.floor((size * maxWidth) / fullWidth);
      this.font(450, size, titleTracking);
    }
    const shown = message.text.slice(0, typed);
    const top = HEIGHT * 0.5 - size * 0.45;
    context.fillStyle = accent;
    context.fillText(shown, left, top);
    if (cursor) {
      const x = left + context.measureText(shown).width + size * 0.08;
      context.fillStyle = phosphor;
      context.fillRect(x, top + size * 0.06, size * 0.42, size * 0.82);
    }

    if (message.footnote) {
      this.font(400, sizes.messageKicker);
      context.fillStyle = dim;
      context.fillText(
        message.footnote,
        left,
        HEIGHT - sizes.bottom - sizes.messageKicker,
      );
    }
  }

  private drawProject(project: ScreenProject, elapsed: number) {
    const context = this.context;
    const sizes = metrics[this.layout];
    // Diving in skips what is left of the opening animations.
    if (this.focus > 0) elapsed = Math.max(elapsed, settleTime);
    const overlay = 1 - easeInOut(this.focus);

    context.fillStyle = night;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    // The picture scans in from the top, like a slow modem.
    const loaded = easeOut(clamp01(elapsed / revealDuration));
    context.save();
    context.beginPath();
    context.rect(0, 0, WIDTH, HEIGHT * loaded);
    context.clip();
    const artwork = this.artwork;
    if (artwork) {
      const cover = coverRect(artwork.width, artwork.height);
      context.drawImage(
        artwork.image,
        cover.x,
        cover.y,
        cover.width,
        cover.height,
      );
    } else {
      context.fillStyle = project.accentColor;
      context.globalAlpha = 0.4;
      context.fillRect(0, 0, WIDTH, HEIGHT);
    }
    context.globalAlpha = overlay;
    if (artwork) context.drawImage(artwork.blur, 0, 0, WIDTH, HEIGHT);
    // Down to the night of the next chapters, as in the showcase.
    const shade = context.createLinearGradient(0, 0, 0, HEIGHT);
    shade.addColorStop(0, "rgba(12, 11, 9, 0.35)");
    shade.addColorStop(0.16, "rgba(12, 11, 9, 0)");
    shade.addColorStop(0.42, "rgba(12, 11, 9, 0.08)");
    shade.addColorStop(0.68, "rgba(12, 11, 9, 0.6)");
    shade.addColorStop(1, "rgba(12, 11, 9, 0.92)");
    context.fillStyle = shade;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.restore();
    if (loaded < 1) {
      context.fillStyle = phosphor;
      context.fillRect(0, HEIGHT * loaded - 2, WIDTH, 3);
    }
    if (overlay <= 0) return;

    const rise = (step: number) => {
      const shown = easeOut(
        clamp01((elapsed - textDelay - step * textStagger) / textDuration),
      );
      context.globalAlpha = shown * overlay;
      return (1 - shown) * 18;
    };
    context.textBaseline = "top";
    context.textAlign = "left";

    const left = sizes.margin;
    const sideLeft = WIDTH - sizes.margin - sizes.side;
    const textRight = sizes.side ? sideLeft - 64 : WIDTH - sizes.margin;
    const bottom = HEIGHT - sizes.bottom;

    this.font(400, sizes.summary);
    const summary = this.wrap(
      project.summary,
      Math.min(sizes.summaryWidth, textRight - left),
      sizes.summaryLines,
    ).lines;
    const summaryTop = bottom - summary.length * sizes.summaryLeading;
    const title = this.fitTitle(project.title, textRight - left, sizes);
    const titleLeading = title.size * 0.9;
    const titleTop =
      summaryTop - title.size * 0.22 - title.lines.length * titleLeading;
    const kickerTop = titleTop - sizes.kicker - 26;

    // Kicker: context · period.
    let offset = rise(0);
    const [kind, period] = project.kicker;
    this.font(500, sizes.kicker);
    context.fillStyle = soft;
    context.fillText(kind, left, kickerTop + offset);
    let x = left + context.measureText(kind).width + sizes.kicker * 0.5;
    context.fillStyle = project.accentColor;
    context.fillText("·", x, kickerTop + offset);
    x += context.measureText("·").width + sizes.kicker * 0.5;
    context.fillStyle = soft;
    context.fillText(period, x, kickerTop + offset);

    // Title, with its number tucked behind its top right.
    offset = rise(1);
    this.font(450, title.size, titleTracking);
    const firstLine = context.measureText(title.lines[0]).width;
    const indexSize = title.size * 0.55;
    this.font(500, indexSize, -0.07);
    context.fillStyle = project.accentColor;
    context.textAlign = "right";
    context.fillText(
      pad(project.index + 1),
      left + firstLine + indexSize * 0.5,
      titleTop - indexSize * 0.32 + offset,
    );
    context.textAlign = "left";
    this.font(450, title.size, titleTracking);
    context.fillStyle = phosphor;
    title.lines.forEach((line, row) => {
      context.fillText(line, left, titleTop + row * titleLeading + offset);
    });

    offset = rise(2);
    this.font(400, sizes.summary);
    context.fillStyle = phosphor;
    summary.forEach((line, row) => {
      context.fillText(
        line,
        left,
        summaryTop +
          row * sizes.summaryLeading +
          (sizes.summaryLeading - sizes.summary) / 2 +
          offset,
      );
    });

    const pillHeight = sizes.pill * 2.8;
    if (sizes.side) {
      // Facts above the "open" button, at the bottom right.
      offset = rise(3);
      let y = bottom - pillHeight - 30;
      for (const fact of [...project.facts].reverse()) {
        this.font(400, sizes.value);
        const value = this.wrap(fact.value, sizes.side, 2).lines;
        y -= value.length * sizes.value * 1.35;
        value.forEach((line, row) => {
          context.fillStyle = phosphor;
          context.fillText(
            line,
            sideLeft,
            y + row * sizes.value * 1.35 + offset,
          );
        });
        y -= sizes.label + 6;
        this.font(400, sizes.label);
        context.fillStyle = dim;
        context.fillText(fact.label, sideLeft, y + offset);
        y -= 18;
      }
      context.fillStyle = hairline;
      context.fillRect(sideLeft, y + offset, sizes.side, 1.5);

      offset = rise(4);
      this.pill(
        sideLeft,
        bottom - pillHeight + offset,
        pillHeight,
        sizes.pillLabel,
        {
          lit: this.hovered,
        },
      );
      this.drawCounter(project, WIDTH - sizes.margin, sizes.top, "right");
    } else {
      rise(4);
      this.drawCounter(project, sizes.margin, sizes.top, "left");
      this.pill(
        WIDTH - sizes.margin - this.pillWidth(pillHeight, sizes.pillLabel),
        sizes.top,
        pillHeight,
        sizes.pillLabel,
        { lit: this.hovered },
      );
    }
    context.globalAlpha = 1;
  }

  /** Width of a pill `height` high around `label`. */
  private pillWidth(height: number, label: string, arrow = true) {
    this.font(500, height / 2.8);
    const grid = Math.round(height * 0.085) * 3 + 4;
    // Padding on both sides and, with the pixel arrow, a gap before it.
    return (
      this.context.measureText(label).width +
      (arrow ? height * 1.1 + grid : height * 0.84)
    );
  }

  /** The site's pill button, inverted while the pointer is on the glass. */
  /**
   * The site's pill button, inverted when lit; a solid one stays filled and
   * warms up. Returns its width.
   */
  private pill(
    x: number,
    y: number,
    height: number,
    label: string,
    {
      lit,
      solid = false,
      arrow = true,
    }: { lit: boolean; solid?: boolean; arrow?: boolean },
  ) {
    const context = this.context;
    const cell = Math.round(height * 0.085);
    const grid = cell * 3 + 4;
    const width = this.pillWidth(height, label, arrow);
    const filled = solid || lit;
    const ink = filled ? night : phosphor;
    context.beginPath();
    context.roundRect(x, y, width, height, height / 2);
    context.fillStyle =
      solid && lit ? "#ffffff" : filled ? phosphor : glassTint;
    context.fill();
    context.strokeStyle = filled ? phosphor : hairline;
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = ink;
    context.textBaseline = "middle";
    context.fillText(label, x + height * 0.42, y + height / 2 + 1);
    if (arrow) {
      const gridX = x + width - height * 0.36 - grid;
      const gridY = y + (height - grid) / 2;
      const previousAlpha = context.globalAlpha;
      for (let index = 0; index < 9; index += 1) {
        const shown = lit && arrowCells.has(index);
        context.fillStyle = shown ? accent : ink;
        context.globalAlpha = previousAlpha * (shown ? 1 : 0.35);
        context.fillRect(
          gridX + (index % 3) * (cell + 2),
          gridY + Math.floor(index / 3) * (cell + 2),
          cell,
          cell,
        );
      }
      context.globalAlpha = previousAlpha;
    }
    context.textBaseline = "top";
    return width;
  }

  private drawCounter(
    project: ScreenProject,
    x: number,
    y: number,
    align: "left" | "right",
  ) {
    const context = this.context;
    const size = metrics[this.layout].counter;
    const label = `${pad(project.index + 1)} / ${pad(project.total)}`;
    this.font(450, size);
    const height = size * 2.6;
    const width = context.measureText(label).width + size * 2.2;
    const left = align === "right" ? x - width : x;
    context.beginPath();
    context.roundRect(left, y, width, height, height / 2);
    context.fillStyle = glassTint;
    context.fill();
    context.strokeStyle = hairline;
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = phosphor;
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillText(label, left + width / 2, y + height / 2 + 1);
    context.textAlign = "left";
    context.textBaseline = "top";
  }
}
