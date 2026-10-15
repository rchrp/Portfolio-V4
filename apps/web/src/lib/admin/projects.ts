import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import type {
  ProjectFormData,
  ProjectFormValues,
  ProjectStatusValue,
} from "./project-form";

// The admin panel's data access. Callers must have run requireAdmin() first.

function database() {
  const client = getDatabase();
  if (!client) throw new Error("DATABASE_URL is not set.");
  return client;
}

const toMonth = (date: Date) => date.toISOString().slice(0, 7);
const fromMonth = (month: string) => new Date(`${month}-01T00:00:00Z`);

export type ProjectRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  kind: ProjectFormValues["kind"];
  status: ProjectStatusValue;
  featured: boolean;
  imageUrl: string | null;
  accentColor: string;
  startYear: number;
  endYear: number | null;
  updatedAt: Date;
};

export async function listProjects(): Promise<ProjectRow[]> {
  const rows = await database().project.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      kind: true,
      status: true,
      featured: true,
      imageUrl: true,
      accentColor: true,
      startedOn: true,
      endedOn: true,
      updatedAt: true,
    },
  });
  return rows.map(({ startedOn, endedOn, ...row }) => ({
    ...row,
    startYear: startedOn.getUTCFullYear(),
    endYear: endedOn?.getUTCFullYear() ?? null,
  }));
}

const byOrder = { orderBy: { sortOrder: "asc" } } as const;

export async function getProjectForm(
  id: string,
): Promise<{ values: ProjectFormValues; updatedAt: Date } | null> {
  const project = await database().project.findUnique({
    where: { id },
    include: { links: byOrder, media: byOrder, metrics: byOrder },
  });
  if (!project) return null;
  return {
    updatedAt: project.updatedAt,
    values: {
      slug: project.slug,
      title: project.title,
      summary: project.summary,
      description: project.description,
      kind: project.kind,
      category: project.category,
      role: project.role,
      client: project.client ?? "",
      startedOn: toMonth(project.startedOn),
      endedOn: project.endedOn ? toMonth(project.endedOn) : "",
      highlights: project.highlights,
      technologies: project.technologies,
      imageUrl: project.imageUrl ?? "",
      imageAlt: project.imageAlt ?? "",
      logoUrl: project.logoUrl ?? "",
      accentColor: project.accentColor,
      notice: project.notice ?? "",
      featured: project.featured,
      status: project.status,
      links: project.links.map(({ kind, label, url }) => ({
        kind,
        label,
        url,
      })),
      media: project.media.map(({ url, alt, caption }) => ({
        url,
        alt,
        caption: caption ?? "",
      })),
      metrics: project.metrics.map(({ value, label }) => ({ value, label })),
    },
  };
}

export class SlugTaken extends Error {}
export class ProjectMissing extends Error {}

/** Creates the project when `id` is null. Returns its id. */
export async function saveProject(
  id: string | null,
  input: ProjectFormData,
): Promise<string> {
  const { links, media, metrics, startedOn, endedOn, ...fields } = input;
  const ordered = <T>(items: T[]) =>
    items.map((item, index) => ({ ...item, sortOrder: index }));

  try {
    return await database().$transaction(async (transaction) => {
      const current = id
        ? await transaction.project.findUnique({
            where: { id },
            select: { publishedAt: true },
          })
        : null;
      if (id && !current) throw new ProjectMissing();

      const data = {
        ...fields,
        startedOn: fromMonth(startedOn),
        endedOn: endedOn ? fromMonth(endedOn) : null,
        // First publication sets the date; it then stays, even when hidden.
        publishedAt:
          current?.publishedAt ??
          (fields.status === "PUBLISHED" ? new Date() : null),
      };

      let projectId: string;
      if (id) {
        await transaction.project.update({ where: { id }, data });
        projectId = id;
        const children = { where: { projectId } };
        await transaction.projectLink.deleteMany(children);
        await transaction.projectMedia.deleteMany(children);
        await transaction.projectMetric.deleteMany(children);
      } else {
        const last = await transaction.project.aggregate({
          _max: { sortOrder: true },
        });
        const created = await transaction.project.create({
          data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 10 },
          select: { id: true },
        });
        projectId = created.id;
      }

      const owned = <T>(items: T[]) =>
        ordered(items).map((item) => ({ ...item, projectId }));
      await transaction.projectLink.createMany({ data: owned(links) });
      await transaction.projectMedia.createMany({ data: owned(media) });
      await transaction.projectMetric.createMany({ data: owned(metrics) });
      return projectId;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SlugTaken();
    }
    throw error;
  }
}

export async function setProjectStatus(
  id: string,
  status: ProjectStatusValue,
): Promise<string | null> {
  const db = database();
  const project = await db.project.findUnique({
    where: { id },
    select: { title: true, publishedAt: true },
  });
  if (!project) return null;
  await db.project.update({
    where: { id },
    data: {
      status,
      publishedAt:
        project.publishedAt ?? (status === "PUBLISHED" ? new Date() : null),
    },
  });
  return project.title;
}

/** Swaps the project with its neighbour, then renumbers every project. */
export async function moveProject(
  id: string,
  direction: -1 | 1,
): Promise<boolean> {
  return database().$transaction(async (transaction) => {
    const ids = (
      await transaction.project.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }],
        select: { id: true },
      })
    ).map((project) => project.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return false;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    const orders = ids.map((_, index) => (index + 1) * 10);
    // Raw SQL so reordering does not touch each project's updatedAt.
    await transaction.$executeRaw`
      UPDATE "Project" AS project SET "sortOrder" = next.position
      FROM unnest(${ids}::text[], ${orders}::int[]) AS next(id, position)
      WHERE project.id = next.id`;
    return true;
  });
}

export async function deleteProject(id: string): Promise<string | null> {
  const deleted = await database()
    .project.delete({ where: { id }, select: { title: true } })
    .catch(() => null);
  return deleted?.title ?? null;
}
