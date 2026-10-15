// The project editor's values and their validation, shared by the form (for
// its types and defaults) and the Server Actions (which re-validate all of it).
import * as z from "zod";
import { publicUrl } from "@/lib/projects";

export const projectKinds = [
  "PRODUCT",
  "FREELANCE",
  "PERSONAL",
  "SCHOOL",
] as const;
export const projectStatuses = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export const projectLinkKinds = [
  "WEBSITE",
  "SOURCE",
  "DOWNLOAD",
  "VIDEO",
  "COMMUNITY",
] as const;

export type ProjectStatusValue = (typeof projectStatuses)[number];

export const statusLabels: Record<ProjectStatusValue, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publié",
  ARCHIVED: "Archivé",
};

export const kindLabels: Record<(typeof projectKinds)[number], string> = {
  PRODUCT: "Produit",
  FREELANCE: "Freelance",
  PERSONAL: "Projet personnel",
  SCHOOL: "Projet Epitech",
};

export const linkKindLabels: Record<(typeof projectLinkKinds)[number], string> =
  {
    WEBSITE: "Site web",
    SOURCE: "Code source",
    DOWNLOAD: "Téléchargement",
    VIDEO: "Vidéo",
    COMMUNITY: "Communauté",
  };

const required = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} est requis.`)
    .max(max, `${max} caractères au maximum.`);

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .transform((value) => value || null);

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = z.string().regex(MONTH, "Format attendu : AAAA-MM.");
const optionalMonth = z
  .string()
  .refine((value) => !value || MONTH.test(value), "Format attendu : AAAA-MM.")
  .transform((value) => value || null);

/**
 * A local path under /public, or an absolute http(s) URL. Stored as parsed:
 * encoded, so it also passes the database's own check.
 */
const optionalImageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => !value || publicUrl(value, true) !== null, {
    message: "Un chemin local (/projects/…) ou une URL https.",
  })
  .transform((value) => (value ? publicUrl(value, true) : null));
const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => publicUrl(value, true) !== null, {
    message: "Un chemin local (/projects/…) ou une URL https.",
  })
  .transform((value) => publicUrl(value, true)!);

const webUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => publicUrl(value) !== null, {
    message: "Une URL http(s) complète.",
  })
  .transform((value) => publicUrl(value)!);

export const projectFormSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, "Le slug est requis.")
      .max(100)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Minuscules, chiffres et tirets uniquement.",
      ),
    title: required(120, "Le titre"),
    summary: required(320, "Le résumé"),
    description: required(20_000, "La description"),
    kind: z.enum(projectKinds),
    category: required(80, "La catégorie"),
    role: required(120, "Le rôle"),
    client: optional(120),
    startedOn: month,
    endedOn: optionalMonth,
    highlights: z.array(required(240, "Ce point")).max(12),
    technologies: z.array(required(40, "La technologie")).max(30),
    imageUrl: optionalImageUrl,
    imageAlt: optional(240),
    logoUrl: optionalImageUrl,
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Une couleur hexadécimale, ex. #f15a24.")
      .transform((value) => value.toLowerCase()),
    notice: optional(400),
    featured: z.boolean(),
    status: z.enum(projectStatuses),
    links: z
      .array(
        z.object({
          kind: z.enum(projectLinkKinds),
          label: required(60, "Le libellé"),
          url: webUrl,
        }),
      )
      .max(10),
    media: z
      .array(
        z.object({
          url: imageUrl,
          alt: required(240, "Le texte alternatif"),
          caption: optional(160),
        }),
      )
      .max(20),
    metrics: z
      .array(
        z.object({
          value: required(24, "La valeur"),
          label: required(80, "Le libellé"),
        }),
      )
      .max(8),
  })
  .superRefine((project, context) => {
    if (project.endedOn && project.endedOn < project.startedOn) {
      context.addIssue({
        code: "custom",
        path: ["endedOn"],
        message: "La fin précède le début.",
      });
    }
    if (project.imageUrl && !project.imageAlt) {
      context.addIssue({
        code: "custom",
        path: ["imageAlt"],
        message: "Décrivez l’image pour les lecteurs d’écran.",
      });
    }
    const seen = new Set<string>();
    project.links.forEach((link, index) => {
      if (seen.has(link.url)) {
        context.addIssue({
          code: "custom",
          path: ["links", index, "url"],
          message: "Ce lien figure déjà plus haut.",
        });
      }
      seen.add(link.url);
    });
  });

/** What the editor holds: every field as the form edits it. */
export type ProjectFormValues = z.input<typeof projectFormSchema>;
export type ProjectFormData = z.output<typeof projectFormSchema>;

/** Field path ("links.0.url") → message. */
export type FieldErrors = Record<string, string>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    errors[key] ??= issue.message;
  }
  return errors;
}

export const emptyProject: ProjectFormValues = {
  slug: "",
  title: "",
  summary: "",
  description: "",
  kind: "PERSONAL",
  category: "",
  role: "",
  client: "",
  startedOn: new Date().toISOString().slice(0, 7),
  endedOn: "",
  highlights: [],
  technologies: [],
  imageUrl: "",
  imageAlt: "",
  logoUrl: "",
  accentColor: "#f15a24",
  notice: "",
  featured: false,
  status: "DRAFT",
  links: [],
  media: [],
  metrics: [],
};

/** "Mon Projet Été" → "mon-projet-ete". */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
