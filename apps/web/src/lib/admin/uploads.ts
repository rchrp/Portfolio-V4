import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  computeEdgeMap,
  rgbaToGrayscale,
  type EdgeMap,
} from "@/lib/edge-detection";
import { SLUG_PATTERN } from "@/lib/uploaded-images";

// Project images uploaded from the admin panel. The file is sniffed by its
// magic bytes, decoded and re-encoded to WebP by sharp (which drops EXIF, ICC
// and XMP metadata), then stored under a random name: nothing the client sends
// ends up in a path except the slug, which is checked against a strict pattern.
// Logos may also be SVG: rasterized here, the SVG itself is never stored.
//
// Storage is the local `public/projects/<slug>/` folder by default, or an
// S3-compatible bucket when UPLOAD_STORAGE=s3 (see the README).

const MAX_INPUT_PIXELS = 50_000_000;
const MAX_EDGE = 2400;
const LOGO_EDGE = 1024;
const EDGE_MAP_WIDTH = 384;
/** Empty space around a logo's edge map, so the matrix never clips it. */
const LOGO_MARGIN = 0.14;

export class UploadRejected extends Error {}

type Format = "png" | "jpeg" | "webp" | "svg";

function sniff(bytes: Buffer): Format | null {
  const starts = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  // "RIFF" <size> "WEBP"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  // An <svg> root, after an optional prolog. No DTD entities: they can expand.
  const head = bytes
    .subarray(0, 4096)
    .toString("utf8")
    .replace(/^\uFEFF/, "");
  if (
    /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>[]*>\s*)?<svg[\s>]/i.test(
      head,
    ) &&
    !bytes.includes("<!ENTITY")
  ) {
    return "svg";
  }
  return null;
}

export type ImagePurpose = "cover" | "media" | "logo";

export type ProcessedImage = {
  webp: Buffer;
  width: number;
  height: number;
  /** Grayscale PNG drawn by the pixel matrix, for covers and logos. */
  edges: Buffer | null;
};

export async function processImage(
  bytes: Buffer,
  purpose: ImagePurpose,
): Promise<ProcessedImage> {
  const format = sniff(bytes);
  if (!format || (format === "svg" && purpose !== "logo")) {
    throw new UploadRejected(
      purpose === "logo"
        ? "Formats acceptés : PNG, JPEG, WebP, SVG."
        : "Formats acceptés : PNG, JPEG, WebP.",
    );
  }

  const longest = purpose === "logo" ? LOGO_EDGE : MAX_EDGE;
  const encode = async () => {
    const options = {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    } as const;
    const metadata = await sharp(bytes, options).metadata();
    if (metadata.format !== format) {
      throw new UploadRejected("Le contenu du fichier ne correspond pas.");
    }
    // Vector logos are rendered at the density that makes them `longest` wide.
    const density =
      format === "svg"
        ? Math.min(
            1200,
            Math.max(
              72,
              (72 * longest) /
                Math.max(metadata.width ?? 1, metadata.height ?? 1, 1),
            ),
          )
        : undefined;
    // `rotate()` applies the EXIF orientation before the metadata is dropped.
    return sharp(bytes, { ...options, density })
      .rotate()
      .resize({
        width: longest,
        height: longest,
        fit: "inside",
        withoutEnlargement: format !== "svg",
      })
      .webp({ quality: 82, alphaQuality: 90, effort: 5 })
      .toBuffer({ resolveWithObject: true });
  };
  const webp = await encode().catch((error: unknown) => {
    throw error instanceof UploadRejected
      ? error
      : new UploadRejected("Image illisible ou trop grande (50 Mpx max).");
  });

  return {
    webp: webp.data,
    width: webp.info.width,
    height: webp.info.height,
    edges:
      purpose === "logo"
        ? await logoEdgeMap(webp.data)
        : purpose === "cover"
          ? await coverEdgeMap(webp.data)
          : null,
  };
}

const encodeEdgeMap = (map: EdgeMap) =>
  sharp(Buffer.from(map.data), {
    raw: { width: map.width, height: map.height, channels: 1 },
  })
    .png({ compressionLevel: 9, palette: true, colors: 32 })
    .toBuffer();

/** Same pipeline as scripts/build-edge-maps.mjs. */
async function coverEdgeMap(image: Buffer) {
  const { data, info } = await sharp(image)
    .flatten({ background: "#ffffff" })
    .resize({ width: EDGE_MAP_WIDTH })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encodeEdgeMap(
    computeEdgeMap(
      Float32Array.from(data, (value) => value / 255),
      info.width,
      info.height,
    ),
  );
}

/**
 * A logo, trimmed and centered with a margin. Transparent logos are laid on
 * the background that contrasts with their ink (a white logo on black), so
 * their outline shows whatever their color; opaque ones keep their own.
 */
