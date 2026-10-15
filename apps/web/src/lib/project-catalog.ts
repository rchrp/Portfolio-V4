import "server-only";
import { cache } from "react";
import { getDatabase } from "./db";
import { demoProjects } from "./demo-projects";
import { edgeMapFor } from "./edge-maps";
import {
  publicUrl,
  type Project,
  type ProjectCatalog,
  type ProjectKind,
  type ProjectLinkKind,
} from "./projects";

const withEdgeMap = (project: Project): Project => ({
  ...project,
  edgeMapUrl: edgeMapFor(project.logoUrl ?? project.imageUrl),
});

const demoCatalog = (): ProjectCatalog => ({
  source: "demo",
  projects: demoProjects.map(withEdgeMap),
});

const byOrder = { sortOrder: "asc" } as const;

export const getProjectCatalog = cache(async (): Promise<ProjectCatalog> => {
  try {
    const database = getDatabase();
    if (!database) return demoCatalog();

    const projects = await database.project.findMany({
      where: { status: "PUBLISHED", publishedAt: { lte: new Date() } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        description: true,
        kind: true,
        category: true,
        role: true,
        client: true,
        startedOn: true,
        endedOn: true,
        highlights: true,
        technologies: true,
        imageUrl: true,
        imageAlt: true,
        logoUrl: true,
        accentColor: true,
        notice: true,
        featured: true,
        links: {
          orderBy: byOrder,
          select: { kind: true, label: true, url: true },
        },
        media: {
          orderBy: byOrder,
          select: { url: true, alt: true, caption: true },
        },
        metrics: { orderBy: byOrder, select: { value: true, label: true } },
      },
    });

    return {
      source: "database",
      projects: projects.map(
        ({ startedOn, endedOn, kind, links, media, ...project }) =>
          withEdgeMap({
            ...project,
            kind: kind.toLowerCase() as ProjectKind,
            startYear: startedOn.getUTCFullYear(),
            endYear: endedOn?.getUTCFullYear() ?? null,
            imageUrl: publicUrl(project.imageUrl, true),
            logoUrl: publicUrl(project.logoUrl, true),
            accentColor: /^#[0-9a-f]{6}$/i.test(project.accentColor)
              ? project.accentColor
              : "#f15a24",
            links: links.flatMap((link) => {
              const url = publicUrl(link.url);
              return url
                ? [
                    {
                      ...link,
                      kind: link.kind.toLowerCase() as ProjectLinkKind,
                      url,
                    },
                  ]
                : [];
            }),
            media: media.flatMap((item) => {
              const url = publicUrl(item.url, true);
              return url ? [{ ...item, url }] : [];
            }),
          }),
      ),
    };
  } catch {
    // Never log the driver error: it may contain the connection string.
    console.error(
      "[projects] Database read failed; serving the explicit demo catalog.",
    );
    return demoCatalog();
  }
});
