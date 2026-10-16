// The journey editor's values and their validation, shared by the form (for
// its types and defaults) and the Server Actions (which re-validate all of it).
import * as z from "zod";
import { publicUrl } from "@/lib/projects";
import { projectStatuses } from "./project-form";

export const journeyKinds = [
  "EDUCATION",
  "WORK",
  "FREELANCE",
  "PROJECT",
  "MILESTONE",
] as const;

export type JourneyKindValue = (typeof journeyKinds)[number];

export const journeyKindLabels: Record<JourneyKindValue, string> = {
  EDUCATION: "Formation",
  WORK: "Expérience",
  FREELANCE: "Freelance",
  PROJECT: "Projet",
  MILESTONE: "Déclic",
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
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const journeyFormSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, "Le slug est requis.")
      .max(100)
      .regex(SLUG, "Minuscules, chiffres et tirets uniquement."),
    kind: z.enum(journeyKinds),
    title: required(120, "Le titre"),
    organization: required(120, "L’organisation"),
    location: optional(120),
    startedOn: z.string().regex(MONTH, "Format attendu : AAAA-MM."),
    endedOn: z
      .string()
      .refine(
        (value) => !value || MONTH.test(value),
        "Format attendu : AAAA-MM.",
      )
      .transform((value) => value || null),
    showMonths: z.boolean(),
    summary: required(320, "Le résumé"),
    description: optional(20_000),
    highlights: z.array(required(240, "Ce point")).max(12),
    technologies: z.array(required(40, "La technologie")).max(30),
    projectSlugs: z.array(z.string().regex(SLUG).max(100)).max(20),
    websiteUrl: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => !value || publicUrl(value) !== null, {
        message: "Une URL http(s) complète.",
      })
      .transform((value) => (value ? publicUrl(value) : null)),
    status: z.enum(projectStatuses),
  })
  .superRefine((entry, context) => {
    if (entry.endedOn && entry.endedOn < entry.startedOn) {
      context.addIssue({
        code: "custom",
        path: ["endedOn"],
        message: "La fin précède le début.",
      });
    }
  });

/** What the editor holds: every field as the form edits it. */
export type JourneyFormValues = z.input<typeof journeyFormSchema>;
export type JourneyFormData = z.output<typeof journeyFormSchema>;

export const emptyJourneyEntry: JourneyFormValues = {
  slug: "",
  kind: "WORK",
  title: "",
  organization: "",
  location: "",
  startedOn: new Date().toISOString().slice(0, 7),
  endedOn: "",
  showMonths: true,
  summary: "",
  description: "",
  highlights: [],
  technologies: [],
  projectSlugs: [],
  websiteUrl: "",
  status: "DRAFT",
};
