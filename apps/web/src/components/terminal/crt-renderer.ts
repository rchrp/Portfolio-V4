import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { ScreenComposer, type ScreenProject } from "./screen-composer";
import { createSunsetEnvironments } from "./sunset-environment";

export type TheaterScroll = {
  /** 0 → 1 while the camera approaches the switched-off monitor. */
  intro: number;
  /** Continuous project position: 1.5 is halfway through the second project. */
  project: number;
  /** 0 → 1 while the camera pulls back after the last project. */
  outro: number;
};

export type TheaterLayout = "side" | "stacked";

/** Bounds of the glass on the canvas, in CSS pixels. */
export type ScreenRect = {
  left: number;
  top: number;
  width: number;
  height: number;
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
const crtFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uFocusMap;
  uniform float uTime;
  uniform float uPower;
  uniform float uGlitch;
  uniform float uClean;
  uniform float uFocus;
  uniform vec2 uFocusCover;
  varying vec2 vUv;

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
    vec3 color = sampleScreen(powered, aberration);

    // Cheap phosphor bleed: two wide taps around the pixel.
    if (crt > 0.0) {
      vec3 bleed = sampleScreen(powered + vec2(0.003, 0.0), aberration)
        + sampleScreen(powered - vec2(0.003, 0.0), aberration);
      color += bleed * 0.05 * crt;
    }

    // 240 lines: coarse enough not to shimmer once the texture is minified.
    color *= mix(1.0, 0.92 + 0.08 * sin(powered.y * 480.0 * 3.14159), crt);
    float grain = hash(powered * vec2(1152.0, 768.0) + fract(uTime) * 91.0);
    color = mix(color, vec3(grain), (0.025 + glitch * 0.4) * crt);
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

function radialTexture(inner: string, outer: string, size = 256) {
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
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const damp = (current: number, target: number, lambda: number, delta: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * delta));

const ease = (value: number) => value * value * (3 - 2 * value);

const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

const smoothstep = (edge0: number, edge1: number, value: number) =>
  ease(THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1));

const diveDuration = 1750;
// Longest side of the picture texture shown once inside the screen.
const focusResolution = 2560;
// Share of the viewport the glass may fill, in height and in width.
const framing: Record<TheaterLayout, { height: number; width: number }> = {
  side: { height: 0.7, width: 0.645 },
  stacked: { height: 0.5, width: 0.9 },
};
// Share of the width kept on the left of wide screens for the project's mark
// and the channel list: the monitor is centred on the rest.
const leftColumn: Record<TheaterLayout, number> = { side: 0.24, stacked: 0 };
// Strength of the glass's reflections, faded out while diving into it.
const glassReflection = 1.4;
// Scales the roughness map: clean glass mirrors the window sharply, its
// scratches and smudges blur it.
const glassRoughness = 0.6;
// The body's map makes most of it a dark, rough metal, which shows little
// more than black in a dim room: toned down, the lights shape its volume.
const bodyMetalness = 0.35;
// On power-on, the project scans in once the tube's line has opened.
const powerOnDelay = 350;
// Resting view, as offsets from the glass's normal: a little to the right and
// above, so the monitor turns towards the left column and its right side
// shows.
const restingView = { across: 0.15, along: 0.08 };
// Where the approach starts: about 40° to the right and above, the side of
// the body in full view.
const introView = { across: 0.85, along: 0.34 };
// Where the window's reflection is centred on the glass from that view, in
// the same units: up and to the left, the window being behind the viewer.
const windowReflection = { across: -0.16, along: 0.12 };

function loadFocusImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    if (!src.startsWith("/")) image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

type Dive = {
  from: number;
  to: number;
  startedAt: number;
  resolve: () => void;
};

