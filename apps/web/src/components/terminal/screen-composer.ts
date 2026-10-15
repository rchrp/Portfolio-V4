// Draws what the CRT displays into a 2D canvas used as the screen texture:
// a tiny retro desktop with a boot sequence and one window per project.

export type ScreenProject = {
  slug: string;
  title: string;
  year: number;
  technologies: string[];
  imageUrl: string | null;
  accentColor: string;
  index: number;
  total: number;
};

type Mode =
  | { kind: "off" }
  | { kind: "boot"; startedAt: number; total: number }
  | { kind: "project"; startedAt: number; project: ScreenProject };

// 3:2, the proportions of the model's glass.
export const SCREEN_WIDTH = 1152;
export const SCREEN_HEIGHT = 768;

const phosphor = "#ece8da";
const dim = "#8d8a7f";
const background = "#0b0c0b";
const brand = "#f15a24";
const bootDuration = 1900;
// The glass bulges and crops the picture's edges a little: keep a margin.
const margin = 40;
const menuHeight = 46;
const menuText = 27;
const promptY = 722;
const zoomDuration = 320;
const bootLeft = SCREEN_WIDTH / 2 - 190;
const loadDuration = 620;
const typeDuration = 520;

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string) {
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve) => {
        const image = new Image();
        if (!src.startsWith("/")) image.crossOrigin = "anonymous";
        image.decoding = "async";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      }),
    );
  }
  return imageCache.get(src)!;
}

