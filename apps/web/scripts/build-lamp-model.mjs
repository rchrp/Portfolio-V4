// Prepares the desk lamp of the /parcours timeline for the web:
//
//   pnpm --filter web model:lamp
//
// Source: assets/models/desk_lamp.glb — "Desk lamp" by HASSAN
// (https://sketchfab.com/3d-models/desk-lamp-b9458e04d30e4b6284d46d35880a9b95),
// CC BY 4.0. The output is an adapted version, credited on the page.
//
// - bakes Sketchfab's nested node transforms into the mesh, base on y = 0,
//   1 unit tall, so the scene places it without measuring it,
// - quantizes the vertex attributes (KHR_mesh_quantization, which three.js
//   reads without a decoder),
// - resizes textures and re-encodes them as WebP: the lamp never fills the
//   screen, so 1024² for its colors and 512² for the rest is plenty.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  center,
  dedup,
  flatten,
  getBounds,
  prune,
  quantize,
  textureCompress,
  transformMesh,
} from "@gltf-transform/functions";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(root, "assets/models/desk_lamp.glb");
const output = path.join(root, "public/models/desk-lamp.glb");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const scene = document.getRoot().getDefaultScene();

await document.transform(flatten(), prune(), dedup());

// Bake each mesh's world transform, then drop the transforms.
for (const node of document.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  transformMesh(mesh, node.getWorldMatrix());
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}

// Base centred on the origin, standing on y = 0, 1 unit tall.
await document.transform(center({ pivot: "below" }));
const { min, max } = getBounds(scene);
const height = max[1] - min[1];
for (const node of scene.listChildren()) {
  node.setScale([1 / height, 1 / height, 1 / height]);
}
await document.transform(flatten());
for (const node of document.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  transformMesh(mesh, node.getWorldMatrix());
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}

await document.transform(
  prune(),
  quantize(),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    slots: /^(baseColorTexture|emissiveTexture)$/,
    resize: [1024, 1024],
    quality: 86,
  }),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    slots: /^(normalTexture|metallicRoughnessTexture|occlusionTexture)$/,
    resize: [512, 512],
    quality: 90,
  }),
);

await io.write(output, document);
const bounds = getBounds(scene);
console.log(
  `✓ ${path.relative(root, output)} · ${bounds.min.map((v) => v.toFixed(2))} → ${bounds.max.map((v) => v.toFixed(2))}`,
);