export class CrtRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  private readonly composer: ScreenComposer;
  private readonly screenTexture: THREE.CanvasTexture;
  // The CRT pass draws the composer's canvas, through the tube's effects,
  // into the texture the glass emits.
  private readonly crtMaterial: THREE.ShaderMaterial;
  private readonly crtScene = new THREE.Scene();
  private readonly crtCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly crtTarget: THREE.WebGLRenderTarget;
  private readonly screenLight: THREE.RectAreaLight;
  private readonly glow: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;
  private glassMaterial: THREE.MeshStandardMaterial | null = null;
  private bodyMaterial: THREE.MeshStandardMaterial | null = null;
  private model: THREE.Object3D | null = null;
  private environments: { glass: THREE.Texture; body: THREE.Texture } | null =
    null;
  // The glass's frame, measured on the model: it is flat and leans back.
  private readonly glassCenter = new THREE.Vector3();
  private readonly glassNormal = new THREE.Vector3(0, 0, 1);
  private readonly glassUp = new THREE.Vector3(0, 1, 0);
  private readonly glassRight = new THREE.Vector3(1, 0, 0);
  private glassWidth = 1.5;
  private glassHeight = 1;
  private readonly cameraPosition = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3();
  private cameraPlaced = false;
  private readonly viewDirection = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly divePosition = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly corner = new THREE.Vector3();
  private readonly lightColor = new THREE.Color(1, 1, 1);
  private screenRect: ScreenRect = { left: 0, top: 0, width: 0, height: 0 };
  private readonly onScreenRect: (rect: ScreenRect) => void;
  private dive: Dive | null = null;
  /** 0 in the room, 1 inside the glass with the picture filling the view. */
  private diveProgress = 0;
  private focusTexture: THREE.Texture | null = null;
  private focusSize = { width: 1, height: 1 };
  private focusSource: string | null = null;
  private held = false;
  private readonly disposables: { dispose(): void }[] = [];
  private scroll: TheaterScroll = { intro: 0, project: 0, outro: 0 };
  private layout: TheaterLayout = "side";
  private pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  private width = 1;
  private height = 1;
  private frame = 0;
  private running = false;
  private lastTime = 0;
  private power = 0;
  private powerTarget = 0;
  private glitch = 0;
  private pendingProject: { project: ScreenProject; at: number } | null = null;
  private queuedProject: ScreenProject | null = null;
  private readonly reducedMotion: boolean;

  constructor(
    canvas: HTMLCanvasElement,
    options: {
      sans: string;
      reducedMotion: boolean;
      /** Called whenever the glass moves on the canvas. */
      onScreenRect: (rect: ScreenRect) => void;
    },
  ) {
    this.reducedMotion = options.reducedMotion;
    this.onScreenRect = options.onScreenRect;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    RectAreaLightUniformsLib.init();

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

    this.screenLight = new THREE.RectAreaLight(0xffffff, 0, 1, 1);
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radialTexture("rgba(255,255,255,0.9)", "rgba(255,255,255,0)"),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );

    this.buildStage();
    this.disposables.push(
      this.screenTexture,
      this.crtTarget,
      this.crtMaterial,
      crtQuad.geometry,
      this.glow.geometry,
      this.glow.material,
      this.glow.material.map!,
    );
  }

  /**
   * Loads the monitor: "Monitor III" by re1monsen (CC BY 4.0), prepared by
   * `scripts/build-model.mjs`, whose "Screen" primitive is the glass.
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
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.metalness = bodyMetalness;
      // Its emissive map holds the front panel's printed labels.
      if (material.emissiveMap) this.bodyMaterial = material;
    }

    // The glass keeps its cloudy base color and the scratches of its
    // roughness map, and emits the CRT pass through its second UV set.
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
    this.scene.add(model);
    this.model = model;

    const { glassCenter, glassNormal, glassWidth, glassHeight } = this;
    this.screenLight.width = glassWidth;
    this.screenLight.height = glassHeight;
    this.screenLight.position
      .copy(glassCenter)
      .addScaledVector(glassNormal, 0.01);
    this.screenLight.lookAt(
      this.look.copy(glassCenter).addScaledVector(glassNormal, 10),
    );
    this.glow.position.copy(glassCenter).addScaledVector(glassNormal, 0.14);
    this.glow.lookAt(
      this.look.copy(glassCenter).addScaledVector(glassNormal, 1),
    );
    this.glow.scale.set(glassWidth * 2.4, glassHeight * 2.6, 1);

    // A mirror sends the view back symmetrically: offset the window from the
    // reflection's position by the viewer's own offset.
    const towards = glassNormal
      .clone()
      .addScaledVector(
        this.glassRight,
        windowReflection.across - restingView.across,
      )
      .addScaledVector(
        this.glassUp,
        windowReflection.along - restingView.along,
      );
    const environments = createSunsetEnvironments(
      this.renderer,
      towards,
      new THREE.Vector3(0, 1, 0),
    );
    this.environments = environments;
    this.scene.environment = environments.body;
    this.scene.environmentIntensity = 1;
    glassMaterial.envMap = environments.glass;
    glassMaterial.envMapIntensity = glassReflection;
    this.wake();
  }

  /** Centre, axes and size of the flat glass, in world space. */
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

  private buildStage() {
    this.scene.add(this.screenLight, this.glow);

    // Desk that fades into the matrix wall behind the canvas.
    const deskAlpha = radialTexture("#ffffff", "#000000", 512);
    const desk = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshStandardMaterial({
        color: 0x17130f,
        roughness: 0.82,
        alphaMap: deskAlpha,
        transparent: true,
      }),
    );
    desk.rotation.x = -Math.PI / 2;
    desk.receiveShadow = true;
    this.scene.add(desk);
    this.disposables.push(desk.geometry, desk.material, deskAlpha);

    // Bright enough for the body's dark blue-grey to show its volume.
    const key = new THREE.SpotLight(0xffdcc0, 75, 0, 0.42, 0.85, 2);
    key.position.set(-3.1, 4.4, 3.4);
    key.target.position.set(0, 0.6, 0.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.shadow.radius = 6;
    this.scene.add(key, key.target);

    const rim = new THREE.DirectionalLight(0xff8a4c, 3.2);
    rim.position.set(2.6, 2.4, -3.6);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0x8a9ab4, 0x16110d, 0.6));
  }

  setLayout(layout: TheaterLayout) {
    this.layout = layout;
    this.composer.setLayout(layout === "stacked" ? "compact" : "wide");
    this.wake();
  }

  setScroll(scroll: TheaterScroll) {
    this.scroll = scroll;
    this.wake();
  }

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

  /** Powers the tube on, straight onto the current project, or off. */
  setPower(on: boolean) {
    if (this.powerTarget === (on ? 1 : 0)) return;
    this.powerTarget = on ? 1 : 0;
    if (on && this.queuedProject) {
      this.composer.showProject(
        this.queuedProject,
        performance.now() + powerOnDelay,
        this.reducedMotion,
      );
    }
    this.wake();
  }

  showProject(project: ScreenProject) {
    const previous = this.queuedProject;
    this.queuedProject = project;
    if (this.powerTarget === 0 || previous?.slug === project.slug) return;
    // Inside the glass the channel switches cleanly.
    if (this.reducedMotion || this.diveProgress > 0) {
      this.composer.showProject(project, performance.now(), true);
    } else {
      // Tear the picture first, swap channels at the peak of the glitch.
      this.glitch = 1;
      this.pendingProject = { project, at: performance.now() + 110 };
    }
    this.wake();
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      this.width < 700 ? 1.5 : 1.75,
    );
    this.renderer.setPixelRatio(pixelRatio);
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

  /** Pulls the camera back out of the glass, into the room. */
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
    const image = await loadFocusImage(src);
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

  setActive(active: boolean) {
    this.running = active;
    if (active) this.wake();
    else if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  dispose() {
    this.setActive(false);
    this.dive?.resolve();
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

  /** Distance from the glass at which it fills the frame as `framing` says. */
  private viewDistance() {
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const share = framing[this.layout];
    return Math.max(
      this.glassHeight / (2 * tangent * share.height),
      this.glassWidth / (2 * tangent * this.camera.aspect * share.width),
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
    return (fit / (2 * tangent)) * 0.94;
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

  /** Reports where the glass is on the canvas, for the button over it. */
  /**
   * Shifts the projection, not the scene, off the left column; inside the
   * glass the view is centred again.
   */
  private applyViewOffset(dived: number) {
    const shift = -this.width * (leftColumn[this.layout] / 2) * (1 - dived);
    this.camera.setViewOffset(
      this.width,
      this.height,
      shift,
      0,
      this.width,
      this.height,
    );
  }
  private reportScreenRect() {
    this.camera.updateMatrixWorld();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      this.corner
        .copy(this.glassCenter)
        .addScaledVector(this.glassRight, (x * this.glassWidth) / 2)
        .addScaledVector(this.glassUp, (y * this.glassHeight) / 2)
        .project(this.camera);
      minX = Math.min(minX, this.corner.x);
      maxX = Math.max(maxX, this.corner.x);
      minY = Math.min(minY, this.corner.y);
      maxY = Math.max(maxY, this.corner.y);
    }
    const rect = {
      left: ((minX + 1) / 2) * this.width,
      top: ((1 - maxY) / 2) * this.height,
      width: ((maxX - minX) / 2) * this.width,
      height: ((maxY - minY) / 2) * this.height,
    };
    const previous = this.screenRect;
    if (
      Math.abs(rect.left - previous.left) < 0.5 &&
      Math.abs(rect.top - previous.top) < 0.5 &&
      Math.abs(rect.width - previous.width) < 0.5 &&
      Math.abs(rect.height - previous.height) < 0.5
    )
      return;
    this.screenRect = rect;
    this.onScreenRect(rect);
  }

  private wake() {
    if (this.running && !this.held && !this.frame) {
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
    // The screen flickers: keep rendering while lit.
    if (this.running && !this.held && (!settled || this.power > 0.001)) {
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private update(now: number, delta: number) {
    const { intro, project, outro } = this.scroll;
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

    // Camera path: approach from the upper right, face the glass with a slow
    // sway that slides the reflections across it, then pull back.
    const approach = ease(intro);
    const leave = ease(outro);
    this.pointer.smoothX = damp(this.pointer.smoothX, this.pointer.x, 3, delta);
    this.pointer.smoothY = damp(this.pointer.smoothY, this.pointer.y, 3, delta);
    const pointerX = instant ? 0 : this.pointer.smoothX;
    const pointerY = instant ? 0 : this.pointer.smoothY;
    const across =
      THREE.MathUtils.lerp(
        introView.across,
        restingView.across + Math.sin(project * 1.15) * 0.05,
        approach,
      ) +
      leave * 0.25 +
      pointerX * 0.06;
    const along =
      THREE.MathUtils.lerp(
        introView.along,
        restingView.along + Math.cos(project * 0.9) * 0.02,
        approach,
      ) +
      leave * 0.3 -
      pointerY * 0.04;
    const distance =
      this.viewDistance() *
      (THREE.MathUtils.lerp(2.2, 1, approach) + leave * 1.2);
    this.viewDirection
      .copy(this.glassNormal)
      .addScaledVector(this.glassRight, across)
      .addScaledVector(this.glassUp, along)
      .normalize();
    this.cameraTarget
      .copy(this.glassCenter)
      .addScaledVector(this.viewDirection, distance);
    // From afar the camera looks above the glass, which rises into frame.
    this.lookTarget
      .copy(this.glassCenter)
      .addScaledVector(this.glassUp, (1 - approach) * 0.25);
    if (instant || !this.cameraPlaced) {
      this.cameraPosition.copy(this.cameraTarget);
      this.cameraPlaced = true;
    } else {
      this.cameraPosition.set(
        damp(this.cameraPosition.x, this.cameraTarget.x, 4, delta),
        damp(this.cameraPosition.y, this.cameraTarget.y, 4, delta),
        damp(this.cameraPosition.z, this.cameraTarget.z, 4, delta),
      );
    }
    // The dive blends the room camera towards a frontal view of the glass.
    this.divePosition
      .copy(this.glassCenter)
      .addScaledVector(this.glassNormal, this.diveDistance());
    this.camera.position.lerpVectors(
      this.cameraPosition,
      this.divePosition,
      dived,
    );
    this.camera.lookAt(
      this.look.lerpVectors(this.lookTarget, this.glassCenter, dived),
    );
    this.applyViewOffset(dived);
    this.reportScreenRect();

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

    if (this.pendingProject && now >= this.pendingProject.at) {
      this.composer.showProject(this.pendingProject.project, now);
      this.pendingProject = null;
    }
    this.glitch = damp(this.glitch, 0, 5.5, delta);

    if (this.power > 0 && this.composer.draw(now))
      this.screenTexture.needsUpdate = true;
    if (this.powerTarget === 0 && this.power === 0) this.composer.off();

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
    this.screenLight.color.copy(this.lightColor);
    this.screenLight.intensity = lit * 7 * flicker;
    this.glow.material.color.copy(this.lightColor);
    this.glow.material.opacity = lit * 0.075 * flicker * (1 - dived);
    if (this.bodyMaterial)
      this.bodyMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.2, 0.8, lit);

    // Diving in, the glass loses its reflections and cloudiness.
    const clean = smoothstep(0.15, 0.8, this.diveProgress);
    if (this.glassMaterial) {
      this.glassMaterial.envMapIntensity = glassReflection * (1 - clean);
      this.glassMaterial.color.setScalar(1 - clean);
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

    return (
      !this.dive &&
      this.cameraPosition.distanceToSquared(this.cameraTarget) < 1e-6 &&
      this.power === this.powerTarget &&
      this.glitch < 0.002
    );
  }
}
