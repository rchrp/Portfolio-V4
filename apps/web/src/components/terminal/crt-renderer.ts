import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
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
// the classic line-then-open power cycle.
const screenFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uPower;
  uniform float uGlitch;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 sampleScreen(vec2 uv, vec2 offset) {
    return vec3(
      texture2D(uMap, uv + offset).r,
      texture2D(uMap, uv).g,
      texture2D(uMap, uv - offset).b
    );
  }

  void main() {
    vec2 centered = vUv * 2.0 - 1.0;
    // Fit the picture inside the bezel, then bulge it like curved glass.
    vec2 curved = centered * 1.02;
    curved *= 1.0 + 0.055 * dot(curved, curved);
    vec2 uv = curved * 0.5 + 0.5;

    float openX = smoothstep(0.0, 0.32, uPower);
    float openY = max(smoothstep(0.28, 1.0, uPower), 0.004);
    vec2 powered = (uv - 0.5) / vec2(max(openX, 0.001), openY) + 0.5;

    float frame = floor(uTime * 24.0);
    float band = step(0.55, hash(vec2(floor(powered.y * 18.0), frame)));
    powered.x += (hash(vec2(floor(powered.y * 160.0), frame)) - 0.5) * 0.05 * uGlitch * band;
    powered.y += uGlitch * 0.015 * sin(uTime * 61.0);

    vec2 fromCenter = powered - 0.5;
    vec2 aberration = fromCenter * (0.0035 + dot(fromCenter, fromCenter) * 0.012 + uGlitch * 0.02)
      + vec2(0.0007, 0.0);
    vec3 color = sampleScreen(powered, aberration);

    // Cheap phosphor bleed: a few wide taps around the pixel.
    vec3 bleed = sampleScreen(powered + vec2(0.004, 0.0), aberration)
      + sampleScreen(powered - vec2(0.004, 0.0), aberration)
      + sampleScreen(powered + vec2(0.0, 0.005), aberration)
      + sampleScreen(powered - vec2(0.0, 0.005), aberration);
    color += bleed * 0.06;

    float scanline = 0.84 + 0.16 * sin(powered.y * 384.0 * 3.14159);
    float grille = mod(gl_FragCoord.x, 3.0);
    vec3 mask = mix(vec3(1.0), vec3(grille < 1.0 ? 1.0 : 0.82, grille >= 1.0 && grille < 2.0 ? 1.0 : 0.82, grille >= 2.0 ? 1.0 : 0.82), 0.35);
    color *= scanline * mask;

    float grain = hash(powered * vec2(1024.0, 768.0) + fract(uTime) * 91.0);
    color = mix(color, vec3(grain), 0.035 + uGlitch * 0.4);
    color *= 0.985 + 0.015 * sin(uTime * 110.0);

    vec2 edge = smoothstep(vec2(0.0), vec2(0.012, 0.016), powered)
      * smoothstep(vec2(0.0), vec2(0.012, 0.016), 1.0 - powered);
    float inside = edge.x * edge.y;
    float vignette = clamp(1.0 - dot(centered * vec2(0.55, 0.65), centered * vec2(0.55, 0.65)) * 0.9, 0.0, 1.0);
    float line = (1.0 - smoothstep(0.0, 0.25, openY)) * exp(-abs(uv.y - 0.5) * 260.0) * openX
      * step(abs(uv.x - 0.5), 0.5 * openX);
    float visible = smoothstep(0.0, 0.08, uPower);

    vec3 glass = vec3(0.016, 0.019, 0.018);
    vec3 picture = color * inside * vignette * 1.22 * visible + vec3(1.0, 0.97, 0.92) * line * 2.4;

    // Glass reflections: a soft window highlight and darker edges.
    float highlight = smoothstep(0.5, 0.0, length((vUv - vec2(0.24, 0.8)) * vec2(1.0, 1.5))) * 0.05;
    float rim = smoothstep(0.55, 1.0, length(centered * vec2(0.92, 0.98))) * 0.03;
    gl_FragColor = vec4(glass + picture + highlight + rim, 1.0);
    #include <colorspace_fragment>
  }
