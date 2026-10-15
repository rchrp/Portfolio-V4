import manifest from "./edge-maps.json";
import { uploadedEdgeMapUrl } from "./uploaded-images";

const edgeMaps: Record<string, string> = manifest;

/**
 * Precomputed matrix edge map for an image URL: from the manifest (see
 * `pnpm --filter web edges`), or the one made when the cover was uploaded.
 */
export function edgeMapFor(imageUrl: string | null): string | null {
  return imageUrl ? (edgeMaps[imageUrl] ?? uploadedEdgeMapUrl(imageUrl)) : null;
}
