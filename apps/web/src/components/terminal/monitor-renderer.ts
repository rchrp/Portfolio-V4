import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { cardAspect, cardHeight, cardTracks, placeCard } from "./card-track";
import {
  ease,
  poseAt,
  storyStart,
  type Pose,
  type StageLayout,
  type StoryScroll,
} from "./monitor-path";
import {
  loadImage,
  ScreenComposer,
  screenAspect,
  type ScreenMessage,
  type ScreenProject,
  type ScreenRegion,
} from "./screen-composer";
import type {
  ContactCard,
  CtaCard,
  HeroCard,
  ManifestoCard,
} from "./screen-cards";
import { createSunsetEnvironments } from "./sunset-environment";
import { channelRest, showsProjects } from "./theater-timeline";
import { XrayPanels } from "./xray-panels";

/** Bounds of the glass on the canvas, in CSS pixels. */
export type ScreenRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** What the glass shows in each chapter, besides the projects. */
export type MonitorScreens = {
  hero: HeroCard;
  contact: ContactCard;
  manifesto: ManifestoCard;
  terminal: ScreenMessage;
  cta: CtaCard;
};

/** Where the glass and its clickable regions are on the canvas. */
export type ScreenFrame = {
  /** What it shows: "project", "message", or a card's kind. */
  showing: string;
  rect: ScreenRect;
  regions: Record<string, ScreenRect>;
};

/** The glass in world space. */
type GlassFrame = {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  up: THREE.Vector3;
};

const crtVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// The tube's picture, drawn into the texture the glass emits. Kept subtle so
// the project stays legible: slight barrel curvature, radial chromatic
// aberration, scanlines, phosphor bleed, vignette, flicker. uGlitch drives
// the channel-switch tearing and uPower the classic line-then-open power
// cycle. uClean fades all of it out and uFocus swaps the hero for the
// project picture alone while the camera dives into the glass: the tube ends
// up a plain, modern display.
//
// While it shows the projects, uXray turns the glass into an x-ray of the
// cards passing behind it: up to two slots (uSlotA, uSlotB: centre and half
// size, in shares of the glass) where their panels show as radiographs, in
// the site's warm phosphor over the night of the tube. As a card comes to
// rest it fills the glass while a scan sweeps across it (uDevelop), leaving
// the project's hero, uMap, behind.
const crtFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uFocusMap;
  uniform sampler2D uPanelA;
  uniform sampler2D uPanelB;
  uniform float uTime;
  uniform float uPower;
  uniform float uGlitch;
  uniform float uClean;
  uniform float uFocus;
  uniform vec2 uFocusCover;
  uniform float uXray;
  uniform vec4 uSlotA;
  uniform vec4 uSlotB;
  uniform vec2 uShown;
  uniform vec2 uDevelop;
  varying vec2 vUv;

  const float aspect = ${screenAspect.toFixed(4)};
  // The site's phosphor (#ece8da), its night (#0c0b09) and a trace of its
  // accent (#f15a24), in linear light.
  const vec3 xrayTint = vec3(0.84, 0.8, 0.7);
  const vec3 xrayNight = vec3(0.0037, 0.0033, 0.0027);
  const vec3 xrayWarmth = vec3(0.88, 0.1, 0.018);

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 sampleScreen(vec2 uv, vec2 offset) {
    vec3 hero = vec3(
      texture2D(uMap, uv + offset).r,
      texture2D(uMap, uv).g,
      texture2D(uMap, uv - offset).b
    );
    if (uFocus <= 0.0) return hero;
    // The picture covers the glass, like object-fit: cover.
    vec2 cover = (uv - 0.5) * uFocusCover + 0.5;
    vec3 picture = vec3(
      texture2D(uFocusMap, cover + offset).r,
      texture2D(uFocusMap, cover).g,
      texture2D(uFocusMap, cover - offset).b
    );
    return mix(hero, picture, uFocus);
  }

  // The hero, with a cheap phosphor bleed: two wide taps around the pixel.
  vec3 litScreen(vec2 uv, vec2 offset) {
    vec3 color = sampleScreen(uv, offset);
    float crt = 1.0 - uClean;
    if (crt > 0.0) {
      vec3 bleed = sampleScreen(uv + vec2(0.003, 0.0), offset)
        + sampleScreen(uv - vec2(0.003, 0.0), offset);
      color += bleed * 0.05 * crt;
    }
    return color;
  }

  float luma(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  // A card seen through the monitor: its light and, brighter, its edges, the
  // difference with a blurred copy of itself read from its mipmaps.
  vec3 radiograph(sampler2D panel, vec2 uv) {
    float sharp = luma(texture2D(panel, uv).rgb);
    float soft = luma(texture2D(panel, uv, 3.0).rgb);
    float density = 0.04 + sharp * 0.12 + abs(sharp - soft) * 2.6;
    return xrayNight + xrayTint * density;
  }

  // The night of the tube, a faint warmth in its middle.
  vec3 xrayField(vec2 uv) {
    vec2 fromCenter = (uv - 0.5) * vec2(1.0, 1.4);
    float glow = max(0.0, 1.0 - dot(fromCenter, fromCenter) * 2.2);
    return xrayNight + xrayWarmth * glow * 0.035;
  }

  vec3 xraySlot(vec3 under, vec2 uv, vec2 offset, sampler2D panel, vec4 slot,
      float shown, float develop) {
    if (shown <= 0.0) return under;
    vec2 local = (uv - slot.xy) / (2.0 * slot.zw) + 0.5;
    // Rounded like the card, square once it fills the glass.
    vec2 halfSize = slot.zw * vec2(aspect, 1.0);
    float radius = min(halfSize.x, halfSize.y) * 0.14 * (1.0 - develop);
    vec2 q = abs((uv - slot.xy) * vec2(aspect, 1.0)) - halfSize + radius;
    float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float inside = 1.0 - smoothstep(-0.002, 0.002, edge);
    if (inside <= 0.0) return under;
    vec3 color = radiograph(panel, local);
    if (develop > 0.0) {
      // The scan runs from the card's leading edge, on the left.
      float scan = develop * 1.08 - 0.04;
      float lit = 1.0 - smoothstep(scan - 0.008, scan + 0.008, local.x);
      if (lit > 0.0) color = mix(color, litScreen(local, offset), lit);
      float beam = exp(-abs(local.x - scan) * 180.0) * step(develop, 0.999);
      color += xrayTint * beam * 0.45;
    }
    return mix(under, color, inside);
  }

  void main() {
    float crt = 1.0 - uClean;
    float glitch = uGlitch * crt;
    vec2 centered = vUv * 2.0 - 1.0;
    // Lines bow a little while the corners stay pinned to the glass corners.
    vec2 bulged = centered * (1.0 + 0.02 * centered.yx * centered.yx) / 1.02;
    vec2 uv = mix(centered, bulged, crt) * 0.5 + 0.5;

    float openX = smoothstep(0.0, 0.32, uPower);
    float openY = max(smoothstep(0.28, 1.0, uPower), 0.004);
    vec2 powered = (uv - 0.5) / vec2(max(openX, 0.001), openY) + 0.5;

    float frame = floor(uTime * 24.0);
    float band = step(0.55, hash(vec2(floor(powered.y * 18.0), frame)));
    powered.x += (hash(vec2(floor(powered.y * 160.0), frame)) - 0.5) * 0.05 * glitch * band;
    powered.y += glitch * 0.015 * sin(uTime * 61.0);

    vec2 fromCenter = powered - 0.5;
    // Light enough to keep small text sharp.
    vec2 aberration = (fromCenter * (0.001 + dot(fromCenter, fromCenter) * 0.004 + glitch * 0.02)
      + vec2(0.0003, 0.0)) * crt;
    vec3 color = vec3(0.0);
    if (uXray < 1.0) color = litScreen(powered, aberration);
    if (uXray > 0.0) {
      vec3 xray = xrayField(powered);
      xray = xraySlot(xray, powered, aberration, uPanelA, uSlotA, uShown.x, uDevelop.x);
      xray = xraySlot(xray, powered, aberration, uPanelB, uSlotB, uShown.y, uDevelop.y);
      color = mix(color, xray, uXray);
    }

    // 240 lines: coarse enough not to shimmer once the texture is minified.
    color *= mix(1.0, 0.92 + 0.08 * sin(powered.y * 480.0 * 3.14159), crt);
    float grain = hash(powered * vec2(1296.0, 768.0) + fract(uTime) * 91.0);
    // The grain rides on the light, so the blacks stay black, except in a
    // channel switch's snow.
    color *= 1.0 + (grain - 0.5) * 0.1 * crt;
    color = mix(color, vec3(grain), glitch * 0.4);
    color *= mix(1.0, 0.985 + 0.015 * sin(uTime * 110.0), crt);

    vec2 edge = smoothstep(vec2(0.0), vec2(0.004, 0.006), powered)
      * smoothstep(vec2(0.0), vec2(0.004, 0.006), 1.0 - powered);
    float inside = mix(1.0, edge.x * edge.y, crt);
    vec2 falloff = centered * vec2(0.5, 0.6);
    float vignette = mix(1.0, clamp(1.0 - dot(falloff, falloff) * 0.45, 0.0, 1.0), crt);
    float line = (1.0 - smoothstep(0.0, 0.25, openY)) * exp(-abs(uv.y - 0.5) * 260.0) * openX
      * step(abs(uv.x - 0.5), 0.5 * openX);
    float visible = smoothstep(0.0, 0.08, uPower);

    vec3 picture = color * inside * vignette * mix(1.0, 1.1, crt) * visible
      + vec3(1.0, 0.97, 0.92) * line * 2.4;
    gl_FragColor = vec4(picture, 1.0);
  }
`;

// A halo around the glass, clear over the glass itself (the inner share of
// the plane it is drawn on), so the tube's blacks stay deep.
function haloTexture(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable.");
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.36, "rgba(255,255,255,0)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.8)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const damp = (current: number, target: number, lambda: number, delta: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * delta));

const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

const smoothstep = (edge0: number, edge1: number, value: number) =>
  ease(THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1));

const diveDuration = 1750;
// The monitor rises into place once loaded.
const appearDuration = 1600;
// Longest side of the picture texture shown once inside the screen.
const focusResolution = 2560;
// Strength of the glass's reflections, faded out while diving into it.
const glassReflection = 1.4;
// Scales the roughness map: clean glass mirrors the window sharply, its
// smudges blur it.
const glassRoughness = 0.6;
// Lit like a matte surface, the glass's base color would turn its blacks
// grey: it stays dark, the tube's light and the reflections do the rest.
const glassDiffuse = 0.12;
// On power-on, the picture scans in once the tube's line has opened.
const powerOnDelay = 350;
// The window whose reflection crosses the glass: behind the visitor, up and
// to the left, the sun setting behind it.
const windowDirection = new THREE.Vector3(-0.3, 0.06, 1).normalize();
// How fast the monitor catches up with its pose, per second.
const follow = 7;

const poseKeys = [
  "x",
  "y",
  "size",
  "width",
  "yaw",
  "pitch",
  "roll",
  "float",
] as const;

type Dive = {
  from: number;
  to: number;
  startedAt: number;
  resolve: () => void;
};

type ScreenContent = {
  key: string;
  show: (now: number, instant: boolean) => void;
};

/**
 * The monitor of the home page, drawn on a canvas covering the viewport. The
 * camera stays put while the monitor moves through the story, from pose to
 * pose; its glass shows a few words between chapters and the projects in
 * their chapter, seeing through to the cards of the others as they slide by
 * behind it (see ProjectDeck).
 */
export class MonitorRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, 1, 0.1, 80);
  private readonly monitor = new THREE.Group();
  private readonly composer: ScreenComposer;
  private readonly screenTexture: THREE.CanvasTexture;
  // The CRT pass draws the composer's canvas, through the tube's effects,
  // into the texture the glass emits.
  private readonly crtMaterial: THREE.ShaderMaterial;
  private readonly crtScene = new THREE.Scene();
  private readonly crtCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly crtTarget: THREE.WebGLRenderTarget;
  private readonly glow: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly panels: XrayPanels;
  private glassMaterial: THREE.MeshStandardMaterial | null = null;
  private bodyMaterial: THREE.MeshStandardMaterial | null = null;
  private model: THREE.Object3D | null = null;
  private environments: { glass: THREE.Texture; body: THREE.Texture } | null =
    null;
  // The glass's frame in the monitor's own space, measured on the model.
  private readonly glassCenter = new THREE.Vector3();
  private readonly glassNormal = new THREE.Vector3(0, 0, 1);
  private readonly glassUp = new THREE.Vector3(0, 1, 0);
  private readonly glassRight = new THREE.Vector3(1, 0, 0);
  private readonly glassOrientation = new THREE.Quaternion();
  private glassWidth = 1.4;
  private glassHeight = 0.82;
  // ... and in the world, after each move.
  private readonly glass: GlassFrame = {
    center: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
  };
  private pose: Pose = poseAt(storyStart, "side");
  private posePlaced = false;
  private readonly screens: MonitorScreens;
  private projects: ScreenProject[] = [];
  private story: StoryScroll = storyStart;
  private layout: StageLayout = "side";
  private readonly pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  // The hero's card opened onto the contact details.
  private contactOpen = false;
  private width = 1;
  private height = 1;
  private frame = 0;
  private lastTime = 0;
  private held = false;
  private loadedAt = -Infinity;
  private power = 0;
  private powerTarget = 0;
  private glitch = 0;
  private contentKey = "off";
  private pending: { show: ScreenContent["show"]; at: number } | null = null;
  private dive: Dive | null = null;
  /** 0 in the room, 1 inside the glass with the picture filling the view. */
  private diveProgress = 0;
  private focusTexture: THREE.Texture | null = null;
  private focusSize = { width: 1, height: 1 };
  private focusSource: string | null = null;
  private screenFrame: ScreenFrame = {
    showing: "off",
    rect: { left: 0, top: 0, width: 0, height: 0 },
    regions: {},
  };
  private readonly screenListeners = new Set<(frame: ScreenFrame) => void>();
  // The regions last reported, to tell when the card was redrawn.
  private reportedRegions: ScreenRegion[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly reducedMotion: boolean;
  private readonly euler = new THREE.Euler();
  private readonly offset = new THREE.Vector3();
  private readonly forward = new THREE.Vector3(0, 0, -1);
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private readonly divePosition = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly corner = new THREE.Vector3();
  private readonly lightColor = new THREE.Color(1, 1, 1);

  constructor(
    canvas: HTMLCanvasElement,
    options: { sans: string; reducedMotion: boolean; screens: MonitorScreens },
  ) {
    this.reducedMotion = options.reducedMotion;
    this.screens = options.screens;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.composer = new ScreenComposer({ sans: options.sans });
    this.screenTexture = new THREE.CanvasTexture(this.composer.canvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    // Sampled pixel for pixel by the CRT pass.
    this.screenTexture.generateMipmaps = false;
    this.screenTexture.minFilter = THREE.LinearFilter;

    // sRGB storage keeps the dark tones smooth; mipmaps keep the scanlines
    // from shimmering when the monitor is far.
    this.crtTarget = new THREE.WebGLRenderTarget(
      this.composer.canvas.width,
      this.composer.canvas.height,
      {
        colorSpace: THREE.SRGBColorSpace,
        depthBuffer: false,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
      },
    );
    // The glass maps it through its second set of texture coordinates.
    this.crtTarget.texture.channel = 1;
    this.crtMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.screenTexture },
        uTime: { value: 0 },
        uPower: { value: 0 },
        uGlitch: { value: 0 },
        uClean: { value: 0 },
        uFocus: { value: 0 },
        uFocusMap: { value: null },
        uFocusCover: { value: new THREE.Vector2(1, 1) },
        uXray: { value: 0 },
        uPanelA: { value: null },
        uPanelB: { value: null },
        uSlotA: { value: new THREE.Vector4() },
        uSlotB: { value: new THREE.Vector4() },
        uShown: { value: new THREE.Vector2() },
        uDevelop: { value: new THREE.Vector2() },
      },
      vertexShader: crtVertex,
      fragmentShader: crtFragment,
      depthTest: false,
      depthWrite: false,
    });
    const crtQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.crtMaterial,
    );
    crtQuad.frustumCulled = false;
    this.crtScene.add(crtQuad);

    // The tube's light, blooming past the glass.
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: haloTexture(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.monitor.add(this.glow);
    this.panels = new XrayPanels(this.renderer, options.sans);
    this.scene.add(this.monitor);

    // Warm from the upper left, an orange rim from behind on the right.
    const key = new THREE.DirectionalLight(0xffdcc0, 2.6);
    key.position.set(-3, 4, 4);
    const rim = new THREE.DirectionalLight(0xff8a4c, 2.4);
    rim.position.set(3, 2.5, -4);
    this.scene.add(
      key,
      rim,
      new THREE.HemisphereLight(0x8a9ab4, 0x16110d, 0.6),
    );

    this.disposables.push(
      this.screenTexture,
      this.crtTarget,
      this.crtMaterial,
      crtQuad.geometry,
      this.glow.geometry,
      this.glow.material,
      this.glow.material.map!,
      this.panels,
    );
  }

  /**
   * Loads the monitor: "Monitor IV" by re1monsen (CC BY 4.0), prepared by
   * `scripts/build-model.mjs`, whose "Screen" material covers the glass.
   */
  async load(url: string) {
    const { scene: model } = await new GLTFLoader().loadAsync(url);
    const meshes: THREE.Mesh[] = [];
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    const glass = meshes.find(
      (mesh) => (mesh.material as THREE.Material).name === "Screen",
    );
    if (!glass) throw new Error("The model has no screen glass.");

    for (const mesh of meshes) {
      if (mesh === glass) continue;
      const material = mesh.material as THREE.MeshStandardMaterial;
      // Its emissive map holds the printed labels and the rear light.
      if (material.emissiveMap) this.bodyMaterial = material;
    }
    // The bezel's knurling stays sharp when the monitor turns away.
    const anisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    for (const mesh of meshes) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      for (const texture of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
        material.aoMap,
      ]) {
        if (texture) texture.anisotropy = anisotropy;
      }
    }

    // The glass keeps its base color and the smudges of its roughness map,
    // and emits the CRT pass through its second UV set.
    const glassMaterial = glass.material as THREE.MeshStandardMaterial;
    glassMaterial.metalness = 0;
    glassMaterial.metalnessMap = null;
    glassMaterial.roughness = glassRoughness;
    glassMaterial.emissive.set(0xffffff);
    glassMaterial.emissiveMap = this.crtTarget.texture;
    // The picture keeps its colors, as on the site.
    glassMaterial.toneMapped = false;
    glassMaterial.needsUpdate = true;
    this.glassMaterial = glassMaterial;

    model.updateMatrixWorld(true);
    this.measureGlass(glass);
    this.monitor.add(model);
    this.model = model;

    this.glow.position
      .copy(this.glassCenter)
      .addScaledVector(this.glassNormal, 0.14);
    this.glow.quaternion.copy(this.glassOrientation);
    this.glow.scale.set(this.glassWidth * 2.4, this.glassHeight * 2.6, 1);

    const environments = createSunsetEnvironments(
      this.renderer,
      windowDirection,
      this.worldUp,
    );
    this.environments = environments;
    this.scene.environment = environments.body;
    this.scene.environmentIntensity = 1;
    glassMaterial.envMap = environments.glass;
    glassMaterial.envMapIntensity = glassReflection;
    this.loadedAt = performance.now();
    this.wake();
  }

  /** Centre, axes and size of the glass, in the monitor's own space. */
  private measureGlass(glass: THREE.Mesh) {
    const positions = glass.geometry.getAttribute("position");
    const normals = glass.geometry.getAttribute("normal");
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(glass.matrixWorld);
    const point = new THREE.Vector3();
    const facing = new THREE.Vector3();
    for (let index = 0; index < normals.count; index += 1) {
      facing.add(
        point.fromBufferAttribute(normals, index).applyMatrix3(normalMatrix),
      );
    }
    this.glassNormal.copy(facing.normalize());
    this.glassUp.crossVectors(this.glassNormal, this.glassRight).normalize();
    this.glassRight.crossVectors(this.glassUp, this.glassNormal).normalize();
    this.glassOrientation.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        this.glassRight,
        this.glassUp,
        this.glassNormal,
      ),
    );

    const across = { min: Infinity, max: -Infinity };
    const along = { min: Infinity, max: -Infinity };
    let depth = 0;
    for (let index = 0; index < positions.count; index += 1) {
      point
        .fromBufferAttribute(positions, index)
        .applyMatrix4(glass.matrixWorld);
      const x = point.dot(this.glassRight);
      const y = point.dot(this.glassUp);
      across.min = Math.min(across.min, x);
      across.max = Math.max(across.max, x);
      along.min = Math.min(along.min, y);
      along.max = Math.max(along.max, y);
      depth += point.dot(this.glassNormal);
    }
    this.glassWidth = across.max - across.min;
    this.glassHeight = along.max - along.min;
    this.glassCenter
      .copy(this.glassRight)
      .multiplyScalar((across.min + across.max) / 2)
      .addScaledVector(this.glassUp, (along.min + along.max) / 2)
      .addScaledVector(this.glassNormal, depth / positions.count);
  }

  setLayout(layout: StageLayout) {
    this.layout = layout;
    this.composer.setLayout(layout === "stacked" ? "compact" : "wide");
    this.wake();
  }

  setStory(story: StoryScroll) {
    this.story = story;
    this.wake();
  }

  /** The projects shown on the glass, in their order on the page. */
  setProjects(projects: ScreenProject[]) {
    this.projects = projects;
    this.composer.preload(projects);
    this.panels.setProjects(projects);
    this.wake();
  }

  /** The pointer, from −1 to 1 across the viewport. */
  setPointer(x: number, y: number) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.wake();
  }

  /** The pointer is over the glass. */
  setHovered(hovered: boolean) {
    this.composer.setHovered(hovered);
    this.wake();
  }

  /** Opens the hero's card onto the contact details, or closes it. */
  setContactOpen(open: boolean) {
    this.contactOpen = open;
    this.wake();
  }

  /** Lights up a region of the card, under the pointer or the focus. */
  setHighlight(id: string | null) {
    this.composer.setHighlight(id);
    this.wake();
  }

  /** Marks a copy button of the card as done, or clears it. */
  setCopied(id: string | null) {
    this.composer.setCopied(id);
    this.wake();
  }

  /**
   * Follows the glass and the regions of its card on the canvas; returns the
   * function that stops.
   */
  onScreen(listener: (frame: ScreenFrame) => void) {
    this.screenListeners.add(listener);
    listener(this.screenFrame);
    return () => {
      this.screenListeners.delete(listener);
    };
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    // It covers the whole viewport: a slightly lighter ratio keeps it fluid.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.wake();
  }

  /**
   * Flies the camera into the glass while the CRT turns into a plain display
   * showing `imageUrl` alone, covering the viewport. Resolves once there with
   * the picture's scale relative to the same picture covering the viewport.
   */
  async diveIn(imageUrl: string) {
    void this.setFocusImage(imageUrl);
    await this.animateDive(1);
    return this.focusScale();
  }

  /** Pulls the camera back out of the glass. */
  diveOut() {
    return this.animateDive(0);
  }

  /** Pauses rendering while something else covers the canvas. */
  setHeld(held: boolean) {
    this.held = held;
    if (held && this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    } else this.wake();
  }

  async setFocusImage(src: string) {
    if (src === this.focusSource) return;
    this.focusSource = src;
    const image = await loadImage(src);
    if (!image || this.focusSource !== src) return;
    const width = image.naturalWidth || 1280;
    const height = image.naturalHeight || 800;
    const scale = Math.min(
      focusResolution / Math.max(width, height),
      // Vector images are rasterized sharp; bitmaps keep their resolution.
      /\.svg($|\?)/i.test(src) ? Infinity : 1,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    try {
      // Cross-origin pictures served without CORS headers taint the canvas.
      this.renderer.initTexture(texture);
    } catch {
      texture.dispose();
      return;
    }
    this.focusTexture?.dispose();
    this.focusTexture = texture;
    this.focusSize = { width, height };
    this.crtMaterial.uniforms.uFocusMap.value = texture;
    this.updateFocusCover();
    this.wake();
  }

  dispose() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.held = true;
    this.dive?.resolve();
    this.screenListeners.clear();
    this.focusTexture?.dispose();
    for (const item of this.disposables) item.dispose();
    // The glass and the body share the model's textures.
    const textures = new Set<THREE.Texture>();
    this.model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const material = object.material as THREE.MeshStandardMaterial;
      for (const texture of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
        material.aoMap,
        material.emissiveMap,
      ]) {
        if (texture && texture !== this.crtTarget.texture)
          textures.add(texture);
      }
      material.dispose();
    });
    for (const texture of textures) texture.dispose();
    this.environments?.glass.dispose();
    this.environments?.body.dispose();
    this.renderer.dispose();
  }

  private animateDive(to: number) {
    this.dive?.resolve();
    return new Promise<void>((resolve) => {
      if (this.reducedMotion || !this.model) {
        this.diveProgress = to;
        this.dive = null;
        this.wake();
        resolve();
        return;
      }
      this.dive = {
        from: this.diveProgress,
        to,
        startedAt: performance.now(),
        resolve,
      };
      this.held = false;
      this.wake();
    });
  }

  private updateFocusCover() {
    // Ratio of the picture's aspect to the glass's: crop like a cover fit.
    const ratio =
      this.focusSize.width /
      this.focusSize.height /
      (this.glassWidth / this.glassHeight);
    this.crtMaterial.uniforms.uFocusCover.value.set(
      Math.min(1, 1 / ratio),
      Math.min(1, ratio),
    );
  }

  /** Distance from the glass at which it overflows the viewport. */
  private diveDistance() {
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const fit = Math.min(
      this.glassHeight,
      this.glassWidth / this.camera.aspect,
    );
    // A little closer than a cover fit: the rounded corners leave the view.
    return (fit / (2 * tangent)) * 0.9;
  }

  /**
   * Scale of the picture as displayed through the glass at the end of the
   * dive, relative to the same picture covering the viewport.
   */
  private focusScale() {
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const pixelsPerUnit = this.height / (2 * this.diveDistance() * tangent);
    const { width, height } = this.focusSize;
    const shown = Math.max(
      (this.glassWidth * pixelsPerUnit) / width,
      (this.glassHeight * pixelsPerUnit) / height,
    );
    const cover = Math.max(this.width / width, this.height / height);
    return shown / cover;
  }

  /** What the glass should show at this point of the story, if anything. */
  private screenContent(): ScreenContent | null {
    const story = this.story;
    const count = this.projects.length;
    const screens = this.screens;
    const card = (
      key: string,
      show: (now: number, instant: boolean) => void,
    ): ScreenContent => ({ key, show });
    if (showsProjects(story, count)) {
      const index = THREE.MathUtils.clamp(
        Math.floor(story.project),
        0,
        count - 1,
      );
      const project = this.projects[index];
      return card(`project:${project.slug}`, (now, instant) =>
        this.composer.showProject(project, now, instant),
      );
    }
    // Once the projects are over the tube goes dark, and lights up again
    // with the invitation once the visitor is well into its chapter.
    if (story.ending > 0.65) {
      return card("cta", (now, instant) =>
        this.composer.showCard(
          { kind: "cta", card: screens.cta },
          now,
          instant,
        ),
      );
    }
    if (story.outro >= 0.5) return null;
    if (story.intro > 0.35) {
      return card("terminal", (now, instant) =>
        this.composer.showMessage(screens.terminal, now, instant),
      );
    }
    if (story.dusk > 0.6) {
      return card("manifesto", (now, instant) =>
        this.composer.showCard(
          { kind: "manifesto", card: screens.manifesto },
          now,
          instant,
        ),
      );
    }
    if (this.contactOpen) {
      return card("contact", (now, instant) =>
        this.composer.showCard(
          { kind: "contact", card: screens.contact },
          now,
          instant,
        ),
      );
    }
    return card("hero", (now, instant) =>
      this.composer.showCard(
        { kind: "hero", card: screens.hero },
        now,
        instant,
      ),
    );
  }

  /** Powers the tube on or off, or switches channels with a glitch. */
  private tune(now: number) {
    const content = this.screenContent();
    const key = content?.key ?? "off";
    if (key === this.contentKey) return;
    const previous = this.contentKey;
    this.contentKey = key;
    if (!content) {
      this.powerTarget = 0;
      this.pending = null;
    } else if (previous === "off") {
      this.powerTarget = 1;
      this.pending = null;
      content.show(now + powerOnDelay, this.reducedMotion);
    } else if (
      this.reducedMotion ||
      this.diveProgress > 0 ||
      (previous.startsWith("project:") && key.startsWith("project:"))
    ) {
      // Inside the glass the channel switches cleanly, and so it does from
      // one project to the next: out of sight, while the x-ray shows both
      // cards sliding by.
      this.pending = null;
      content.show(now, true);
    } else {
      // Tear the picture first, swap channels at the peak of the glitch.
      this.glitch = 1;
      this.pending = { show: content.show, at: now + 110 };
    }
  }

  /** Places the monitor: the centre of its glass where the pose says. */
  private place(pose: Pose, now: number, dived: number) {
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const aspect = this.camera.aspect;
    const time = now / 1000;
    const size = Math.min(
      pose.size,
      (pose.width * aspect) / (this.glassWidth / this.glassHeight),
    );
    const distance = this.glassHeight / (2 * tangent * size);
    const float = this.reducedMotion ? 0 : pose.float * (1 - dived);
    const y = pose.y + Math.sin(time * 0.9) * 0.012 * float;
    this.glass.center.set(
      pose.x * distance * tangent * aspect,
      y * distance * tangent,
      -distance,
    );
    this.euler.set(
      pose.pitch +
        (this.pointer.smoothY * 0.06 + Math.sin(time * 0.7 + 1) * 0.015) *
          float,
      pose.yaw +
        (this.pointer.smoothX * 0.1 + Math.sin(time * 0.5) * 0.035) * float,
      pose.roll + Math.sin(time * 0.8 + 2) * 0.015 * float,
      "YXZ",
    );
    this.monitor.quaternion.setFromEuler(this.euler);
    this.monitor.position
      .copy(this.glass.center)
      .sub(
        this.offset
          .copy(this.glassCenter)
          .applyQuaternion(this.monitor.quaternion),
      );
    this.monitor.updateMatrixWorld(true);
    this.glass.normal
      .copy(this.glassNormal)
      .applyQuaternion(this.monitor.quaternion);
    this.glass.up.copy(this.glassUp).applyQuaternion(this.monitor.quaternion);
  }

  /** Reports where the glass is on the canvas, for the button over it. */
  /** Where a part of the glass lands on the canvas, given as shares of it. */
  private project(x: number, y: number, width: number, height: number) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const right = this.offset.crossVectors(this.glass.up, this.glass.normal);
    for (const across of [x, x + width]) {
      for (const down of [y, y + height]) {
        this.corner
          .copy(this.glass.center)
          .addScaledVector(right, (across - 0.5) * this.glassWidth)
          .addScaledVector(this.glass.up, (0.5 - down) * this.glassHeight)
          .project(this.camera);
        minX = Math.min(minX, this.corner.x);
        maxX = Math.max(maxX, this.corner.x);
        minY = Math.min(minY, this.corner.y);
        maxY = Math.max(maxY, this.corner.y);
      }
    }
    return {
      left: ((minX + 1) / 2) * this.width,
      top: ((1 - maxY) / 2) * this.height,
      width: ((maxX - minX) / 2) * this.width,
      height: ((maxY - minY) / 2) * this.height,
    };
  }

  /**
   * Reports where the glass and the regions of its card are on the canvas,
   * for the buttons and links over them.
   */
  private reportScreen() {
    if (this.screenListeners.size === 0) return;
    this.camera.updateMatrixWorld();
    const rect = this.project(0, 0, 1, 1);
    const showing = this.composer.showing;
    const regions = this.composer.regions;
    const previous = this.screenFrame;
    const moved =
      Math.abs(rect.left - previous.rect.left) >= 0.5 ||
      Math.abs(rect.top - previous.rect.top) >= 0.5 ||
      Math.abs(rect.width - previous.rect.width) >= 0.5 ||
      Math.abs(rect.height - previous.rect.height) >= 0.5;
    const changed =
      showing !== previous.showing ||
      regions.length !== Object.keys(previous.regions).length ||
      regions !== this.reportedRegions;
    if (!moved && !changed) return;
    this.reportedRegions = regions;
    const frame: ScreenFrame = { showing, rect, regions: {} };
    for (const region of regions) {
      frame.regions[region.id] = this.project(
        region.x,
        region.y,
        region.width,
        region.height,
      );
    }
    this.screenFrame = frame;
    for (const listener of this.screenListeners) listener(frame);
  }

  private wake() {
    if (this.model && !this.held && !this.frame) {
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    this.frame = 0;
    const delta = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const settled = this.update(now, delta);
    this.renderer.setRenderTarget(this.crtTarget);
    this.renderer.render(this.crtScene, this.crtCamera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    // It floats and the tube flickers: it only rests under reduced motion.
    if (!this.held && (!settled || !this.reducedMotion)) {
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private update(now: number, delta: number) {
    const instant = this.reducedMotion;
    if (this.dive) {
      const { from, to, startedAt, resolve } = this.dive;
      const progress = Math.min(1, (now - startedAt) / diveDuration);
      this.diveProgress = from + (to - from) * progress;
      if (progress === 1) {
        this.dive = null;
        resolve();
      }
    }
    const dived = easeInOutCubic(this.diveProgress);

    // The pose of the story, caught up with smoothly.
    const target = poseAt(this.story, this.layout, this.contactOpen);
    let moving = false;
    for (const key of poseKeys) {
      const value =
        instant || !this.posePlaced
          ? target[key]
          : damp(this.pose[key], target[key], follow, delta);
      if (Math.abs(value - target[key]) > 1e-4) moving = true;
      this.pose[key] = value;
    }
    this.posePlaced = true;
    this.pointer.smoothX = damp(this.pointer.smoothX, this.pointer.x, 3, delta);
    this.pointer.smoothY = damp(this.pointer.smoothY, this.pointer.y, 3, delta);

    // Once loaded, it rises into place, turning.
    const appear = instant
      ? 1
      : ease(
          THREE.MathUtils.clamp((now - this.loadedAt) / appearDuration, 0, 1),
        );
    const placed: Pose = {
      ...this.pose,
      y: this.pose.y - (1 - appear) * 0.35,
      yaw: this.pose.yaw + (1 - appear) * 0.8,
      size: this.pose.size * (0.75 + 0.25 * appear),
    };
    this.place(placed, now, dived);

    // The camera dives into the glass, turning upright with it.
    const glass = this.glass;
    this.divePosition
      .copy(glass.center)
      .addScaledVector(glass.normal, this.diveDistance());
    this.camera.position.set(0, 0, 0).lerp(this.divePosition, dived);
    this.camera.up.copy(this.worldUp).lerp(glass.up, dived).normalize();
    this.camera.lookAt(
      this.look.lerpVectors(this.forward, glass.center, dived),
    );

    this.tune(now);
    if (this.pending && now >= this.pending.at) {
      this.pending.show(now, false);
      this.pending = null;
    }

    // Power cycle: slower on than off, like a warming tube.
    const powerSpeed = this.powerTarget > this.power ? 1.15 : 2.4;
    this.power = instant
      ? this.powerTarget
      : THREE.MathUtils.clamp(
          this.power +
            Math.sign(this.powerTarget - this.power) * delta * powerSpeed,
          0,
          1,
        );
    this.glitch = damp(this.glitch, 0, 5.5, delta);

    this.composer.setProgress(this.story.manifesto);
    if (this.power > 0 && this.composer.draw(now))
      this.screenTexture.needsUpdate = true;
    if (this.powerTarget === 0 && this.power === 0) this.composer.off();
    this.reportScreen();

    const [r, g, b] = this.composer.lightColor;
    this.lightColor.setRGB(
      damp(this.lightColor.r, r, 3, delta),
      damp(this.lightColor.g, g, 3, delta),
      damp(this.lightColor.b, b, 3, delta),
    );
    const flicker =
      1 +
      Math.sin(now * 0.11) * 0.015 +
      this.glitch * (Math.random() - 0.5) * 0.6;
    const lit = ease(this.power);
    this.glow.material.color.copy(this.lightColor);
    this.glow.material.opacity = lit * 0.075 * flicker * (1 - dived);
    if (this.bodyMaterial)
      this.bodyMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.2, 0.8, lit);

    // Diving in, the glass loses its reflections and cloudiness.
    const clean = smoothstep(0.15, 0.8, this.diveProgress);
    if (this.glassMaterial) {
      this.glassMaterial.envMapIntensity = glassReflection * (1 - clean);
      this.glassMaterial.color.setScalar(glassDiffuse * (1 - clean));
    }
    const uniforms = this.crtMaterial.uniforms;
    uniforms.uTime.value = now / 1000;
    uniforms.uPower.value = this.power;
    uniforms.uGlitch.value = this.glitch;
    uniforms.uClean.value = clean;
    uniforms.uFocus.value = this.focusTexture
      ? smoothstep(0.3, 0.55, this.diveProgress)
      : 0;
    this.composer.setFocus(smoothstep(0, 0.3, this.diveProgress));
    this.updateXray();

    return (
      !this.dive &&
      !moving &&
      appear === 1 &&
      this.power === this.powerTarget &&
      this.glitch < 0.002
    );
  }

  /**
   * While the glass shows the projects, places on it the cards passing
   * behind it, where they are, and develops the one coming to rest into its
   * project's hero.
   */
  private updateXray() {
    const uniforms = this.crtMaterial.uniforms;
    const hero = this.composer.shownProject;
    // Diving in, the hero takes the glass alone.
    uniforms.uXray.value = hero ? 1 - smoothstep(0, 0.2, this.diveProgress) : 0;
    if (!hero) return;
    this.camera.updateMatrixWorld();
    const glass = this.project(0, 0, 1, 1);
    if (glass.width < 1 || glass.height < 1) return;

    const { project } = this.story;
    const layout = this.layout;
    // A card's height, as a share of the viewport's, in glass widths and
    // heights.
    const widthScale = (this.height * cardAspect) / glass.width;
    const heightScale = this.height / glass.height;
    // From one card to the next, in glass widths: as far apart as they are
    // behind the glass, unless that would crowd more than two on it (on
    // phones, where they run below the monitor).
    const step = Math.max(
      (cardTracks[layout].spacing * this.width) / 2 / glass.width,
      0.56 + (cardHeight(1, layout) * widthScale) / 2,
    );
    // Where the middle of the viewport falls on the glass.
    const middle = (this.width / 2 - glass.left) / glass.width;

    // The card that has just passed the middle, and the next one.
    const first = Math.floor(project - channelRest);
    const slots = [
      { panel: uniforms.uPanelA, rect: uniforms.uSlotA.value },
      { panel: uniforms.uPanelB, rect: uniforms.uSlotB.value },
    ] as const;
    slots.forEach(({ panel, rect }, slot) => {
      const index = first + slot;
      const texture = this.panels.at(index);
      panel.value = texture;
      const shown = texture ? 1 : 0;
      const card = placeCard(project, index, layout);
      // Only the project on the glass develops: it is the one at rest.
      const develop =
        index === hero.index ? 1 - smoothstep(0.03, 0.3, card.away) : 0;
      const centre = middle + (card.x / cardTracks[layout].spacing) * step;
      rect.set(
        THREE.MathUtils.lerp(centre, 0.5, develop),
        0.5,
        THREE.MathUtils.lerp((card.height * widthScale) / 2, 0.5, develop),
        THREE.MathUtils.lerp((card.height * heightScale) / 2, 0.5, develop),
      );
      uniforms.uShown.value.setComponent(slot, shown);
      uniforms.uDevelop.value.setComponent(slot, develop);
    });
  }
}
