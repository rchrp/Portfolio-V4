import * as THREE from "three";
import { cardAspect } from "./card-track";
import { loadImage, type ScreenProject } from "./screen-composer";

// What the glass shows of the project cards passing behind it, as an x-ray
// would: each card drawn once on a small canvas, its picture, number and name
// laid out as on the card itself (see ProjectDeck). The CRT pass samples them
// (see monitor-renderer.ts); their mipmaps give it the blur that brings out
// their edges.

const textureWidth = 640;
const textureHeight = Math.round(textureWidth / cardAspect);

const phosphor = "#ece8da";
const soft = "rgba(236, 232, 218, 0.8)";
const night = "#0c0b09";

const pad = (value: number) => String(value).padStart(2, "0");

function drawPanel(
  context: CanvasRenderingContext2D,
  project: ScreenProject,
  image: HTMLImageElement | null,
  sans: string,
) {
  const width = textureWidth;
  const height = textureHeight;
  context.fillStyle = night;
  context.fillRect(0, 0, width, height);
  if (image) {
    const imageWidth = image.naturalWidth || width;
    const imageHeight = image.naturalHeight || height;
    const scale = Math.max(width / imageWidth, height / imageHeight);
    context.drawImage(
      image,
      (width - imageWidth * scale) / 2,
      (height - imageHeight * scale) / 2,
      imageWidth * scale,
      imageHeight * scale,
    );
  } else {
    context.globalAlpha = 0.4;
    context.fillStyle = project.accentColor;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;
  }
  const shade = context.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0.3, "rgba(12, 11, 9, 0)");
  shade.addColorStop(1, "rgba(12, 11, 9, 0.9)");
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height);

  context.textBaseline = "top";
  context.font = `500 24px ${sans}`;
  context.fillStyle = phosphor;
  context.fillText(`${pad(project.index + 1)} / ${pad(project.total)}`, 34, 30);

  context.textBaseline = "alphabetic";
  let size = 56;
  context.font = `450 ${size}px ${sans}`;
  context.letterSpacing = `${-0.05 * size}px`;
  while (size > 30 && context.measureText(project.title).width > width - 68) {
    size -= 2;
    context.font = `450 ${size}px ${sans}`;
    context.letterSpacing = `${-0.05 * size}px`;
  }
  context.fillStyle = phosphor;
  context.fillText(project.title, 32, height - 34);
  context.letterSpacing = "0px";
  context.font = `400 21px ${sans}`;
  context.fillStyle = soft;
  context.fillText(project.kicker.join("  ·  "), 34, height - 46 - size);
}

export class XrayPanels {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sans: string;
  private textures: THREE.CanvasTexture[] = [];
  /** Bumped when the projects change: late pictures of old ones are dropped. */
  private generation = 0;

  constructor(renderer: THREE.WebGLRenderer, sans: string) {
    this.renderer = renderer;
    this.sans = sans;
  }

  setProjects(projects: ScreenProject[]) {
    this.clear();
    const generation = ++this.generation;
    this.textures = projects.map((project) => {
      const canvas = document.createElement("canvas");
      canvas.width = textureWidth;
      canvas.height = textureHeight;
      const context = canvas.getContext("2d");
      if (context) drawPanel(context, project, null, this.sans);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;

      void loadImage(project.imageUrl).then((image) => {
        if (!image || !context || generation !== this.generation) return;
        drawPanel(context, project, image, this.sans);
        try {
          // Cross-origin pictures served without CORS headers taint the canvas.
          texture.needsUpdate = true;
          this.renderer.initTexture(texture);
        } catch {
          drawPanel(context, project, null, this.sans);
          texture.needsUpdate = true;
        }
      });
      return texture;
    });
  }

  /** The panel of project `index`, if there is one. */
  at(index: number): THREE.Texture | null {
    return this.textures[index] ?? null;
  }

  dispose() {
    this.clear();
  }

  private clear() {
    for (const texture of this.textures) texture.dispose();
    this.textures = [];
  }
}