async function logoEdgeMap(image: Buffer) {
  const trimmed = await sharp(image)
    .trim()
    .toBuffer()
    .catch(() => image);
  const inner = Math.round(EDGE_MAP_WIDTH * (1 - 2 * LOGO_MARGIN));
  const { data, info } = await sharp(trimmed)
    .ensureAlpha()
    .resize({ width: inner, height: inner, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let ink = 0;
  let coverage = 0;
  let transparent = false;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const alpha = data[offset + 3] / 255;
    transparent ||= alpha < 0.98;
    coverage += alpha;
    ink +=
      (alpha *
        (0.2126 * data[offset] +
          0.7152 * data[offset + 1] +
          0.0722 * data[offset + 2])) /
      255;
  }
  const gray = rgbaToGrayscale(data, width, height, 0);
  let background: number;
  if (transparent) {
    background = coverage && ink / coverage > 0.6 ? 0 : 1;
    gray.set(rgbaToGrayscale(data, width, height, background));
  } else {
    // Opaque: pad with the color of its own border.
    let border = 0;
    for (let x = 0; x < width; x += 1) {
      border += gray[x] + gray[(height - 1) * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      border += gray[y * width] + gray[y * width + width - 1];
    }
    background = border / (2 * (width + height));
  }

  const margin = Math.round(
    (Math.max(width, height) * LOGO_MARGIN) / (1 - 2 * LOGO_MARGIN),
  );
  const paddedWidth = width + 2 * margin;
  const padded = new Float32Array(paddedWidth * (height + 2 * margin)).fill(
    background,
  );
  for (let y = 0; y < height; y += 1) {
    padded.set(
      gray.subarray(y * width, (y + 1) * width),
      (y + margin) * paddedWidth + margin,
    );
  }
  return encodeEdgeMap(
    computeEdgeMap(padded, paddedWidth, height + 2 * margin),
  );
}

// ─── Storage ────────────────────────────────────────────────────────────────

type S3Config = {
  endpoint: URL;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
};

/** Null for local storage; throws when S3 is asked for but incomplete. */
function s3Config(): S3Config | null {
  if (process.env.UPLOAD_STORAGE !== "s3") return null;
  const {
    S3_ENDPOINT,
    S3_REGION,
    S3_BUCKET,
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY,
    S3_PUBLIC_URL,
  } = process.env;
  if (
    !S3_ENDPOINT ||
    !S3_BUCKET ||
    !S3_ACCESS_KEY_ID ||
    !S3_SECRET_ACCESS_KEY ||
    !S3_PUBLIC_URL
  ) {
    throw new Error("UPLOAD_STORAGE=s3 needs every S3_* variable.");
  }
  return {
    endpoint: new URL(S3_ENDPOINT),
    region: S3_REGION || "auto",
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    publicUrl: S3_PUBLIC_URL.replace(/\/+$/, ""),
  };
}

export const publicDirectory = path.join(process.cwd(), "public");

/**
 * Stores the image (and its edge map) and returns the image's URL: a
 * `/projects/<slug>/…` path locally, an https URL on S3.
 */
export async function storeImage(
  slug: string,
  image: ProcessedImage,
): Promise<string> {
  if (!SLUG_PATTERN.test(slug)) throw new UploadRejected("Slug invalide.");
  const id = randomBytes(12).toString("hex");
  // Edge map first: the image is what the form ends up pointing to.
  const files: [name: string, body: Buffer, type: string][] = [];
  if (image.edges) files.push([`${id}.edges.png`, image.edges, "image/png"]);
  files.push([`${id}.webp`, image.webp, "image/webp"]);

  const s3 = s3Config();
  if (s3) {
    for (const [name, body, type] of files) {
      await s3Put(s3, `projects/${slug}/${name}`, body, type);
    }
    return `${s3.publicUrl}/projects/${slug}/${id}.webp`;
  }

  const projectsRoot = path.join(publicDirectory, "projects");
  const directory = path.join(projectsRoot, slug);
  if (path.dirname(directory) !== projectsRoot) {
    throw new UploadRejected("Slug invalide.");
  }
  await mkdir(directory, { recursive: true });
  for (const [name, body] of files) {
    // Write then rename, so a half-written file is never served.
    const target = path.join(directory, name);
    const temporary = `${target}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, body, { flag: "wx", mode: 0o644 });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
  return `/projects/${slug}/${id}.webp`;
}

// Minimal AWS Signature V4 PUT, enough for any S3-compatible service (AWS,
// Cloudflare R2, Scaleway, MinIO…), with path-style URLs.
async function s3Put(
  config: S3Config,
  key: string,
  body: Buffer,
  contentType: string,
) {
  const url = new URL(
    `${config.endpoint.pathname.replace(/\/+$/, "")}/${config.bucket}/${key}`,
    config.endpoint,
  );
  const headers = {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": contentType,
    "x-amz-content-sha256": sha256(body),
    "x-amz-date": amzDate(new Date()),
  };
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...headers,
      authorization: signS3Request("PUT", url, headers, config),
    },
    body: new Uint8Array(body),
  });
  if (!response.ok) {
    // The body may echo the request; keep only the status.
    throw new Error(`S3 upload failed with HTTP ${response.status}.`);
  }
}

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const hmac = (secret: string | Buffer, value: string) =>
  createHmac("sha256", secret).update(value).digest();
const amzDate = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, "");

/**
 * The SigV4 `Authorization` header. `headers` must hold `x-amz-date` and
 * `x-amz-content-sha256`, lowercase; Host is signed too (fetch sends it).
 */
export function signS3Request(
  method: string,
  url: URL,
  headers: Record<string, string>,
  credentials: Pick<S3Config, "region" | "accessKeyId" | "secretAccessKey">,
): string {
  const date = headers["x-amz-date"];
  const day = date.slice(0, 8);
  const scope = `${day}/${credentials.region}/s3/aws4_request`;
  const signed: Record<string, string> = { ...headers, host: url.host };
  const names = Object.keys(signed).sort();
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    ...names.map((name) => `${name}:${signed[name].trim()}`),
    "",
    names.join(";"),
    headers["x-amz-content-sha256"],
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    date,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signingKey = [credentials.region, "s3", "aws4_request"].reduce(
    (key, part) => hmac(key, part),
    hmac(`AWS4${credentials.secretAccessKey}`, day),
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
}
