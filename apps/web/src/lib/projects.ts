export type Project = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  role: string;
  year: number;
  technologies: string[];
  imageUrl: string | null;
  imageAlt: string | null;
  accentColor: string;
  liveUrl: string | null;
  sourceUrl: string | null;
  /** Precomputed edge map drawn by the pixel matrix, when one exists. */
  edgeMapUrl?: string | null;
};

export type ProjectCatalog = {
  projects: Project[];
  source: "database" | "demo";
};

export function publicUrl(
  value: string | null,
  allowLocal = false,
): string | null {
  if (!value) return null;
  if (allowLocal && /^\/(?!\/)[a-zA-Z0-9/_%.-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
