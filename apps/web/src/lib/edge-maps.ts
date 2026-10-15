import manifest from "./edge-maps.json";

const edgeMaps: Record<string, string> = manifest;

/** Precomputed matrix edge map for an image URL (see `pnpm --filter web edges`). */
export function edgeMapFor(imageUrl: string | null): string | null {
  return imageUrl ? (edgeMaps[imageUrl] ?? null) : null;
}
