export type JourneyKind =
  "education" | "work" | "freelance" | "project" | "milestone";

/** A project made along the way, linked from its journey step. */
export type JourneyProject = {
  slug: string;
  title: string;
};

export type JourneyEntry = {
  id: string;
  slug: string;
  kind: JourneyKind;
  title: string;
  organization: string;
  location: string | null;
  /** "YYYY-MM" */
  startedOn: string;
  /** "YYYY-MM", or null while it goes on. */
  endedOn: string | null;
  showMonths: boolean;
  summary: string;
  description: string | null;
  highlights: string[];
  technologies: string[];
  projects: JourneyProject[];
  websiteUrl: string | null;
};

export const journeyKindLabels: Record<JourneyKind, string> = {
  education: "Formation",
  work: "Expérience",
  freelance: "Freelance",
  project: "Projet",
  milestone: "Déclic",
};

const monthNames = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function formatMonth(month: string, showMonths: boolean): string {
  const [year, index] = month.split("-");
  return showMonths ? `${monthNames[Number(index) - 1]} ${year}` : year;
}

/**
 * "juil. 2024 – déc. 2024", "2020 – 2023", "Depuis 2023", or a single date
 * when the step starts and ends together.
 */
export function journeyPeriod({
  startedOn,
  endedOn,
  showMonths,
}: Pick<JourneyEntry, "startedOn" | "endedOn" | "showMonths">): string {
  const start = formatMonth(startedOn, showMonths);
  if (!endedOn) return `Depuis ${start}`;
  const end = formatMonth(endedOn, showMonths);
  return start === end ? start : `${start} – ${end}`;
}

/** "YYYY-MM" of the current month, to tell steps still going on. */
export const currentMonth = () => new Date().toISOString().slice(0, 7);

export const isOngoing = (
  { startedOn, endedOn }: Pick<JourneyEntry, "startedOn" | "endedOn">,
  now = currentMonth(),
) => startedOn <= now && (!endedOn || endedOn >= now);

/** Years covered by the whole journey, e.g. "2017 — 2027". */
export function journeySpan(entries: JourneyEntry[]): string | null {
  if (!entries.length) return null;
  const first = entries[0].startedOn.slice(0, 4);
  const last = entries
    .map((entry) => (entry.endedOn ?? currentMonth()).slice(0, 4))
    .reduce((latest, year) => (year > latest ? year : latest));
  return first === last ? first : `${first} — ${last}`;
}
