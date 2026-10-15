// Writes the projects from seed-data.ts into the database.
//
//   pnpm --filter web db:seed              # create or update every project
//   pnpm --filter web db:seed --if-empty   # only when there is no project yet
//
// Projects are matched by slug. Projects missing from seed-data.ts are left
// untouched, and a publication date, once set, is kept.
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedProjects, type SeedProject } from "./seed-data";

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env"),
  quiet: true,
});

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[seed] DATABASE_URL is not set in apps/web/.env.");
  process.exit(1);
}

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const toDate = (month: string) => new Date(`${month}-01T00:00:00Z`);

async function writeProject(project: SeedProject, sortOrder: number) {
  const { slug, startedOn, endedOn, links, media, metrics, ...fields } =
    project;
  const existing = await database.project.findUnique({
    where: { slug },
    select: { publishedAt: true },
  });
  const data = {
    ...fields,
    client: fields.client ?? null,
    notice: fields.notice ?? null,
    featured: fields.featured ?? false,
    startedOn: toDate(startedOn),
    endedOn: endedOn ? toDate(endedOn) : null,
    sortOrder,
    publishedAt:
      existing?.publishedAt ??
      (project.status === "PUBLISHED" ? new Date() : null),
  };
  const ordered = <T>(items: T[] = []) =>
    items.map((item, index) => ({ ...item, sortOrder: index }));

  await database.$transaction(async (transaction) => {
    const { id } = await transaction.project.upsert({
      where: { slug },
      create: { slug, ...data },
      update: data,
      select: { id: true },
    });
    const owned = { where: { projectId: id } };
    await transaction.projectLink.deleteMany(owned);
    await transaction.projectMedia.deleteMany(owned);
    await transaction.projectMetric.deleteMany(owned);
    await transaction.projectLink.createMany({
      data: ordered(links).map((link) => ({ ...link, projectId: id })),
    });
    await transaction.projectMedia.createMany({
      data: ordered(media).map((item) => ({ ...item, projectId: id })),
    });
    await transaction.projectMetric.createMany({
      data: ordered(metrics).map((metric) => ({ ...metric, projectId: id })),
    });
  });
}

async function main() {
  if (process.argv.includes("--if-empty") && (await database.project.count())) {
    console.log("[seed] Projects already present; nothing to do.");
    return;
  }
  for (const [index, project] of seedProjects.entries()) {
    await writeProject(project, (index + 1) * 10);
  }
  console.log(`[seed] ${seedProjects.length} projects written.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => database.$disconnect());
