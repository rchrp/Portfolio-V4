import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { ScreenComposer, type ScreenProject } from "./screen-composer";

export type TheaterScroll = {
  /** 0 → 1 while the camera approaches the switched-off monitor. */
  intro: number;
  /** Continuous project position: 1.5 is halfway through the second project. */
  project: number;
  /** 0 → 1 while the camera pulls back after the last project. */
  outro: number;
};

export type TheaterLayout = "side" | "stacked";

const screenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// CRT look, kept subtle so the content stays legible: barrel curvature,
// radial chromatic aberration, scanlines, aperture grille, phosphor bleed,
// vignette, flicker. uGlitch drives the channel-switch tearing and uPower
// the classic line-then-open power cycle. uClean fades all of it out, and
// uFocus swaps the desktop for the project picture alone, while the camera
// dives into the glass: the tube ends up a plain, modern display.
const screenFragment = /* glsl */ `
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
    vec3 desktop = vec3(
      texture2D(uMap, uv + offset).r,
      texture2D(uMap, uv).g,
      texture2D(uMap, uv - offset).b
    );
    if (uFocus <= 0.0) return desktop;
    // The picture covers the glass, like object-fit: cover.
    vec2 cover = (uv - 0.5) * uFocusCover + 0.5;
    vec3 picture = vec3(
      texture2D(uFocusMap, cover + offset).r,
      texture2D(uFocusMap, cover).g,
      texture2D(uFocusMap, cover - offset).b
    );
    return mix(desktop, picture, uFocus);
  }

  void main() {
    float crt = 1.0 - uClean;
    float glitch = uGlitch * crt;
    vec2 centered = vUv * 2.0 - 1.0;
    // Bulge the picture like curved glass while it keeps filling the whole
    // tube: lines bow, the corners stay pinned to the glass corners.
    vec2 bulged = centered * (1.0 + 0.035 * centered.yx * centered.yx) / 1.035;
    vec2 uv = mix(centered, bulged, crt) * 0.5 + 0.5;

    float openX = smoothstep(0.0, 0.32, uPower);
    float openY = max(smoothstep(0.28, 1.0, uPower), 0.004);
    vec2 powered = (uv - 0.5) / vec2(max(openX, 0.001), openY) + 0.5;

    float frame = floor(uTime * 24.0);
    float band = step(0.55, hash(vec2(floor(powered.y * 18.0), frame)));
    powered.x += (hash(vec2(floor(powered.y * 160.0), frame)) - 0.5) * 0.05 * glitch * band;
    powered.y += glitch * 0.015 * sin(uTime * 61.0);

    vec2 fromCenter = powered - 0.5;
    vec2 aberration = (fromCenter * (0.0035 + dot(fromCenter, fromCenter) * 0.012 + glitch * 0.02)
      + vec2(0.0007, 0.0)) * crt;
    vec3 color = sampleScreen(powered, aberration);

    // Cheap phosphor bleed: a few wide taps around the pixel.
    if (crt > 0.0) {
      vec3 bleed = sampleScreen(powered + vec2(0.004, 0.0), aberration)
        + sampleScreen(powered - vec2(0.004, 0.0), aberration)
        + sampleScreen(powered + vec2(0.0, 0.005), aberration)
        + sampleScreen(powered - vec2(0.0, 0.005), aberration);
      color += bleed * 0.06 * crt;
    }

    float scanline = mix(1.0, 0.84 + 0.16 * sin(powered.y * 384.0 * 3.14159), crt);
    float grille = mod(gl_FragCoord.x, 3.0);
    vec3 mask = mix(vec3(1.0), vec3(grille < 1.0 ? 1.0 : 0.82, grille >= 1.0 && grille < 2.0 ? 1.0 : 0.82, grille >= 2.0 ? 1.0 : 0.82), 0.35 * crt);
    color *= scanline * mask;

    float grain = hash(powered * vec2(1024.0, 768.0) + fract(uTime) * 91.0);
    color = mix(color, vec3(grain), (0.035 + glitch * 0.4) * crt);
    color *= mix(1.0, 0.985 + 0.015 * sin(uTime * 110.0), crt);

    vec2 edge = smoothstep(vec2(0.0), vec2(0.004, 0.006), powered)
      * smoothstep(vec2(0.0), vec2(0.004, 0.006), 1.0 - powered);
    float inside = mix(1.0, edge.x * edge.y, crt);
    float vignette = mix(1.0, clamp(1.0 - dot(centered * vec2(0.55, 0.65), centered * vec2(0.55, 0.65)) * 0.55, 0.0, 1.0), crt);
    float line = (1.0 - smoothstep(0.0, 0.25, openY)) * exp(-abs(uv.y - 0.5) * 260.0) * openX
      * step(abs(uv.x - 0.5), 0.5 * openX);
    float visible = smoothstep(0.0, 0.08, uPower);

    vec3 glass = vec3(0.016, 0.019, 0.018) * crt;
    vec3 picture = color * inside * vignette * mix(1.0, 1.22, crt) * visible + vec3(1.0, 0.97, 0.92) * line * 2.4;

    // Glass reflections: a soft window highlight and darker edges.
    float highlight = smoothstep(0.5, 0.0, length((vUv - vec2(0.24, 0.8)) * vec2(1.0, 1.5))) * 0.05 * crt;
    float rim = smoothstep(0.55, 1.0, length(centered * vec2(0.92, 0.98))) * 0.03 * crt;
    gl_FragColor = vec4(glass + picture + highlight + rim, 1.0);
    #include <colorspace_fragment>
  }
`;

