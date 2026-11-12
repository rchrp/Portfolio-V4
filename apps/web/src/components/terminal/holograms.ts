import * as THREE from "three";
import { ease, hologramTracks, type StageLayout } from "./monitor-path";
import { loadImage, type ScreenProject } from "./screen-composer";

// The projects slide by behind the monitor, one card each: the next one on
// the left, the last one on the right. As the page scrolls the whole row
// moves across at once, each card growing as it nears the monitor, where
// the glass hides it and shows its project instead, and shrinking as it
// moves away.

// Cards are 16:10, drawn on a canvas this size.
const panelAspect = 1.6;
const textureWidth = 640;
const textureHeight = 400;
// The plane is a little larger than the card, for its edge.
const margin = 1.04;
// Each card is in the middle while its project rests on the glass (see
// channelStop).
const restOffset = 0.35;

const phosphor = "#ece8da";
const soft = "rgba(236, 232, 218, 0.8)";
const night = "#0c0b09";

const hologramVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The picture, a little dark and see-through, crossed by faint scanlines,
// in a dark frame.
const hologramFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uAspect;
  varying vec2 vUv;

  // Signed distance to the card's rounded rectangle, in card heights.
  float panel(vec2 uv) {
    vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
    vec2 q = abs(p) - (vec2(uAspect, 1.0) * 0.5 - 0.06);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.06;
  }

  void main() {
    vec2 uv = (vUv - 0.5) * ${margin.toFixed(2)} + 0.5;
    float edge = panel(uv);
    float inside = 1.0 - smoothstep(-0.004, 0.004, edge);
    // A near-black band along the edge, lit by a grey hairline.
    float band = smoothstep(-0.03, -0.022, edge);
    float hairline = exp(-abs(edge + 0.003) * 260.0);
    vec3 color = texture2D(uMap, uv).rgb * 0.72;
    color *= 0.94 + 0.06 * sin(uv.y * 380.0);
    color = mix(color, vec3(0.05, 0.047, 0.043), band);
    color = mix(color, vec3(0.3, 0.29, 0.27), hairline);
    float alpha = inside * mix(0.9, 1.0, band);
    gl_FragColor = vec4(color, alpha * uOpacity);
    #include <colorspace_fragment>
  }
`;

type Panel = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  texture: THREE.CanvasTexture;
  index: number;
};

/** The glass in world space. */
export type GlassFrame = {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  up: THREE.Vector3;
  quaternion: THREE.Quaternion;
  width: number;
  height: number;
  /** Distance from the camera. */
  distance: number;
};

export type DeckFrame = {
  project: number;
  /** 0 → 1: how present the projects chapter is. */
  presence: number;
  layout: StageLayout;
  glass: GlassFrame;
  camera: THREE.PerspectiveCamera;
};

const pad = (value: number) => String(value).padStart(2, "0");
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number) =>
  ease(clamp01((value - edge0) / (edge1 - edge0)));

// The project's picture, its number and its name, as on the glass.
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

export class HologramDeck {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private panels: Panel[] = [];
  private readonly sans: string;
  private readonly renderer: THREE.WebGLRenderer;
  /** Bumped when the projects change: late pictures of old ones are dropped. */
  private generation = 0;

  constructor(renderer: THREE.WebGLRenderer, sans: string) {
    this.renderer = renderer;
    this.sans = sans;
  }

  setProjects(projects: ScreenProject[]) {
    this.clear();
    const generation = ++this.generation;
    this.panels = projects.map((project, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = textureWidth;
      canvas.height = textureHeight;
      const context = canvas.getContext("2d");
      if (context) drawPanel(context, project, null, this.sans);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: texture },
          uOpacity: { value: 0 },
          uAspect: { value: panelAspect },
        },
        vertexShader: hologramVertex,
        fragmentShader: hologramFragment,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.visible = false;
      this.group.add(mesh);

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
      return { mesh, texture, index };
    });
  }

  update({ project, presence, layout, glass, camera }: DeckFrame) {
    const track = hologramTracks[layout];
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = glass.distance * track.depth;
    const height = track.size * 2 * distance * tangent;
    for (const { mesh, index } of this.panels) {
      // Places from the middle: −1 on the left (next), 1 on the right (last).
      const place = project - index - restOffset;
      const away = Math.abs(place);
      if (presence <= 0 || away >= 1.6) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(
        place * track.spacing * distance * tangent * camera.aspect,
        track.y * distance * tangent,
        -distance,
      );
      // Larger as it nears the monitor, smaller as it moves away.
      const zoom = 0.62 + 0.68 * (1 - smoothstep(0.45, 1.6, away));
      mesh.scale.set(
        height * panelAspect * zoom * margin,
        height * zoom * margin,
        1,
      );
      // In line on either side, fading out beyond them, and out of sight
      // in the middle, behind the glass (or below it on phones).
      const fade =
        (1 - smoothstep(1.2, 1.6, away)) * smoothstep(0.25, 0.6, away);
      mesh.material.uniforms.uOpacity.value = presence * fade;
    }
  }

  dispose() {
    this.clear();
    this.geometry.dispose();
  }

  private clear() {
    for (const { mesh, texture } of this.panels) {
      this.group.remove(mesh);
      mesh.material.dispose();
      texture.dispose();
    }
    this.panels = [];
  }
}
