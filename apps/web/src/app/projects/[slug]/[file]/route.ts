import { readFile } from "node:fs/promises";
import path from "node:path";
import { SLUG_PATTERN, UPLOADED_FILE_PATTERN } from "@/lib/uploaded-images";

// `next start` only serves the files that were in public/ when it started.
// Images uploaded from the admin panel afterwards land here instead, until the
// next restart; existing files never reach this route. Only generated names
// are served, so nothing else under public/ can be read through it.

export const runtime = "nodejs";

const directory = path.join(process.cwd(), "public", "projects");

export async function GET(
  _request: Request,
  context: RouteContext<"/projects/[slug]/[file]">,
) {
  const { slug, file } = await context.params;
  if (!SLUG_PATTERN.test(slug) || !UPLOADED_FILE_PATTERN.test(file)) {
    return new Response(null, { status: 404 });
  }
  try {
    const body = await readFile(path.join(directory, slug, file));
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": file.endsWith(".webp") ? "image/webp" : "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