function radialTexture(inner: string, outer: string, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
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
  private readonly screenMaterial: THREE.ShaderMaterial;
  private readonly screenLight: THREE.RectAreaLight;
  private readonly glow: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;
  private ledMaterial: THREE.MeshStandardMaterial | null = null;
  private model: THREE.Object3D | null = null;
  private readonly lookTarget = new THREE.Vector3(0, 0.5, 0.15);
  private readonly cameraPosition = new THREE.Vector3(-0.9, 2.6, 8.5);
  private readonly cameraTarget = new THREE.Vector3();
  private readonly lightColor = new THREE.Color(1, 1, 1);
  private readonly glassCenter = new THREE.Vector3();
  private readonly glassSize = new THREE.Vector3(1, 1, 0);
  private glassFront = 0;
  private readonly divePosition = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
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
  private hasBooted = false;
  private readonly reducedMotion: boolean;

  constructor(
    canvas: HTMLCanvasElement,
    options: { mono: string; sans: string; reducedMotion: boolean },
  ) {
    this.reducedMotion = options.reducedMotion;
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

    const environment = new THREE.PMREMGenerator(this.renderer);
    const roomEnvironment = new RoomEnvironment();
    this.scene.environment = environment.fromScene(
      roomEnvironment,
      0.04,
    ).texture;
    this.scene.environmentIntensity = 0.22;
    roomEnvironment.dispose();
    environment.dispose();

    this.composer = new ScreenComposer({
      mono: options.mono,
      sans: options.sans,
    });
    this.screenTexture = new THREE.CanvasTexture(this.composer.canvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenTexture.anisotropy = 4;
    this.screenMaterial = new THREE.ShaderMaterial({
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
      vertexShader: screenVertex,
      fragmentShader: screenFragment,
      toneMapped: false,
    });

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
      this.screenMaterial,
      this.glow.geometry,
      this.glow.material,
      this.glow.material.map!,
    );
  }

  /**
   * Loads the monitor: "Computer Terminal" by Chris Sweetwood (CC BY-SA 4.0),
   * prepared by `scripts/build-model.mjs`, whose "Screen" primitive is the
   * curved glass the CRT shader draws on.
   */
  async load(url: string) {
    const { scene: model } = await new GLTFLoader().loadAsync(url);
    let glass: THREE.Mesh | null = null;

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.MeshStandardMaterial;
      if (material.name === "Screen") {
        material.dispose();
        object.material = this.screenMaterial;
        glass = object;
        return;
      }
      object.castShadow = true;
      object.receiveShadow = true;
      // The emissive map only holds the power LED.
      if (material.emissiveMap) {
        material.emissiveIntensity = 0;
        this.ledMaterial = material;
      }
    });
    if (!glass) throw new Error("The model has no screen glass.");

    // Rest the model on the desk, centred on the origin.
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z);
    model.updateMatrixWorld(true);
    this.scene.add(model);
    this.model = model;

    const glassBounds = new THREE.Box3().setFromObject(glass);
    const glassCenter = glassBounds.getCenter(new THREE.Vector3());
    const glassSize = glassBounds.getSize(new THREE.Vector3());
    this.glassCenter.copy(glassCenter);
    this.glassSize.copy(glassSize);
    this.glassFront = glassBounds.max.z;
    this.screenLight.width = glassSize.x;
    this.screenLight.height = glassSize.y;
    this.screenLight.position.set(
      glassCenter.x,
      glassCenter.y,
      glassBounds.max.z + 0.01,
    );
    this.screenLight.lookAt(glassCenter.x, glassCenter.y, 10);
    this.glow.position.set(
      glassCenter.x,
      glassCenter.y,
      glassBounds.max.z + 0.14,
    );
    this.glow.scale.set(glassSize.x * 2.4, glassSize.y * 2.6, 1);
    this.lookTarget.set(0, (bounds.max.y - bounds.min.y) * 0.46, 0.12);
    this.wake();
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
    desk.position.z = 0.4;
    desk.receiveShadow = true;
    this.scene.add(desk);
    this.disposables.push(desk.geometry, desk.material, deskAlpha);

    const key = new THREE.SpotLight(0xffdcc0, 38, 0, 0.42, 0.85, 2);
    key.position.set(-3.1, 4.4, 3.4);
    key.target.position.set(0, 0.6, 0.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.shadow.radius = 6;
    this.scene.add(key, key.target);

    const rim = new THREE.DirectionalLight(0xff8a4c, 1.8);
    rim.position.set(2.6, 2.4, -3.6);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0x8a9ab4, 0x16110d, 0.35));
  }

  setLayout(layout: TheaterLayout) {
    this.layout = layout;
    this.applyViewOffset();
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

  /** Powers the tube on (boot sequence the first time) or off. */
  setPower(on: boolean) {
    if (this.powerTarget === (on ? 1 : 0)) return;
    this.powerTarget = on ? 1 : 0;
    const now = performance.now();
    if (on && !this.hasBooted) {
      this.hasBooted = true;
      this.composer.boot(
        this.queuedProject?.total ?? 0,
        now + (this.reducedMotion ? -5000 : 500),
      );
    } else if (on && this.queuedProject) {
      this.composer.showProject(this.queuedProject, now, this.reducedMotion);
    }
    this.wake();
  }

  showProject(project: ScreenProject) {
    const previous = this.queuedProject;
    this.queuedProject = project;
    if (!this.hasBooted || this.powerTarget === 0 || this.composer.isBooting)
      return;
    if (previous?.slug === project.slug) return;
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
    this.applyViewOffset();
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
    this.screenMaterial.uniforms.uFocusMap.value = texture;
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
    this.model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      if (object.material === this.screenMaterial) return;
      const material = object.material as THREE.MeshStandardMaterial;
      for (const texture of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
        material.aoMap,
        material.emissiveMap,
      ])
        texture?.dispose();
      material.dispose();
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  private animateDive(to: number) {
    this.dive?.resolve();
    return new Promise<void>((resolve) => {
      if (this.reducedMotion || !this.model) {
        this.diveProgress = to;
        this.dive = null;
        this.applyViewOffset();
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
      (this.glassSize.x / this.glassSize.y);
    this.screenMaterial.uniforms.uFocusCover.value.set(
      Math.min(1, 1 / ratio),
      Math.min(1, ratio),
    );
  }

  /** Distance from the glass at which it just overflows the viewport. */
  private diveDistance() {
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const fit = Math.min(
      this.glassSize.y,
      this.glassSize.x / this.camera.aspect,
    );
    // The glass bulges: its edges sit further back than its centre.
    return (fit / (2 * tangent) - this.glassSize.z) * 0.97;
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
      (this.glassSize.x * pixelsPerUnit) / width,
      (this.glassSize.y * pixelsPerUnit) / height,
    );
    const cover = Math.max(this.width / width, this.height / height);
    return shown / cover;
  }

  private applyViewOffset() {
    // Shift the projection, not the scene, to leave room for the text column.
    // Inside the glass the view is centred on it.
    const centred = 1 - easeInOutCubic(this.diveProgress);
    const shiftX = this.layout === "side" ? -this.width * 0.13 * centred : 0;
    const shiftY = this.layout === "stacked" ? this.height * 0.15 * centred : 0;
    this.camera.setViewOffset(
      this.width,
      this.height,
      shiftX,
      shiftY,
      this.width,
      this.height,
    );
    this.camera.updateProjectionMatrix();
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
    this.renderer.render(this.scene, this.camera);
    // The screen flickers and its cursor blinks: keep rendering while lit.
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
      this.applyViewOffset();
      if (progress === 1) {
        this.dive = null;
        resolve();
      }
    }
    const dived = easeInOutCubic(this.diveProgress);

    // Camera path: approach, slow orbit across projects, then pull back.
    const approach = ease(intro);
    const leave = ease(outro);
    const sway = Math.sin(project * 1.15) * 0.32;
    // On narrow screens, back off until the monitor fits the width.
    const halfWidth =
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) *
      this.camera.aspect;
    const distance =
      this.layout === "stacked" ? Math.max(4.4, 1.02 / halfWidth) : 5.8;
    this.cameraTarget.set(
      THREE.MathUtils.lerp(-1.4, sway, approach) + leave * 0.6,
      THREE.MathUtils.lerp(
        2.9,
        1.45 + Math.cos(project * 0.9) * 0.08,
        approach,
      ) +
        leave * 1.1,
      THREE.MathUtils.lerp(9.5, distance, approach) + leave * 2.6,
    );
    this.pointer.smoothX = damp(this.pointer.smoothX, this.pointer.x, 3, delta);
    this.pointer.smoothY = damp(this.pointer.smoothY, this.pointer.y, 3, delta);
    if (!instant) {
      this.cameraTarget.x += this.pointer.smoothX * 0.22;
      this.cameraTarget.y -= this.pointer.smoothY * 0.12;
    }
    if (instant) this.cameraPosition.copy(this.cameraTarget);
    else {
      this.cameraPosition.x = damp(
        this.cameraPosition.x,
        this.cameraTarget.x,
        4,
        delta,
      );
      this.cameraPosition.y = damp(
        this.cameraPosition.y,
        this.cameraTarget.y,
        4,
        delta,
      );
      this.cameraPosition.z = damp(
        this.cameraPosition.z,
        this.cameraTarget.z,
        4,
        delta,
      );
    }
    // The dive blends the room camera towards a frontal view of the glass.
    this.divePosition.set(
      this.glassCenter.x,
      this.glassCenter.y,
      this.glassFront + this.diveDistance(),
    );
    this.camera.position.lerpVectors(
      this.cameraPosition,
      this.divePosition,
      dived,
    );
    this.camera.lookAt(
      this.look.lerpVectors(this.lookTarget, this.glassCenter, dived),
    );

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

    if (
      this.composer.isBooting &&
      now >= this.composer.bootEndsAt &&
      this.queuedProject
    ) {
      this.glitch = instant ? 0 : 0.7;
      this.composer.showProject(this.queuedProject, now, instant);
    }
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
    if (this.ledMaterial)
      this.ledMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.15, 3, lit);

    const uniforms = this.screenMaterial.uniforms;
    uniforms.uTime.value = now / 1000;
    uniforms.uPower.value = this.power;
    uniforms.uGlitch.value = this.glitch;
    uniforms.uClean.value = smoothstep(0.15, 0.8, this.diveProgress);
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
