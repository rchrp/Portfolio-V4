// Precomputes the pixel-matrix edge maps once, so browsers never run the filter.
//
//   pnpm --filter web edges                    # default sources below
//   pnpm --filter web edges public/foo.png     # extra files under public/
//   pnpm --filter web edges https://…/cover.jpg
//
// Each source becomes a grayscale PNG in public/matrix/ and an entry in
// src/lib/edge-maps.json, keyed by the URL the site uses for that image.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { computeEdgeMap } from "../src/lib/edge-detection.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = path.join(root, "public");
const outputDirectory = path.join(publicDirectory, "matrix");
const manifestPath = path.join(root, "src/lib/edge-maps.json");
const imagePattern = /\.(png|jpe?g|webp|avif|svg)$/i;
const workingWidth = 384;
// Images that also get a light color texture, for the hero's WebGL intro.
const colorSources = new Set(["/portrait_3_white_bg_wider.png"]);
const colorWidth = 960;

const defaultSources = [
  ...(await readdir(path.join(publicDirectory, "projects")))
    .filter((file) => imagePattern.test(file))
    .map((file) => `/projects/${file}`),
  "/portrait_3_white_bg_wider.png",
];

const toKey = (source) => {
  if (/^https?:\/\//.test(source)) return source;
  const relative = path.relative(publicDirectory, path.resolve(root, source));
  return source.startsWith("/")
    ? source
    : `/${relative.split(path.sep).join("/")}`;
};

const toSlug = (key) =>
  key
    .replace(/^https?:\/\//, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

async function readSource(key) {
  if (/^https?:\/\//.test(key)) {
    const response = await fetch(key);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(path.join(publicDirectory, key));
}

const requested = process.argv.slice(2);
const keys = (requested.length ? requested : defaultSources).map(toKey);
const manifest = JSON.parse(
  await readFile(manifestPath, "utf8").catch(() => "{}"),
);
await mkdir(outputDirectory, { recursive: true });

for (const key of keys) {
  try {
    const { data, info } = await sharp(await readSource(key), { density: 144 })
      .flatten({ background: "#ffffff" })
      .resize({ width: workingWidth })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const gray = Float32Array.from(data, (value) => value / 255);
    const edges = computeEdgeMap(gray, info.width, info.height);
    const fileName = `${toSlug(key)}.png`;

    await sharp(Buffer.from(edges.data), {
      raw: { width: edges.width, height: edges.height, channels: 1 },
    })
      .png({ compressionLevel: 9, palette: true, colors: 32 })
      .toFile(path.join(outputDirectory, fileName));

    manifest[key] = `/matrix/${fileName}`;

    if (colorSources.has(key)) {
      const colorName = `${toSlug(key)}-color.webp`;
      await sharp(await readSource(key))
        .resize({ width: colorWidth })
        .webp({ quality: 82, alphaQuality: 90 })
        .toFile(path.join(outputDirectory, colorName));
      console.log(`✓ ${key} → /matrix/${colorName} (color, ${colorWidth}px)`);
    }
    console.log(
      `✓ ${key} → /matrix/${fileName} (${edges.width}×${edges.height})`,
    );
  } catch (error) {
    console.error(
      `✗ ${key}: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}

const sorted = Object.fromEntries(
  Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
);
await writeFile(manifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
