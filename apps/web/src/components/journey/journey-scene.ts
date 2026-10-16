import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// The journey as a corridor in the dark: each step stands along a lit path,
// the camera walks it as the page scrolls. three.js draws the world (a floor
// of pixels, the path, a desk lamp where it all starts) and the steps stay
// HTML — crisp, selectable, accessible — placed in the same 3D space with
// CSS transforms computed from the same camera, the way three's
// CSS3DRenderer does it. Depth of field is a CSS blur that grows with the
// distance to the step being read.

export type JourneyLayout = "wide" | "narrow";

export type JourneySceneOptions = {
  /** Receives the WebGL canvas. */
  host: HTMLElement;
  /** Clips the HTML layer; sized to the viewport. */
  view: HTMLElement;
  /** Carries the camera transform; the cards and years are its children. */
  camera: HTMLElement;
  /** One card per step, oldest first. */
  cards: HTMLElement[];
  /** Year labels laid on the floor, before the step they open. */
  years: { element: HTMLElement; index: number }[];
  /** Steps still going on: their marker pulses. */
  ongoing: boolean[];
  /** Called when the step being read changes. */
  onActive: (index: number) => void;
  /** Called once the lamp has been loaded and switched on, or has failed. */
  onReady?: () => void;
};

const SPACING = 7; // World units between two steps.
const FOCUS = 5.6; // Distance from the camera to the step being read.
const FLOOR = -1.15;
const CARD_Y = 0.2;
const LAMP_SCALE = 2.5;

const night = new THREE.Color("#0c0b09");
const phosphor = new THREE.Color("#ece8da");
const accent = new THREE.Color("#f15a24");
const warm = new THREE.Color("#ffc98a");

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const epsilon = (value: number) => (Math.abs(value) < 1e-10 ? 0 : value);

// three.js matrices → CSS, with the y axis flipped (see CSS3DRenderer).
function cameraCss(matrix: THREE.Matrix4) {
  const e = matrix.elements;
  return `matrix3d(${[
    e[0], -e[1], e[2], e[3],
    e[4], -e[5], e[6], e[7],
    e[8], -e[9], e[10], e[11],
    e[12], -e[13], e[14], e[15],
  ].map(epsilon).join(",")})`; // prettier-ignore
}

function objectCss(matrix: THREE.Matrix4) {
  const e = matrix.elements;
  return `translate(-50%,-50%) matrix3d(${[
    e[0], e[1], e[2], e[3],
    -e[4], -e[5], -e[6], -e[7],
    e[8], e[9], e[10], e[11],
    e[12], e[13], e[14], e[15],
  ].map(epsilon).join(",")})`; // prettier-ignore
}

// Square points sized in world units, faded by depth like fog, brightened
// by the lamp's pool of light and around the step being read.
const floorVertex = /* glsl */ `
  uniform float uScale;
  uniform float uSize;
  uniform float uMaxSize;
  uniform float uLamp;
  uniform vec3 uLampSpot;
  uniform vec2 uFocus;
  uniform float uReach;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uDim;
  uniform vec3 uWarm;
  uniform vec3 uAccent;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    float depth = -view.z;
    // Pixels, not tiles: near the camera they stop growing.
    gl_PointSize = clamp(uSize * uScale / depth, 1.0, uMaxSize);

    float pool = uLamp * (1.0 - smoothstep(0.0, 3.4, distance(position.xz, uLampSpot.xz)));
    float ring = 1.0 - smoothstep(0.4, 3.2, distance(position.xz, uFocus));
    // The walked part of the path glows faintly orange.
    float path = (1.0 - smoothstep(0.05, 0.3, abs(position.x)))
      * step(uReach, position.z) * step(position.z, 3.0);
    float fog = 1.0 - smoothstep(uFogNear, uFogFar, depth);

    vColor = uDim + uWarm * pool * 1.4 + uAccent * (ring * 0.45 + path * 0.5);
    vAlpha = (0.13 + 0.07 * aSeed + pool * 0.75 + ring * 0.22 + path * 0.3) * fog;
  }
`;

const pointFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

