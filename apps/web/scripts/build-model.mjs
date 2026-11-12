// Prepares the monitor of the projects section for the web:
//
//   pnpm --filter web model
//
// Source: assets/models/monitor_iii.glb — "Monitor III" by re1monsen
// (https://sketchfab.com/3d-models/monitor-iii-fb119750ac4f4b1e89b4be7c870b4eb2),
// CC BY 4.0. The output is an adapted version, credited in the site's footer.
//
// - removes Sketchfab's ground plane and the cable trailing on the floor,
// - bakes the nested node transforms: base centred on the origin, standing
//   on y = 0, 1.7 units wide, glass facing +z,
// - splits the glass out of the bezel into its own "Screen" primitive. It
//   keeps the atlas coordinates of its cloudy base color and of the scratches
//   held by the roughness channel, and gains a second set (TEXCOORD_1)
//   spanning 0–1 over the glass, on which the site draws the projects,
// - drops the faces of the rear half turned towards the back, which the
//   camera never sees, simplifies the meshes, mostly flat panels, then
//   quantizes their attributes (KHR_mesh_quantization, read by three.js
//   without a decoder),
// - resizes textures and re-encodes them as WebP.
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
const input = path.join(root, "assets/models/monitor_iii.glb");
const output = path.join(root, "public/models/monitor.glb");

// Glass area of the texture atlas, in texture coordinates.
const glassArea = { minU: 0, maxU: 0.575, minV: 0.375, maxV: 0.775 };
const modelWidth = 1.7;
// Largest deviation allowed by the simplifier, relative to each mesh's size.
const simplifyError = 0.0005;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const scene = document.getRoot().getDefaultScene();

for (const node of document.getRoot().listNodes()) {
  if (/^(g__low|monitor\.009_low)/.test(node.getName())) node.dispose();
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

// The glass is the primitive with the most triangles in the glass area.
let split = null;
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const indices = primitive.getIndices();
    const uv = primitive.getAttribute("TEXCOORD_0");
    if (!indices || !uv) continue;
    const inArea = (vertex) => {
      const [u, v] = uv.getElement(vertex, []);
      return (
        u > glassArea.minU &&
        u < glassArea.maxU &&
        v > glassArea.minV &&
        v < glassArea.maxV
      );
    };
    const glass = [];
    const rest = [];
    for (let index = 0; index < indices.getCount(); index += 3) {
      const triangle = [0, 1, 2].map((corner) =>
        indices.getScalar(index + corner),
      );
      (triangle.every(inArea) ? glass : rest).push(...triangle);
    }
    if (!split || glass.length > split.glass.length) {
      split = { primitive, glass, rest };
    }
  }
}
if (!split || split.glass.length === 0) {
  throw new Error("Screen glass not found in the model.");
}

const { primitive: bezel, glass, rest } = split;
const position = bezel.getAttribute("POSITION");
const point = (vertex) => position.getElement(vertex, []);
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a) => a.map((value) => value / Math.hypot(...a));

// The glass is flat and leans back: its axes come from its triangles.
const faceSum = [0, 0, 0];
for (let index = 0; index < glass.length; index += 3) {
  const [a, b, c] = glass.slice(index, index + 3).map(point);
  cross(subtract(b, a), subtract(c, a)).forEach((value, axis) => {
    faceSum[axis] += value;
  });
}
const right = [1, 0, 0];
const facing = normalize(faceSum).map((value) =>
  faceSum[2] < 0 ? -value : value,
);
const up = normalize(cross(facing, right));