`;

function roundedRectShape(
  width: number,
  height: number,
  radius: number,
  offsetY = 0,
) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2 + offsetY;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

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

function labelTexture(font: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f15a24";
  context.fillRect(8, 30, 36, 36);
  context.fillStyle = "#8f8676";
  context.font = `600 46px ${font}`;
  context.textBaseline = "middle";
  context.fillText("RC—84", 64, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const damp = (current: number, target: number, lambda: number, delta: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * delta));

const ease = (value: number) => value * value * (3 - 2 * value);

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
  private readonly led: THREE.MeshStandardMaterial;
  private readonly lookTarget = new THREE.Vector3(0, 0.62, 0.2);
  private readonly cameraPosition = new THREE.Vector3(-0.9, 2.6, 8.5);
  private readonly cameraTarget = new THREE.Vector3();
  private readonly lightColor = new THREE.Color(1, 1, 1);
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
      },
      vertexShader: screenVertex,
      fragmentShader: screenFragment,
      toneMapped: false,
    });

    this.screenLight = new THREE.RectAreaLight(0xffffff, 0, 1.06, 0.78);
    this.led = new THREE.MeshStandardMaterial({
      color: 0x2a1a12,
      emissive: 0xf15a24,
      emissiveIntensity: 0,
    });
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 1.9),
      new THREE.MeshBasicMaterial({
        map: radialTexture("rgba(255,255,255,0.9)", "rgba(255,255,255,0)"),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );

    this.buildScene(options.sans);
    this.disposables.push(this.screenTexture, this.screenMaterial, this.led);
  }

  private buildScene(labelFont: string) {
    const plastic = new THREE.MeshPhysicalMaterial({
      color: 0xd8cfbe,
      roughness: 0.52,
      clearcoat: 0.25,
      clearcoatRoughness: 0.6,
    });
    const plasticBack = new THREE.MeshPhysicalMaterial({
      color: 0xcfc5b2,
      roughness: 0.6,
      flatShading: true,
    });
    const darkPlastic = new THREE.MeshStandardMaterial({
      color: 0x1b1916,
      roughness: 0.7,
    });
    const keyMaterial = new THREE.MeshStandardMaterial({
      color: 0xe3dbcc,
      roughness: 0.45,
    });
    this.disposables.push(plastic, plasticBack, darkPlastic, keyMaterial);

    const monitor = new THREE.Group();
    this.scene.add(monitor);

    // Front shell: a rounded slab with a rectangular tunnel for the tube.
    const housingDepth = 0.32;
    const shell = roundedRectShape(1.5, 1.3, 0.1);
    shell.holes.push(roundedRectShape(1.14, 0.86, 0.05, 0.08));
    const housingGeometry = new THREE.ExtrudeGeometry(shell, {
      depth: housingDepth,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.03,
      bevelSegments: 5,
      curveSegments: 16,
    });
    housingGeometry.translate(0, 0, -housingDepth);
    const housing = new THREE.Mesh(housingGeometry, plastic);
    housing.position.y = 0.76;
    housing.castShadow = true;
    housing.receiveShadow = true;
    monitor.add(housing);

    // Tapered tube enclosure behind the shell.
    const backGeometry = new THREE.CylinderGeometry(0.36, 0.74, 0.78, 4, 1);
    backGeometry.rotateY(Math.PI / 4);
    backGeometry.rotateX(-Math.PI / 2);
    backGeometry.scale(1.3, 1.05, 1);
    backGeometry.translate(0, -0.03, -housingDepth - 0.39);
    const back = new THREE.Mesh(backGeometry, plasticBack);
    back.position.y = 0.76;
    back.castShadow = true;
    monitor.add(back);

    // Curved glass of the tube.
    const screenGeometry = new THREE.PlaneGeometry(1.16, 0.88, 48, 36);
    const positions = screenGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index) / 0.58;
      const y = positions.getY(index) / 0.44;
      positions.setZ(index, 0.06 * (1 - x * x * 0.55) * (1 - y * y * 0.55));
    }
    screenGeometry.computeVertexNormals();
    const screen = new THREE.Mesh(screenGeometry, this.screenMaterial);
    screen.position.set(0, 0.84, -0.13);
    monitor.add(screen);
    this.disposables.push(housingGeometry, backGeometry, screenGeometry);

    this.screenLight.position.set(0, 0.84, 0.02);
    this.screenLight.lookAt(0, 0.84, 5);
    monitor.add(this.screenLight);

    this.glow.position.set(0, 0.84, 0.06);
    monitor.add(this.glow);
    this.disposables.push(
      this.glow.geometry,
      this.glow.material,
      this.glow.material.map!,
    );

    // Chin details: badge, floppy slot and power LED.
    const badgeTexture = labelTexture(labelFont);
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.049),
      new THREE.MeshStandardMaterial({
        map: badgeTexture,
        transparent: true,
        roughness: 0.6,
      }),
    );
    badge.position.set(-0.48, 0.3, 0.037);
    monitor.add(badge);
    const slot = new THREE.Mesh(
      new RoundedBoxGeometry(0.38, 0.034, 0.02, 2, 0.008),
      darkPlastic,
    );
    slot.position.set(0.34, 0.3, 0.03);
    monitor.add(slot);
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.012, 0.01),
      this.led,
    );
    led.position.set(0.6, 0.22, 0.036);
    monitor.add(led);
    this.disposables.push(
      badge.geometry,
      badge.material as THREE.Material,
      badgeTexture,
      slot.geometry,
      led.geometry,
    );

    const stand = new THREE.Mesh(
      new RoundedBoxGeometry(1.0, 0.1, 0.95, 3, 0.03),
      plastic,
    );
    stand.position.set(0, 0.05, -0.38);
    stand.castShadow = true;
    stand.receiveShadow = true;
    monitor.add(stand);
    this.disposables.push(stand.geometry);

    // Keyboard: one base and instanced keycaps.
    const keyboard = new THREE.Group();
    keyboard.position.set(0, 0, 0.98);
    keyboard.rotation.x = 0.045;
    this.scene.add(keyboard);
    const keyboardBase = new THREE.Mesh(
      new RoundedBoxGeometry(1.34, 0.06, 0.46, 3, 0.02),
      plastic,
    );
    keyboardBase.position.y = 0.03;
    keyboardBase.castShadow = true;
    keyboardBase.receiveShadow = true;
    keyboard.add(keyboardBase);
    const keyGeometry = new RoundedBoxGeometry(0.066, 0.032, 0.066, 2, 0.012);
    const columns = 15;
    const rows = 4;
    const keys = new THREE.InstancedMesh(
      keyGeometry,
      keyMaterial,
      columns * rows,
    );
    const matrix = new THREE.Matrix4();
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        matrix.makeTranslation(
          -0.56 + column * 0.08 + (row % 2) * 0.02,
          0.072,
          -0.16 + row * 0.08,
        );
        keys.setMatrixAt(row * columns + column, matrix);
      }
    }
    keys.castShadow = true;
    keys.receiveShadow = true;
    keyboard.add(keys);
    const spacebar = new THREE.Mesh(
      new RoundedBoxGeometry(0.5, 0.032, 0.066, 2, 0.012),
      keyMaterial,
    );
    spacebar.position.set(0, 0.072, 0.16);
    spacebar.castShadow = true;
    keyboard.add(spacebar);
    this.disposables.push(
      keyboardBase.geometry,
      keyGeometry,
      spacebar.geometry,
      keys,
    );

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
    if (this.reducedMotion) {
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
    for (const item of this.disposables) item.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  private applyViewOffset() {
    // Shift the projection, not the scene, to leave room for the text column.
    const shiftX = this.layout === "side" ? -this.width * 0.13 : 0;
    const shiftY = this.layout === "stacked" ? this.height * 0.15 : 0;
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
    if (this.running && !this.frame) {
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
    if (this.running && (!settled || this.power > 0.001)) {
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private update(now: number, delta: number) {
    const { intro, project, outro } = this.scroll;
    const instant = this.reducedMotion;

    // Camera path: approach, slow orbit across projects, then pull back.
    const approach = ease(intro);
    const leave = ease(outro);
    const sway = Math.sin(project * 1.15) * 0.32;
    // On narrow screens, back off until the monitor fits the width.
    const halfWidth =
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) *
      this.camera.aspect;
    const distance =
      this.layout === "stacked" ? Math.max(6.6, 1.12 / halfWidth) : 5.65;
    this.cameraTarget.set(
      THREE.MathUtils.lerp(-1.4, sway, approach) + leave * 0.6,
      THREE.MathUtils.lerp(
        2.9,
        1.55 + Math.cos(project * 0.9) * 0.08,
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
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.lookTarget);

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
    this.glow.material.opacity = lit * 0.075 * flicker;
    this.led.emissiveIntensity = THREE.MathUtils.lerp(0.4, 2.6, lit);

    const uniforms = this.screenMaterial.uniforms;
    uniforms.uTime.value = now / 1000;
    uniforms.uPower.value = this.power;
    uniforms.uGlitch.value = this.glitch;

    return (
      this.cameraPosition.distanceToSquared(this.cameraTarget) < 1e-6 &&
      this.power === this.powerTarget &&
      this.glitch < 0.002
    );
  }
}