// Dust floating in the dark, rising slowly; brighter under the lamp.
const dustVertex = /* glsl */ `
  uniform float uScale;
  uniform float uMaxSize;
  uniform float uTime;
  uniform float uHeight;
  uniform float uLamp;
  uniform vec3 uLampSpot;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uDim;
  uniform vec3 uWarm;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    p.y = ${FLOOR.toFixed(2)} + mod(p.y + uTime * (0.04 + aSeed * 0.05), uHeight);
    p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.15;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    float depth = -view.z;
    gl_PointSize = clamp((0.018 + aSeed * 0.02) * uScale / depth, 1.0, uMaxSize);

    float pool = uLamp * (1.0 - smoothstep(0.0, 3.0, distance(p, uLampSpot + vec3(0.0, 1.0, 0.0))));
    float fog = 1.0 - smoothstep(uFogNear, uFogFar, depth);
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 1.7) + aSeed * 30.0);
    vColor = mix(uDim, uWarm, pool);
    vAlpha = (0.12 + pool * 0.8) * twinkle * fog;
  }
`;

// A soft radial glow, drawn additively in front of the lit shade.
function glowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(
    size / 2, size / 2, 0, size / 2, size / 2, size / 2,
  ); // prettier-ignore
  gradient.addColorStop(0, "rgba(255,220,170,0.9)");
  gradient.addColorStop(0.25, "rgba(255,190,120,0.35)");
  gradient.addColorStop(1, "rgba(255,170,90,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Off, a few hesitant flashes, then the lamp warms up to full brightness.
function switchOn(seconds: number) {
  if (seconds < 0) return 0;
  const flashes: [number, number, number][] = [
    [0, 0.07, 0.55],
    [0.07, 0.16, 0.04],
    [0.16, 0.24, 0.8],
    [0.24, 0.36, 0.12],
  ];
  for (const [from, to, level] of flashes) {
    if (seconds >= from && seconds < to) return level;
  }
  return 0.35 + 0.65 * smoothstep(0.36, 1.1, seconds);
}

export class JourneyScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  private readonly timer = new THREE.Timer();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly cardObjects: THREE.Object3D[];
  private readonly yearObjects: THREE.Object3D[];
  private readonly markers: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private readonly connectors: THREE.Group[] = [];
  private readonly walked: THREE.Mesh;
  private readonly floorMaterial: THREE.ShaderMaterial;
  private readonly dustMaterial: THREE.ShaderMaterial;
  private readonly spot: THREE.SpotLight;
  private readonly glow: THREE.Sprite;
  private readonly lampSpot = new THREE.Vector3(-1.5, FLOOR, 2.4);
  private readonly resizeObserver: ResizeObserver;
  private readonly visibility: IntersectionObserver;

  private layout: JourneyLayout = "wide";
  private width = 1;
  private height = 1;
  private worldPerPixel = 0.005;
  private target = -1;
  private progress = -1;
  private active = -1;
  private frame = 0;
  private visible = true;
  private lampMaterials: THREE.MeshStandardMaterial[] = [];
  private lampOnAt: number | null = null;
  private lamp = 0;
  private cameraStyle = "";
  private disposed = false;

  constructor(private readonly options: JourneySceneOptions) {
    const { host, cards, years } = options;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(night);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);

    const count = cards.length;
    const end = -(count - 1) * SPACING;

    // Environment, kept faint: the lamp's brass needs something to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04).texture;
    this.scene.environment = environment;
    this.scene.environmentIntensity = 0.32;
    room.dispose();
    pmrem.dispose();
    this.disposables.push(environment);

    // The far end of the corridor melts into the night.
    this.scene.fog = new THREE.Fog(night, 9, 30);
    this.scene.add(new THREE.HemisphereLight(phosphor, night, 0.06));

    // The lamp's pool of light on the floor.
    this.spot = new THREE.SpotLight(warm, 0, 9, 0.85, 0.9, 1.3);
    this.spot.position.set(-1.9, FLOOR + 2.1, 2.6);
    this.spot.target.position.copy(this.lampSpot);
    this.scene.add(this.spot, this.spot.target);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, -end + 70),
      new THREE.MeshStandardMaterial({
        color: "#141210",
        roughness: 0.92,
        metalness: 0,
        envMapIntensity: 0.05,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, FLOOR - 0.002, (end - 70) / 2 + 20);
    this.scene.add(floor);
    this.track(floor);

    // Floor of pixels.
    const columns: number[] = [];
    const seeds: number[] = [];
    const step = 0.45;
    for (let z = 16; z > end - 40; z -= step) {
      for (let x = -9; x <= 9.001; x += step) {
        columns.push(x, FLOOR, z);
        seeds.push(Math.random());
      }
    }
    const floorGeometry = new THREE.BufferGeometry();
    floorGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(columns, 3),
    );
    floorGeometry.setAttribute(
      "aSeed",
      new THREE.Float32BufferAttribute(seeds, 1),
    );
    this.floorMaterial = new THREE.ShaderMaterial({
      vertexShader: floorVertex,
      fragmentShader: pointFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uScale: { value: 1 },
        uSize: { value: 0.045 },
        uMaxSize: { value: 4 },
        uLamp: { value: 0 },
        uLampSpot: { value: this.lampSpot },
        uFocus: { value: new THREE.Vector2(0, 0) },
        uReach: { value: 3 },
        uFogNear: { value: 7 },
        uFogFar: { value: 34 },
        uDim: { value: phosphor.clone().multiplyScalar(0.6) },
        uWarm: { value: warm },
        uAccent: { value: accent },
      },
    });
    const floorPoints = new THREE.Points(floorGeometry, this.floorMaterial);
    floorPoints.position.y = 0.003;
    floorPoints.frustumCulled = false;
    this.scene.add(floorPoints);
    this.track(floorPoints);

    // Dust.
    const dust: number[] = [];
    const dustSeeds: number[] = [];
    for (let index = 0; index < 420; index += 1) {
      dust.push(
        (Math.random() - 0.5) * 12,
        Math.random() * 4.2,
        16 - Math.random() * (16 - end + 24),
      );
      dustSeeds.push(Math.random());
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(dust, 3),
    );
    dustGeometry.setAttribute(
      "aSeed",
      new THREE.Float32BufferAttribute(dustSeeds, 1),
    );
    this.dustMaterial = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: pointFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uScale: { value: 1 },
        uMaxSize: { value: 3 },
        uTime: { value: 0 },
        uHeight: { value: 4.2 },
        uLamp: { value: 0 },
        uLampSpot: { value: this.lampSpot },
        uFogNear: { value: 5 },
        uFogFar: { value: 26 },
        uDim: { value: phosphor.clone().multiplyScalar(0.7) },
        uWarm: { value: warm },
      },
    });
    const dustPoints = new THREE.Points(dustGeometry, this.dustMaterial);
    dustPoints.frustumCulled = false;
    this.scene.add(dustPoints);
    this.track(dustPoints);

    // The path: dim all along, orange where it has been walked.
    const pathLength = 3 - end + 14;
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(0.035, pathLength),
      new THREE.MeshBasicMaterial({
        color: phosphor,
        transparent: true,
        opacity: 0.22,
      }),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, FLOOR + 0.004, 3 - pathLength / 2);
    this.scene.add(path);
    this.track(path);

    const walkedGeometry = new THREE.PlaneGeometry(0.05, 1);
    walkedGeometry.translate(0, -0.5, 0); // Grows from its start.
    this.walked = new THREE.Mesh(
      walkedGeometry,
      new THREE.MeshBasicMaterial({ color: accent }),
    );
    this.walked.rotation.x = -Math.PI / 2;
    this.walked.position.set(0, FLOOR + 0.006, 3);
    this.scene.add(this.walked);
    this.track(this.walked);

    // One marker per step on the path, and a thin line out to its card.
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: phosphor,
      transparent: true,
      opacity: 0.28,
    });
    this.disposables.push(lineMaterial);
    const horizontal = new THREE.PlaneGeometry(1, 0.012);
    horizontal.translate(0.5, 0, 0);
    const vertical = new THREE.PlaneGeometry(0.012, 1);
    vertical.translate(0, 0.5, 0);
    const markerGeometry = new THREE.PlaneGeometry(0.16, 0.16);
    this.disposables.push(horizontal, vertical, markerGeometry);

    for (let index = 0; index < count; index += 1) {
      const z = -index * SPACING;
      const marker = new THREE.Mesh(
        markerGeometry,
        new THREE.MeshBasicMaterial({ color: phosphor, transparent: true }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(0, FLOOR + 0.008, z);
      this.scene.add(marker);
      this.disposables.push(marker.material);
      this.markers.push(marker);

      const connector = new THREE.Group();
      const floorLine = new THREE.Mesh(horizontal, lineMaterial);
      floorLine.rotation.x = -Math.PI / 2;
      floorLine.position.y = FLOOR + 0.005;
      const riser = new THREE.Mesh(vertical, lineMaterial);
      riser.position.y = FLOOR;
      riser.scale.y = CARD_Y - FLOOR;
      connector.add(floorLine, riser);
      connector.position.z = z - 0.02;
      this.scene.add(connector);
      this.connectors.push(connector);
    }

    // The lamp's light, faked in front of the shade.
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    );
    this.glow.scale.setScalar(2.2);
    this.scene.add(this.glow);
    this.disposables.push(this.glow.material.map!, this.glow.material);

    // HTML objects: their transforms come from these.
    this.cardObjects = cards.map((_, index) => {
      const object = new THREE.Object3D();
      object.position.set(0, CARD_Y, -index * SPACING);
      return object;
    });
    this.yearObjects = years.map(({ index }) => {
      const object = new THREE.Object3D();
      object.position.set(0, FLOOR + 0.01, -index * SPACING + 2.4);
      object.rotation.x = -Math.PI / 2;
      return object;
    });
    for (const card of cards) {
      card.style.position = "absolute";
      card.style.left = "0";
      card.style.top = "0";
    }
    for (const { element } of years) {
      element.style.position = "absolute";
      element.style.left = "0";
      element.style.top = "0";
    }

    void this.loadLamp();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.visibility = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.start();
    });
    this.visibility.observe(host);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.resize();
    this.progress = this.target;
    this.start();
  }

  /**
   * Continuous position: -1 before the first step, `i` on step `i`. The
   * camera eases there, or jumps when `instant`.
   */
  setProgress(value: number, instant = false) {
    this.target = value;
    if (instant) this.progress = value;
    this.start();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.visibility.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const item of this.disposables) item.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    const { camera, cards, years } = this.options;
    camera.style.cssText = "";
    for (const element of [...cards, ...years.map((year) => year.element)]) {
      element.style.cssText = "";
    }
  }

  private track(object: THREE.Mesh | THREE.Points) {
    this.disposables.push(object.geometry);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    this.disposables.push(...materials);
  }

  private onVisibility = () => {
    if (!document.hidden) this.start();
  };

  private start() {
    if (this.disposed || this.frame) return;
    this.timer.update();
    this.frame = requestAnimationFrame(this.tick);
  }

  private async loadLamp() {
    try {
      const { scene: lamp } = await new GLTFLoader().loadAsync(
        "/models/desk-lamp.glb",
      );
      if (this.disposed) return;

      // The model stands on its base, one unit tall. Its shade is the part
      // above 70% of the height: the light comes from under it. Positions
      // are quantized, so they are read through each node's matrix.
      const shade = new THREE.Box3();
      const vertex = new THREE.Vector3();
      lamp.updateMatrixWorld(true);
      lamp.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const position = object.geometry.attributes.position;
        for (let index = 0; index < position.count; index += 1) {
          vertex.fromBufferAttribute(position, index);
          vertex.applyMatrix4(object.matrixWorld);
          if (vertex.y > 0.7) shade.expandByPoint(vertex);
        }
        const material = object.material as THREE.MeshStandardMaterial;
        material.envMapIntensity = 0.9;
        this.lampMaterials.push(material);
      });
      const shadeCenter = shade.getCenter(new THREE.Vector3());

      // Turn the lamp so its shade leans towards the path and the camera.
      const lean = Math.atan2(shadeCenter.x, shadeCenter.z);
      const facing = Math.atan2(0.85, 0.55);
      lamp.rotation.y = facing - lean;
      lamp.scale.setScalar(LAMP_SCALE);
      lamp.position.set(-2.35, FLOOR, 2.9);
      this.scene.add(lamp);
      lamp.updateMatrixWorld(true);

      const light = shadeCenter.clone();
      light.y = shade.min.y;
      lamp.localToWorld(light);
      this.spot.position.copy(light);
      this.lampSpot.set(light.x + 0.35, FLOOR, light.z + 0.2);
      this.spot.target.position.copy(this.lampSpot);
      this.glow.position.copy(light).add(new THREE.Vector3(0, -0.05, 0));

      this.lampOnAt = this.timer.getElapsed() + 0.35;
    } catch {
      // Without the model, the light still comes on.
      this.lampOnAt = this.timer.getElapsed();
    }
    this.options.onReady?.();
    this.start();
  }

  private resize() {
    const { host, view, camera } = this.options;
    this.width = Math.max(1, host.clientWidth);
    this.height = Math.max(1, host.clientHeight);
    const aspect = this.width / this.height;
    this.layout = aspect < 0.95 || this.width < 760 ? "narrow" : "wide";

    this.camera.aspect = aspect;
    this.camera.fov = this.layout === "narrow" ? 54 : 40;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(this.width, this.height, false);

    // At the focus distance, one CSS pixel of a card is one screen pixel.
    const visibleHeight =
      2 * FOCUS * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.worldPerPixel = visibleHeight / this.height;
    const pixels =
      (this.height / visibleHeight) * FOCUS * this.renderer.getPixelRatio();
    const ratio = this.renderer.getPixelRatio();
    this.floorMaterial.uniforms.uScale.value = pixels;
    this.floorMaterial.uniforms.uMaxSize.value = 4.5 * ratio;
    this.dustMaterial.uniforms.uScale.value = pixels;
    this.dustMaterial.uniforms.uMaxSize.value = 3.5 * ratio;

    for (const element of [view, camera]) {
      element.style.width = `${this.width}px`;
      element.style.height = `${this.height}px`;
    }

    const offset = this.sideOffset();
    this.cardObjects.forEach((object, index) => {
      const side = this.side(index);
      object.position.x = side * offset;
      object.position.y = this.layout === "narrow" ? CARD_Y + 0.35 : CARD_Y;
      object.rotation.y = -side * 0.2;
      object.scale.setScalar(this.worldPerPixel);
      object.updateMatrixWorld();

      const connector = this.connectors[index];
      const [floorLine, riser] = connector.children;
      floorLine.scale.x = side * offset || 0.0001;
      riser.position.x = side * offset;
      riser.scale.y = object.position.y - FLOOR;
    });
    this.yearObjects.forEach((object, order) => {
      const { index } = this.options.years[order];
      const side = this.side(index);
      object.position.x =
        this.layout === "narrow" ? -0.9 : -side * (offset * 0.7);
      object.scale.setScalar(this.worldPerPixel * 1.4);
      object.updateMatrixWorld();
    });

    this.cameraStyle = "";
    this.start();
  }

  private side(index: number): -1 | 0 | 1 {
    if (this.layout === "narrow") return 0;
    return index % 2 === 0 ? 1 : -1;
  }

  private sideOffset() {
    return this.layout === "narrow" ? 0 : 1.75;
  }

  private tick = () => {
    this.frame = 0;
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.1);
    const time = this.timer.getElapsed();

    const ease = 1 - Math.exp(-delta * 7);
    this.progress += (this.target - this.progress) * ease;
    if (Math.abs(this.target - this.progress) < 0.0005) {
      this.progress = this.target;
    }

    this.lamp = this.lampOnAt === null ? 0 : switchOn(time - this.lampOnAt);
    this.updateCamera();
    this.updateWorld(time);
    this.renderer.render(this.scene, this.camera);
    this.updateHtml();

    const settled = this.progress === this.target && this.lamp >= 1;
    // Dust and the pulse of ongoing steps keep the scene alive on screen.
    if (this.visible && !document.hidden) {
      this.frame = requestAnimationFrame(this.tick);
    } else if (!settled) {
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private sideAt(position: number) {
    if (position <= 0) return this.side(0) * smoothstep(-1, 0, position);
    const from = Math.floor(position);
    const to = Math.min(from + 1, this.cardObjects.length - 1);
    return THREE.MathUtils.lerp(
      this.side(from),
      this.side(to),
      smoothstep(0.15, 0.85, position - from),
    );
  }

  private updateCamera() {
    const p = this.progress;
    const intro = clamp(-p, 0, 1);
    const offset = this.sideOffset();
    const sway = this.sideAt(p) * offset;
    const z = -p * SPACING + FOCUS;
    const narrow = this.layout === "narrow";

    const position = new THREE.Vector3(
      sway * 0.4 + intro * (narrow ? 0.4 : 1.1),
      0.55 + intro * 0.55 + (narrow ? 0.25 : 0),
      z + intro * 1.5,
    );
    const look = new THREE.Vector3(
      sway * 0.62,
      narrow ? 0.25 : 0.05,
      z - FOCUS,
    );
    // Before the first step, the eye goes to the lamp.
    const lampTarget = new THREE.Vector3(-2.1, 0.4, 2.9);
    look.lerp(lampTarget, intro * (narrow ? 0.35 : 0.5));

    this.camera.position.copy(position);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();
  }

  private updateWorld(time: number) {
    const p = this.progress;
    const focusZ = -clamp(p, 0, this.cardObjects.length - 1) * SPACING;
    const reach = -Math.max(p, -0.4) * SPACING;

    const floor = this.floorMaterial.uniforms;
    floor.uLamp.value = this.lamp;
    floor.uFocus.value.set(this.sideAt(p) * this.sideOffset() * 0.6, focusZ);
    floor.uReach.value = reach;
    floor.uFogNear.value = 6;
    floor.uFogFar.value = 30;

    const dust = this.dustMaterial.uniforms;
    dust.uTime.value = time;
    dust.uLamp.value = this.lamp;

    this.walked.scale.y = Math.max(0.0001, 3 - reach);

    this.spot.intensity = this.lamp * 26;
    this.glow.material.opacity = this.lamp * 0.55;
    for (const material of this.lampMaterials) {
      material.emissiveIntensity = this.lamp * 2.2;
    }

    this.markers.forEach((marker, index) => {
      const reached = clamp((p - index + 0.5) * 2, 0, 1);
      marker.material.color.copy(phosphor).lerp(accent, reached);
      const pulse = this.options.ongoing[index]
        ? 1 + 0.25 * Math.sin(time * 3.2 + index)
        : 1;
      marker.scale.setScalar(pulse * (1 + reached * 0.3));
      marker.material.opacity = 0.45 + reached * 0.55;
    });
  }

  private updateHtml() {
    const fov = this.camera.projectionMatrix.elements[5] * (this.height / 2);
    const cameraStyle =
      `perspective(${fov}px) translateZ(${fov}px)` +
      cameraCss(this.camera.matrixWorldInverse) +
      `translate(${this.width / 2}px,${this.height / 2}px)`;
    if (cameraStyle !== this.cameraStyle) {
      this.options.camera.style.transform = cameraStyle;
      this.cameraStyle = cameraStyle;
    }

    const cameraZ = this.camera.position.z;
    const place = (
      element: HTMLElement,
      object: THREE.Object3D,
      focus: number,
      sharpness = 1,
    ) => {
      const depth = cameraZ - object.position.z;
      const offset = depth - focus;
      // Ahead, steps wait in the haze; once read, they fly past, blurred.
      const blur =
        offset > 0 ? Math.min(9, offset * 0.8) : Math.min(16, -offset * 3.4);
      const opacity =
        offset > 0
          ? (1 - smoothstep(SPACING * 2, SPACING * 3.2, offset)) *
            THREE.MathUtils.lerp(1, 0.6, smoothstep(0, SPACING, offset))
          : 1 - smoothstep(0.6, focus - 1.6, -offset);
      if (opacity < 0.01 || depth < 0.8) {
        element.style.visibility = "hidden";
        return;
      }
      // The blur is applied before perspective: scale it back to the screen.
      const local = (blur * sharpness * depth) / FOCUS;
      element.style.visibility = "visible";
      element.style.opacity = opacity.toFixed(3);
      element.style.filter = local > 0.25 ? `blur(${local.toFixed(2)}px)` : "";
      element.style.transform = objectCss(object.matrixWorld);
      element.style.pointerEvents =
        Math.abs(offset) < SPACING * 0.45 ? "auto" : "none";
      element.style.setProperty(
        "--focus",
        (1 - smoothstep(0, SPACING * 0.5, Math.abs(offset))).toFixed(3),
      );
    };

    this.options.cards.forEach((card, index) =>
      place(card, this.cardObjects[index], FOCUS),
    );
    this.options.years.forEach(({ element }, order) =>
      place(element, this.yearObjects[order], FOCUS + 1.2, 0.6),
    );

    const active = clamp(
      Math.round(this.progress),
      0,
      this.cardObjects.length - 1,
    );
    if (active !== this.active) {
      this.active = active;
      this.options.onActive(active);
    }
  }
}
