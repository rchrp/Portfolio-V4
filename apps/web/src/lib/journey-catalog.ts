import "server-only";
import { cache } from "react";
import { getDatabase } from "./db";
import type { JourneyEntry, JourneyKind } from "./journey";
import { publicUrl } from "./projects";

const toMonth = (date: Date) => date.toISOString().slice(0, 7);

/** Published steps, oldest first, or null when the database is unavailable. */
export const getJourney = cache(async (): Promise<JourneyEntry[] | null> => {
  try {
    const database = getDatabase();
    if (!database) return null;

    const [entries, projects] = await Promise.all([
      database.journeyEntry.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ startedOn: "asc" }, { endedOn: "asc" }, { id: "asc" }],
        select: {
          id: true,
          slug: true,
          kind: true,
          title: true,
          organization: true,
          location: true,
          startedOn: true,
          endedOn: true,
          showMonths: true,
          summary: true,
          description: true,
          highlights: true,
          technologies: true,
          projectSlugs: true,
          websiteUrl: true,
        },
      }),
      database.project.findMany({
        where: { status: "PUBLISHED", publishedAt: { lte: new Date() } },
        select: { slug: true, title: true },
      }),
    ]);

    // Only published projects are linked: the others have no page to open.
    const titles = new Map(projects.map(({ slug, title }) => [slug, title]));
    return entries.map(
      ({ kind, startedOn, endedOn, projectSlugs, websiteUrl, ...entry }) => ({
        ...entry,
        kind: kind.toLowerCase() as JourneyKind,
        startedOn: toMonth(startedOn),
        endedOn: endedOn ? toMonth(endedOn) : null,
        websiteUrl: publicUrl(websiteUrl),
        projects: projectSlugs.flatMap((slug) => {
          const title = titles.get(slug);
          return title ? [{ slug, title }] : [];
        }),
      }),
    );
  } catch {
    // Never log the driver error: it may contain the connection string.
    console.error("[journey] Database read failed.");
    return null;
  }
});
