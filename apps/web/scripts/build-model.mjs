// Prepares the monitor that follows the visitor down the home page:
//
//   pnpm --filter web model
//
// Source: assets/models/monitor_iv.glb — "Monitor IV" by re1monsen
// (https://sketchfab.com/3d-models/monitor-iv-c22e137779e7439b8825bf734de9a471),
// CC BY 4.0. The output is an adapted version, credited in the site's footer.
//
// - removes Sketchfab's ground plane,
// - bakes the nested node transforms: base centred on the origin, standing
//   on y = 0, 1.7 units wide, glass facing +z,
// - gives the curved glass, a mesh of its own, a "Screen" material. It keeps
//   the atlas coordinates of its base color and of the smudges held by the
//   roughness channel, and gains a second set (TEXCOORD_1) spanning 0–1 over
//   the glass, on which the site draws the screen,
// - keeps every face, since the monitor turns around as it moves, simplifies
//   the meshes, then quantizes their attributes (KHR_mesh_quantization, read
//   by three.js without a decoder),
// - re-encodes textures as WebP: near-lossless for the normal, roughness and
//   occlusion maps, which hold the knurling of the bezel.
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  flatten,
  getBounds,
  prune,
  quantize,
  simplify,
  textureCompress,
  transformMesh,
  weld,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(root, "assets/models/monitor_iv.glb");
const output = path.join(root, "public/models/monitor.glb");

const glassMeshName = "monitor.003_low_monitor_0";
const modelWidth = 1.7;
// Largest deviation allowed by the simplifier, relative to each mesh's size.
const simplifyError = 0.0005;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const scene = document.getRoot().getDefaultScene();

for (const node of document.getRoot().listNodes()) {
  if (/^ground_low/.test(node.getName())) node.dispose();
}
await document.transform(flatten(), prune());

for (const node of document.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  transformMesh(mesh, node.getWorldMatrix());
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}

const { min, max } = getBounds(scene);
const scale = modelWidth / (max[0] - min[0]);
// Column-major: uniform scale, then the base's centre moved to the origin.
// prettier-ignore
const placement = [
  scale, 0, 0, 0,
  0, scale, 0, 0,
  0, 0, scale, 0,
  (-(min[0] + max[0]) / 2) * scale, -min[1] * scale, (-(min[2] + max[2]) / 2) * scale, 1,
];
for (const mesh of document.getRoot().listMeshes()) {
  transformMesh(mesh, placement);
}

const glass = document
  .getRoot()
  .listMeshes()
  .find((mesh) => mesh.getName() === glassMeshName)
  ?.listPrimitives()[0];
if (!glass) throw new Error("Screen glass not found in the model.");

const position = glass.getAttribute("POSITION");
const normal = glass.getAttribute("NORMAL");
const point = (vertex) => position.getElement(vertex, []);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a) => a.map((value) => value / Math.hypot(...a));

// The glass bulges: it faces the average of its normals.
const normalSum = [0, 0, 0];
for (let vertex = 0; vertex < normal.getCount(); vertex += 1) {
  normal.getElement(vertex, []).forEach((value, axis) => {
    normalSum[axis] += value;
  });
}
const right = [1, 0, 0];
const facing = normalize(normalSum);
const up = normalize(cross(facing, right));

const vertexCount = position.getCount();
const spans = Array.from({ length: vertexCount }, (_, vertex) => vertex).reduce(
  (box, vertex) => {
    const across = dot(point(vertex), right);
    const along = dot(point(vertex), up);
    return {
      minX: Math.min(box.minX, across),
      maxX: Math.max(box.maxX, across),
      minY: Math.min(box.minY, along),
      maxY: Math.max(box.maxY, along),
    };
  },
  { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
);

// Upright over the glass, seen from the front: v grows upwards, like the
// canvas drawn on it.
const screenCoordinates = new Float32Array(vertexCount * 2);
for (let vertex = 0; vertex < vertexCount; vertex += 1) {
  const p = point(vertex);
  screenCoordinates.set(
    [
      (dot(p, right) - spans.minX) / (spans.maxX - spans.minX),
      (dot(p, up) - spans.minY) / (spans.maxY - spans.minY),
    ],
    vertex * 2,
  );
}
glass.setAttribute(
  "TEXCOORD_1",
  document
    .createAccessor()
    .setType("VEC2")
    .setArray(screenCoordinates)
    .setBuffer(position.getBuffer()),
);

// The whole monitor shares one material: the glass gets its own, without the
// emissive map, where the site shows its picture instead.
const bodyMaterial = glass.getMaterial();
glass.setMaterial(
  document
    .createMaterial("Screen")
    .setBaseColorTexture(bodyMaterial.getBaseColorTexture())
    .setMetallicRoughnessTexture(bodyMaterial.getMetallicRoughnessTexture())
    .setNormalTexture(bodyMaterial.getNormalTexture())
    .setMetallicFactor(0)
    .setRoughnessFactor(1),
);

// Without tangents, three.js derives them from screen-space derivatives.
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    primitive.setAttribute("TANGENT", null);
  }
}

const countTriangles = () =>
  document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce(
      (total, primitive) => total + primitive.getIndices().getCount() / 3,
      0,
    );
const sourceTriangles = countTriangles();

await document.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: simplifyError }),
  // The glass's second UV set has no texture yet: keep it.
  prune({ keepAttributes: true }),
  quantize(),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    slots: /^baseColorTexture$/,
    resize: [1024, 1024],
    quality: 95,
  }),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    slots: /^emissiveTexture$/,
    resize: [1024, 1024],
    quality: 90,
  }),
  // The bezel's knurling and the glass's smudges live in these maps: lossy
  // compression blurs them.
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    slots: /^(normalTexture|metallicRoughnessTexture|occlusionTexture)$/,
    resize: [1024, 1024],
    nearLossless: true,
    quality: 60,
  }),
);

await io.write(output, document);
const { size } = await stat(output);
console.log(
  `✓ ${path.relative(root, output)} · ${sourceTriangles} → ${countTriangles()} triangles · ${(size / 1024).toFixed(0)} KB · glass ${(spans.maxX - spans.minX).toFixed(3)} × ${(spans.maxY - spans.minY).toFixed(3)}`,
);
