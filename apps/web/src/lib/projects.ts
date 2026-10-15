export type ProjectKind = "product" | "freelance" | "personal" | "school";

export type ProjectLinkKind =
  "website" | "source" | "download" | "video" | "community";

export type ProjectLink = {
  kind: ProjectLinkKind;
  label: string;
  url: string;
};

export type ProjectMedia = {
  url: string;
  alt: string;
  caption: string | null;
};

export type ProjectMetric = {
  value: string;
  label: string;
};

export type Project = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  kind: ProjectKind;
  category: string;
  role: string;
  client: string | null;
  startYear: number;
  /** Null while the project is still going on. */
  endYear: number | null;
  highlights: string[];
  technologies: string[];
  imageUrl: string | null;
  imageAlt: string | null;
  /** Drawn by the pixel matrix instead of the cover, when there is one. */
  logoUrl: string | null;
  accentColor: string;
  notice: string | null;
  featured: boolean;
  links: ProjectLink[];
  media: ProjectMedia[];
  metrics: ProjectMetric[];
  /** Precomputed edge map drawn by the pixel matrix (from the logo, else the cover). */
  edgeMapUrl?: string | null;
};

export type ProjectCatalog = {
  projects: Project[];
  source: "database" | "demo";
};

export const projectKindLabels: Record<ProjectKind, string> = {
  product: "Produit",
  freelance: "Freelance",
  personal: "Projet personnel",
  school: "Projet Epitech",
};

/** "2024", "2022 – 2024" or "Depuis 2026". */
export function projectPeriod({
  startYear,
  endYear,
}: Pick<Project, "startYear" | "endYear">): string {
  if (endYear === null) return `Depuis ${startYear}`;
  return endYear === startYear
    ? String(startYear)
    : `${startYear} – ${endYear}`;
}

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
