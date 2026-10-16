import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import type {
  JourneyFormData,
  JourneyFormValues,
  JourneyKindValue,
} from "./journey-form";
import type { ProjectStatusValue } from "./project-form";

// The admin panel's access to the journey. Callers must have run
// requireAdmin() first.

function database() {
  const client = getDatabase();
  if (!client) throw new Error("DATABASE_URL is not set.");
  return client;
}

const toMonth = (date: Date) => date.toISOString().slice(0, 7);
const fromMonth = (month: string) => new Date(`${month}-01T00:00:00Z`);

export type JourneyRow = {
  id: string;
  slug: string;
  kind: JourneyKindValue;
  title: string;
  organization: string;
  summary: string;
  startedOn: string;
  endedOn: string | null;
  showMonths: boolean;
  status: ProjectStatusValue;
  updatedAt: Date;
};

/** Every step, newest first: the most recent ones are edited most. */
export async function listJourney(): Promise<JourneyRow[]> {
  const rows = await database().journeyEntry.findMany({
    orderBy: [{ startedOn: "desc" }, { endedOn: "desc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      kind: true,
      title: true,
      organization: true,
      summary: true,
      startedOn: true,
      endedOn: true,
      showMonths: true,
      status: true,
      updatedAt: true,
    },
  });
  return rows.map(({ startedOn, endedOn, ...row }) => ({
    ...row,
    startedOn: toMonth(startedOn),
    endedOn: endedOn ? toMonth(endedOn) : null,
  }));
}

export async function getJourneyForm(
  id: string,
): Promise<{ values: JourneyFormValues; updatedAt: Date } | null> {
  const entry = await database().journeyEntry.findUnique({ where: { id } });
  if (!entry) return null;
  return {
    updatedAt: entry.updatedAt,
    values: {
      slug: entry.slug,
      kind: entry.kind,
      title: entry.title,
      organization: entry.organization,
      location: entry.location ?? "",
      startedOn: toMonth(entry.startedOn),
      endedOn: entry.endedOn ? toMonth(entry.endedOn) : "",
      showMonths: entry.showMonths,
      summary: entry.summary,
      description: entry.description ?? "",
      highlights: entry.highlights,
      technologies: entry.technologies,
      projectSlugs: entry.projectSlugs,
      websiteUrl: entry.websiteUrl ?? "",
      status: entry.status,
    },
  };
}

/** Projects a step can link to, in the order of the site. */
export async function listProjectChoices() {
  return database().project.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }],
    select: { slug: true, title: true, status: true },
  });
}

export class JourneySlugTaken extends Error {}
export class JourneyEntryMissing extends Error {}

/** Creates the step when `id` is null. Returns its id. */
export async function saveJourneyEntry(
  id: string | null,
  { startedOn, endedOn, ...fields }: JourneyFormData,
): Promise<string> {
  const data = {
    ...fields,
    startedOn: fromMonth(startedOn),
    endedOn: endedOn ? fromMonth(endedOn) : null,
  };
  try {
    if (!id) {
      const created = await database().journeyEntry.create({
        data,
        select: { id: true },
      });
      return created.id;
    }
    await database().journeyEntry.update({ where: { id }, data });
    return id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new JourneySlugTaken();
      if (error.code === "P2025") throw new JourneyEntryMissing();
    }
    throw error;
  }
}

export async function setJourneyStatus(
  id: string,
  status: ProjectStatusValue,
): Promise<string | null> {
  const updated = await database()
    .journeyEntry.update({
      where: { id },
      data: { status },
      select: { title: true, organization: true },
    })
    .catch(() => null);
  return updated ? `${updated.title} · ${updated.organization}` : null;
}

export async function deleteJourneyEntry(id: string): Promise<string | null> {
  const deleted = await database()
    .journeyEntry.delete({
      where: { id },
      select: { title: true, organization: true },
    })
    .catch(() => null);
  return deleted ? `${deleted.title} · ${deleted.organization}` : null;
}