const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);
const easeInOut = (value: number) => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const windowFrame = {
  x: margin,
  y: menuHeight + 22,
  width: SCREEN_WIDTH - margin * 2,
  height: promptY - menuHeight - 66,
};
// Maximized, the window's chrome sits just off screen and its content fills it.
const maximizedFrame = {
  x: -2,
  y: -38,
  width: SCREEN_WIDTH + 4,
  height: SCREEN_HEIGHT + 40,
};
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export class ScreenComposer {
  readonly canvas: HTMLCanvasElement;
  /** Average color of what is displayed, used to tint the screen's light. */
  readonly lightColor: [number, number, number] = [0.9, 0.88, 0.82];
  private readonly context: CanvasRenderingContext2D;
  private readonly mono: string;
  private readonly sans: string;
  private readonly pattern: CanvasPattern | null;
  private mode: Mode = { kind: "off" };
  private image: HTMLImageElement | null = null;
  private lastCursor = -1;
  private focus = 0;
  private drawnFocus = 0;

  constructor(fonts: { mono: string; sans: string }) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = SCREEN_WIDTH;
    this.canvas.height = SCREEN_HEIGHT;
    this.context = this.canvas.getContext("2d")!;
    this.mono = fonts.mono;
    this.sans = fonts.sans;
    this.pattern = this.createDesktopPattern();
    this.clear();
  }

  get isBooting() {
    return this.mode.kind === "boot";
  }

  get bootEndsAt() {
    return this.mode.kind === "boot"
      ? this.mode.startedAt + bootDuration
      : -Infinity;
  }

  off() {
    this.mode = { kind: "off" };
    this.clear();
  }

  boot(total: number, now: number) {
    this.mode = { kind: "boot", startedAt: now, total };
  }

  showProject(project: ScreenProject, now: number, instant = false) {
    this.mode = {
      kind: "project",
      project,
      startedAt: instant ? -Infinity : now,
    };
    this.image = null;
    if (!project.imageUrl) return;
    const src = project.imageUrl;
    void loadImage(src).then((image) => {
      if (this.mode.kind !== "project" || this.mode.project.imageUrl !== src)
        return;
      this.image = image;
      this.measureLight(image, project.accentColor);
    });
    this.measureLight(null, project.accentColor);
  }

  /** 0 → windowed project, 1 → its window maximized, picture alone. */
  setFocus(amount: number) {
    this.focus = amount;
  }

  /** Redraws the screen; returns false when nothing changed since last call. */
  draw(now: number): boolean {
    const cursor = Math.floor(now / 530) % 2;
    const mode = this.mode;

    if (mode.kind === "off") return false;

    if (mode.kind === "boot") {
      this.drawBoot(now - mode.startedAt, mode.total);
      return true;
    }

    const elapsed = now - mode.startedAt;
    const animating =
      elapsed < zoomDuration + loadDuration + typeDuration ||
      (this.image === null && mode.project.imageUrl !== null) ||
      this.focus !== this.drawnFocus;

    if (!animating && cursor === this.lastCursor) return false;

    this.lastCursor = cursor;
    this.drawnFocus = this.focus;
    this.drawProject(mode.project, elapsed, cursor === 0);
    return true;
  }

  private clear() {
    this.context.fillStyle = "#000";
    this.context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  private createDesktopPattern() {
    const tile = document.createElement("canvas");
    tile.width = 4;
    tile.height = 4;
    const context = tile.getContext("2d")!;
    context.fillStyle = background;
    context.fillRect(0, 0, 4, 4);
    context.fillStyle = "#171917";
    context.fillRect(0, 0, 2, 2);
    context.fillRect(2, 2, 2, 2);
    return this.context.createPattern(tile, "repeat");
  }

  private measureLight(image: HTMLImageElement | null, accent: string) {
    const probe = document.createElement("canvas");
    probe.width = 8;
    probe.height = 8;
    const context = probe.getContext("2d", { willReadFrequently: true })!;
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

  private drawMenuBar(right: string) {
    const context = this.context;
    context.fillStyle = phosphor;
    context.fillRect(0, 0, SCREEN_WIDTH, menuHeight);
    context.fillStyle = background;
    context.fillRect(0, menuHeight, SCREEN_WIDTH, 2);
    context.fillStyle = brand;
    context.fillRect(margin + 4, menuText - 7, 14, 14);
    context.fillStyle = background;
    context.font = `600 17px ${this.sans}`;
    context.textBaseline = "middle";
    context.textAlign = "left";
    ["Fichier", "Édition", "Projets", "Contact"].forEach((item, index) => {
      context.fillText(item, margin + 40 + index * 104, menuText);
    });
    context.font = `500 16px ${this.mono}`;
    context.textAlign = "right";
    context.fillText(right, SCREEN_WIDTH - margin - 4, menuText);
  }

  private drawBoot(elapsed: number, total: number) {
    const context = this.context;
    context.fillStyle = background;
    context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Pixel mark: a 3×3 matrix echoing the site's cells.
    const markSize = 22;
    const markX = SCREEN_WIDTH / 2 - (markSize * 3 + 12) / 2;
    const markY = 214;
    for (let cell = 0; cell < 9; cell += 1) {
      const appear = clamp01((elapsed - cell * 55) / 220);
      const size = markSize * (0.35 + 0.65 * easeOut(appear));
      const x = markX + (cell % 3) * (markSize + 6) + (markSize - size) / 2;
      const y =
        markY + Math.floor(cell / 3) * (markSize + 6) + (markSize - size) / 2;
      context.fillStyle = cell === 4 ? brand : phosphor;
      context.globalAlpha = appear;
      context.fillRect(x, y, size, size);
    }
    context.globalAlpha = 1;

    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillStyle = phosphor;
    context.font = `600 40px ${this.sans}`;
    context.fillText("RC—OS", SCREEN_WIDTH / 2, 370);
    context.fillStyle = dim;
    context.font = `400 17px ${this.mono}`;
    context.fillText("Portfolio système 4.0 · 2026", SCREEN_WIDTH / 2, 404);

    const lines = [
      ["Mémoire", "OK"],
      ["Matrice de pixels", "OK"],
      ["Projets", String(total).padStart(2, "0")],
    ];
    context.font = `400 17px ${this.mono}`;
    lines.forEach(([label, value], index) => {
      const appear = elapsed - 450 - index * 260;
      if (appear < 0) return;
      const y = 482 + index * 30;
      context.textAlign = "left";
      context.fillStyle = dim;
      context.fillText(`${label} `.padEnd(30, "."), bootLeft, y);
      context.textAlign = "right";
      context.fillStyle = appear > 160 ? phosphor : dim;
      context.fillText(appear > 160 ? value : "…", bootLeft + 380, y);
    });

    const barY = 600;
    context.strokeStyle = dim;
    context.lineWidth = 2;
    context.strokeRect(bootLeft, barY, 380, 16);
    context.fillStyle = phosphor;
    const filled = easeOut(clamp01((elapsed - 300) / (bootDuration - 500)));
    context.fillRect(bootLeft + 4, barY + 4, 372 * filled, 8);
  }

  private drawProject(
    project: ScreenProject,
    elapsed: number,
    cursorOn: boolean,
  ) {
    const context = this.context;
    const counter = `${String(project.index + 1).padStart(2, "0")}/${String(project.total).padStart(2, "0")}`;
    context.fillStyle = this.pattern ?? background;
    context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.drawMenuBar(counter);

    // Maximizing skips what is left of the opening animations.
    if (this.focus > 0)
      elapsed = Math.max(elapsed, zoomDuration + loadDuration + typeDuration);
    const maximized = easeInOut(this.focus);
    const frame = {
      x: lerp(windowFrame.x, maximizedFrame.x, maximized),
      y: lerp(windowFrame.y, maximizedFrame.y, maximized),
      width: lerp(windowFrame.width, maximizedFrame.width, maximized),
      height: lerp(windowFrame.height, maximizedFrame.height, maximized),
    };
    const zoom = easeOut(clamp01(elapsed / zoomDuration));

    // Classic "zoom rects" while the window opens.
    if (zoom < 1) {
      context.strokeStyle = phosphor;
      context.lineWidth = 2;
      for (let step = 0; step < 4; step += 1) {
        const scale = clamp01(zoom - step * 0.12);
        if (scale <= 0) continue;
        const width = frame.width * scale;
        const height = frame.height * scale;
        context.globalAlpha = 1 - step * 0.22;
        context.strokeRect(
          frame.x + (frame.width - width) / 2,
          frame.y + (frame.height - height) / 2,
          width,
          height,
        );
      }
      context.globalAlpha = 1;
      this.drawPrompt(project, 0, cursorOn);
      return;
    }

    // Window chrome: striped title bar and drop shadow.
    context.fillStyle = "#000";
    context.fillRect(frame.x + 8, frame.y + 8, frame.width, frame.height);
    context.fillStyle = phosphor;
    context.fillRect(frame.x, frame.y, frame.width, frame.height);
    context.fillStyle = background;
    context.fillRect(
      frame.x + 2,
      frame.y + 36,
      frame.width - 4,
      frame.height - 38,
    );
    for (let line = 0; line < 6; line += 1) {
      context.fillStyle = background;
      context.fillRect(
        frame.x + 8,
        frame.y + 7 + line * 4,
        frame.width - 16,
        2,
      );
    }
    context.fillStyle = phosphor;
    context.fillRect(frame.x + 16, frame.y + 7, 22, 22);
    context.strokeStyle = background;
    context.lineWidth = 2;
    context.strokeRect(frame.x + 19, frame.y + 10, 16, 16);

    const title = `${project.slug}.app`;
    context.font = `600 18px ${this.sans}`;
    const titleWidth = context.measureText(title).width + 36;
    context.fillStyle = phosphor;
    context.fillRect(
      SCREEN_WIDTH / 2 - titleWidth / 2,
      frame.y + 4,
      titleWidth,
      28,
    );
    context.fillStyle = background;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(title, SCREEN_WIDTH / 2, frame.y + 19);

    // Content, loaded line by line like a slow modem.
    const content = {
      x: frame.x + 2,
      y: frame.y + 38,
      width: frame.width - 4,
      height: frame.height - 40,
    };
    const loaded = easeOut(clamp01((elapsed - zoomDuration) / loadDuration));
    context.fillStyle = project.accentColor;
    context.fillRect(
      content.x,
      content.y,
      content.width,
      content.height * loaded,
    );

    if (this.image) {
      const image = this.image;
      const scale = Math.max(
        content.width / image.naturalWidth,
        content.height / image.naturalHeight,
      );
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.save();
      context.beginPath();
      context.rect(
        content.x,
        content.y,
        content.width,
        content.height * loaded,
      );
      context.clip();
      context.drawImage(
        image,
        content.x + (content.width - width) / 2,
        content.y + (content.height - height) / 2,
        width,
        height,
      );
      context.restore();
    }

    if (loaded < 1) {
      const scanY = content.y + content.height * loaded;
      context.fillStyle = phosphor;
      context.fillRect(content.x, scanY - 2, content.width, 3);
    }

    const typed = clamp01((elapsed - zoomDuration - 120) / typeDuration);
    if (maximized >= 1) return;
    context.globalAlpha = 1 - maximized;
    this.drawPrompt(project, typed, cursorOn);
    context.globalAlpha = 1;
  }

  private drawPrompt(project: ScreenProject, typed: number, cursorOn: boolean) {
    const context = this.context;
    const command = `open ~/projets/${project.slug} --year ${project.year}`;
    const visible = command.slice(0, Math.round(command.length * typed));
    const y = promptY;
    context.textBaseline = "middle";
    context.textAlign = "left";
    context.font = `500 19px ${this.mono}`;
    context.fillStyle = brand;
    context.fillText(">", margin, y);
    context.fillStyle = phosphor;
    context.fillText(visible, margin + 26, y);
    if (cursorOn || typed < 1) {
      const x = margin + 26 + context.measureText(visible).width + 4;
      context.fillRect(x, y - 11, 11, 22);
    }
    context.textAlign = "right";
    context.fillStyle = dim;
    context.font = `400 16px ${this.mono}`;
    context.fillText(
      project.technologies.slice(0, 3).join(" · "),
      SCREEN_WIDTH - margin,
      y,
    );
  }
}