const vertices = [...new Set(glass)];
const order = new Map(vertices.map((vertex, rank) => [vertex, rank]));
const spans = vertices.reduce(
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

const indexArray = (values, vertexCount) =>
  vertexCount > 65535 ? new Uint32Array(values) : new Uint16Array(values);
const accessor = (type, array, buffer) =>
  document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const copy = (semantic) => {
  const source = bezel.getAttribute(semantic);
  const size = source.getElementSize();
  const array = new Float32Array(vertices.length * size);
  vertices.forEach((vertex, rank) =>
    array.set(source.getElement(vertex, []), rank * size),
  );
  return accessor(source.getType(), array, source.getBuffer());
};

// Upright over the glass: v grows upwards, like the canvas drawn on it.
const screenCoordinates = new Float32Array(vertices.length * 2);
vertices.forEach((vertex, rank) => {
  const p = point(vertex);
  screenCoordinates.set(
    [
      (dot(p, right) - spans.minX) / (spans.maxX - spans.minX),
      (dot(p, up) - spans.minY) / (spans.maxY - spans.minY),
    ],
    rank * 2,
  );
});

const bodyMaterial = bezel.getMaterial();
const screenMaterial = document
  .createMaterial("Screen")
  .setBaseColorTexture(bodyMaterial.getBaseColorTexture())
  .setMetallicRoughnessTexture(bodyMaterial.getMetallicRoughnessTexture())
  .setMetallicFactor(0)
  .setRoughnessFactor(1);
const buffer = position.getBuffer();
const screen = document
  .createPrimitive()
  .setMaterial(screenMaterial)
  .setAttribute("POSITION", copy("POSITION"))
  .setAttribute("NORMAL", copy("NORMAL"))
  .setAttribute("TEXCOORD_0", copy("TEXCOORD_0"))
  .setAttribute("TEXCOORD_1", accessor("VEC2", screenCoordinates, buffer))
  .setIndices(
    accessor(
      "SCALAR",
      indexArray(
        glass.map((vertex) => order.get(vertex)),
        vertices.length,
      ),
      buffer,
    ),
  );
const bezelIndices = bezel.getIndices();
bezel.setIndices(
  accessor("SCALAR", indexArray(rest, position.getCount()), buffer),
);
bezelIndices.dispose();
const bezelMesh = document
  .getRoot()
  .listMeshes()
  .find((mesh) => mesh.listPrimitives().includes(bezel));
bezelMesh.addPrimitive(screen);

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

// The camera stays in front of the monitor, at most about 40° to the side
// and 45° above it: the faces of its rear half turned more than ~53°
// towards the back (back panel, far side of the inner parts) never face it,
// and are dropped. The vertex normals tell where a face looks, whatever its
// winding.
const hiddenFacing = -0.8;
let rearTriangles = 0;
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    if (primitive === screen) continue;
    const indices = primitive.getIndices();
    const points = primitive.getAttribute("POSITION");
    const normals = primitive.getAttribute("NORMAL");
    const kept = [];
    for (let index = 0; index < indices.getCount(); index += 3) {
      const triangle = [0, 1, 2].map((corner) =>
        indices.getScalar(index + corner),
      );
      const hidden = triangle.every(
        (vertex) =>
          normals.getElement(vertex, [])[2] < hiddenFacing &&
          points.getElement(vertex, [])[2] < 0,
      );
      if (hidden) rearTriangles += 1;
      else kept.push(...triangle);
    }
    if (kept.length === indices.getCount()) continue;
    // prune() drops the replaced accessor.
    primitive.setIndices(
      accessor(
        "SCALAR",
        indexArray(kept, points.getCount()),
        indices.getBuffer(),
      ),
    );
  }
}

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
    quality: 86,
  }),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    slots: /^emissiveTexture$/,
    resize: [512, 512],
    quality: 86,
  }),
  // The glass's scratches live in the roughness channel: keep them sharp.
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    slots: /^(normalTexture|metallicRoughnessTexture|occlusionTexture)$/,
    resize: [1024, 1024],
    quality: 90,
  }),
);

await io.write(output, document);
const { size } = await stat(output);
console.log(
  `✓ ${path.relative(root, output)} · ${sourceTriangles} → ${countTriangles()} triangles (${rearTriangles} rear faces dropped) · ${(size / 1024).toFixed(0)} KB · glass ${(spans.maxX - spans.minX).toFixed(3)} × ${(spans.maxY - spans.minY).toFixed(3)}`,
);
