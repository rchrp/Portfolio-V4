// Prepares the CRT model for the web:
//
//   pnpm --filter web model
//
// Source: assets/models/computer_terminal.glb — "Computer Terminal" by Chris
// Sweetwood (https://skfb.ly/6vrwA), CC BY-SA 4.0. The output is an adapted
// version and stays under CC BY-SA 4.0.
//
// - removes Sketchfab's baked shadow and backdrop planes,
// - splits the curved glass out of the body into its own "Screen" primitive,
//   with UVs spanning 0–1 so the site's CRT shader can draw on it,
// - resizes textures and re-encodes them as WebP.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(root, "assets/models/computer_terminal.glb");
const output = path.join(root, "public/models/computer-terminal.glb");

// Glass area of the baked texture, in pixels of the 1024² base color map.
const glass = { left: 555, right: 825, top: 310, bottom: 495, size: 1024 };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const scene = document.getRoot();

for (const node of scene.listNodes()) {
  if (/^Plane/.test(node.getName())) node.dispose();
}

const screenMaterial = document.createMaterial("Screen");
let splitCount = 0;

for (const mesh of scene.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const indices = primitive.getIndices();
    const uv = primitive.getAttribute("TEXCOORD_0");
    if (!indices || !uv) continue;

    const inGlass = (vertex) => {
      const [u, v] = uv.getElement(vertex, []);
      const x = u * glass.size;
      const y = v * glass.size;
      return (
        x > glass.left && x < glass.right && y > glass.top && y < glass.bottom
      );
    };

    const kept = [];
    const screen = [];
    for (let index = 0; index < indices.getCount(); index += 3) {
      const triangle = [0, 1, 2].map((corner) =>
        indices.getScalar(index + corner),
      );
      (triangle.every(inGlass) ? screen : kept).push(...triangle);
    }
    if (screen.length === 0) continue;

    // New vertex set for the glass, with UVs normalized over its bounds.
    // In this model the texture's v axis grows upwards in world space.
    const remap = new Map(screen.map((vertex) => [vertex, 0]));
    const vertices = [...remap.keys()];
    vertices.forEach((vertex, order) => remap.set(vertex, order));
    const bounds = vertices.reduce(
      (box, vertex) => {
        const [u, v] = uv.getElement(vertex, []);
        return {
          minU: Math.min(box.minU, u),
          maxU: Math.max(box.maxU, u),
          minV: Math.min(box.minV, v),
          maxV: Math.max(box.maxV, v),
        };
      },
      { minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity },
    );

    const copy = (semantic, transform = (value) => value) => {
      const source = primitive.getAttribute(semantic);
      const size = source.getElementSize();
      const array = new Float32Array(vertices.length * size);
      vertices.forEach((vertex, order) =>
        array.set(transform(source.getElement(vertex, [])), order * size),
      );
      return document
        .createAccessor()
        .setType(source.getType())
        .setArray(array)
        .setBuffer(source.getBuffer());
    };

    const glassPrimitive = document
      .createPrimitive()
      .setMaterial(screenMaterial)
      .setAttribute("POSITION", copy("POSITION"))
      .setAttribute("NORMAL", copy("NORMAL"))
      .setAttribute(
        "TEXCOORD_0",
        copy("TEXCOORD_0", ([u, v]) => [
          (u - bounds.minU) / (bounds.maxU - bounds.minU),
          (v - bounds.minV) / (bounds.maxV - bounds.minV),
        ]),
      )
      .setIndices(
        document
          .createAccessor()
          .setType("SCALAR")
          .setArray(new Uint16Array(screen.map((vertex) => remap.get(vertex))))
          .setBuffer(indices.getBuffer()),
      );
    mesh.addPrimitive(glassPrimitive);
    primitive.setIndices(
      document
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array(kept))
        .setBuffer(indices.getBuffer()),
    );
    indices.dispose();
    splitCount += screen.length / 3;
  }
}

if (splitCount === 0) throw new Error("Screen glass not found in the model.");

// Keep the glass UVs (its material has no texture, so prune would drop
// them), but not the unused second UV set.
for (const mesh of scene.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    primitive.setAttribute("TEXCOORD_1", null);
  }
}

await document.transform(
  prune({ keepAttributes: true }),
  dedup(),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    resize: [1024, 1024],
    quality: 88,
  }),
);

await io.write(output, document);
console.log(
  `✓ ${splitCount} glass triangles split → ${path.relative(root, output)}`,
);
