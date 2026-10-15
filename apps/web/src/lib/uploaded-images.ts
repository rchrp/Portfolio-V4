// Naming of the images uploaded from the admin panel, shared by the upload
// code, the route that serves them and the edge-map lookup. Dependency-free.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `<24 hex>.webp`, plus `<24 hex>.edges.png` for a cover's edge map. */
export const UPLOADED_FILE_PATTERN = /^[a-f0-9]{24}(?:\.webp|\.edges\.png)$/;

/** An uploaded cover's edge map sits next to it: `….webp` → `….edges.png`. */
export function uploadedEdgeMapUrl(imageUrl: string): string | null {
  const match = /^(.*\/projects\/[a-z0-9-]+\/[a-f0-9]{24})\.webp$/.exec(
    imageUrl,
  );
  return match ? `${match[1]}.edges.png` : null;
}
