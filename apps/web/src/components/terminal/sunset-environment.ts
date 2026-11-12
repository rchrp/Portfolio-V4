import * as THREE from "three";

// Distance and size of the window in the environment scene: about 21° by 16°
// seen from the monitor, so its reflection covers part of the glass.
const windowDistance = 9;
const windowWidth = 3.4;
const windowHeight = 2.6;
// Radiance of the sky behind the window, well above the room's.
const skyIntensity = 5;
// Walls and soft ceiling light of the room, seen by each part: dim for the
// glass, where the window must stand out; lighter for the body, whose metal
// only shows what it reflects.
const rooms = {
  glass: { walls: 0x2e241c, ceiling: 1.6 },
  body: { walls: 0x7a6858, ceiling: 4 },
};
// Resolution of the prefiltered map, fine enough for the window's bars.
const environmentSize = 512;

// Deterministic, so the skyline is the same on every visit.
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

// A sunset seen through a four-pane window: violet sky, orange horizon, the
// sun low over a dark skyline, and the dark frame and bars that block it.
function sunsetWindowTexture() {
  const width = 1024;
  const height = 768;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable.");

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#1c1f45");
  sky.addColorStop(0.38, "#5a3a78");
  sky.addColorStop(0.62, "#d0566a");
  sky.addColorStop(0.8, "#ff8c42");
  sky.addColorStop(0.92, "#ffc477");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const sun = context.createRadialGradient(640, 660, 0, 640, 660, 280);
  sun.addColorStop(0, "rgba(255, 246, 220, 1)");
  sun.addColorStop(0.12, "rgba(255, 222, 150, 0.95)");
  sun.addColorStop(0.4, "rgba(255, 150, 80, 0.35)");
  sun.addColorStop(1, "rgba(255, 120, 60, 0)");
  context.fillStyle = sun;
  context.fillRect(0, 0, width, height);

  const random = seededRandom(7);
  context.fillStyle = "#140c12";
  for (let x = 0; x < width;) {
    const block = 40 + random() * 90;
    const rise = 30 + random() * 120;
    context.fillRect(x, height - rise, block + 1, rise);
    x += block;
  }

  const frame = 64;
  const bar = 52;
  context.fillStyle = "#0a0706";
  context.fillRect(0, 0, width, frame);
  context.fillRect(0, height - frame, width, frame);
  context.fillRect(0, 0, frame, height);
  context.fillRect(width - frame, 0, frame, height);
  context.fillRect(width / 2 - bar / 2, 0, bar, height);
  context.fillRect(0, height * 0.42 - bar / 2, width, bar);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Prefiltered environments of the monitor, both with a window behind the
 * viewer and the sun setting behind it:
 * - `glass`: a dim room, so that the window's sharp reflection brings out
 *   the glass's scratches and cloudiness,
 * - `body`: the same room, lighter, for the metal of the body to have
 *   something to reflect everywhere.
 *
 * `towards` is the window's direction seen from the monitor, `up` its upright.
 */
export function createSunsetEnvironments(
  renderer: THREE.WebGLRenderer,
  towards: THREE.Vector3,
  up: THREE.Vector3,
) {
  const scene = new THREE.Scene();

  const roomGeometry = new THREE.BoxGeometry(24, 14, 24);
  const roomMaterial = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  const room = new THREE.Mesh(roomGeometry, roomMaterial);
  room.position.y = 3;
  scene.add(room);

  const ceilingGeometry = new THREE.PlaneGeometry(7, 5);
  const ceilingMaterial = new THREE.MeshBasicMaterial();
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
  ceiling.position.set(0, 9.9, 1);
  ceiling.rotation.x = Math.PI / 2;
  scene.add(ceiling);

  const sky = sunsetWindowTexture();
  const windowGeometry = new THREE.PlaneGeometry(windowWidth, windowHeight);
  const windowMaterial = new THREE.MeshBasicMaterial({
    map: sky,
    color: new THREE.Color(skyIntensity, skyIntensity, skyIntensity),
  });
  const pane = new THREE.Mesh(windowGeometry, windowMaterial);
  pane.position.copy(towards).normalize().multiplyScalar(windowDistance);
  pane.up.copy(up);
  pane.lookAt(0, 0, 0);
  scene.add(pane);

  const light = (setting: (typeof rooms)[keyof typeof rooms]) => {
    roomMaterial.color.set(setting.walls);
    ceilingMaterial.color.setRGB(1, 0.93, 0.84).multiplyScalar(setting.ceiling);
  };
  const generator = new THREE.PMREMGenerator(renderer);
  light(rooms.glass);
  const glass = generator.fromScene(scene, 0.005, 0.1, 100, {
    size: environmentSize,
  }).texture;
  light(rooms.body);
  const body = generator.fromScene(scene, 0.04).texture;
  generator.dispose();
  for (const item of [
    roomGeometry,
    roomMaterial,
    ceilingGeometry,
    ceilingMaterial,
    sky,
    windowGeometry,
    windowMaterial,
  ]) {
    item.dispose();
  }
  return { glass, body };
}
