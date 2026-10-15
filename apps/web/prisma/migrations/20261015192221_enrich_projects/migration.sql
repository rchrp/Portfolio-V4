-- Enrich projects: period, setting, key points, notice, and the links, gallery
-- and figures that a case study needs. Existing rows are carried over.

-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('PRODUCT', 'FREELANCE', 'PERSONAL', 'SCHOOL');

-- CreateEnum
CREATE TYPE "ProjectLinkKind" AS ENUM ('WEBSITE', 'SOURCE', 'DOWNLOAD', 'VIDEO', 'COMMUNITY');

-- AlterTable: new columns, nullable until the backfill below
ALTER TABLE "Project"
    ADD COLUMN "kind" "ProjectKind",
    ADD COLUMN "client" VARCHAR(120),
    ADD COLUMN "startedOn" DATE,
    ADD COLUMN "endedOn" DATE,
    ADD COLUMN "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "notice" VARCHAR(400),
    ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProjectLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ProjectLinkKind" NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMedia" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "alt" VARCHAR(240) NOT NULL,
    "caption" VARCHAR(160),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMetric" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "value" VARCHAR(24) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectMetric_pkey" PRIMARY KEY ("id")
);

-- Backfill: a year becomes that whole year, the two URLs become links.
UPDATE "Project"
SET "kind" = 'PERSONAL',
    "startedOn" = make_date("year", 1, 1),
    "endedOn" = make_date("year", 12, 31);

INSERT INTO "ProjectLink" ("id", "projectId", "kind", "label", "url", "sortOrder")
SELECT gen_random_uuid()::text, "id", 'WEBSITE', 'Voir le site', "liveUrl", 0
FROM "Project" WHERE "liveUrl" IS NOT NULL;

INSERT INTO "ProjectLink" ("id", "projectId", "kind", "label", "url", "sortOrder")
SELECT gen_random_uuid()::text, "id", 'SOURCE', 'Code source', "sourceUrl", 1
FROM "Project" WHERE "sourceUrl" IS NOT NULL;

-- AlterTable: the old columns go, the new ones become required
ALTER TABLE "Project"
    DROP CONSTRAINT "Project_year_range",
    DROP CONSTRAINT "Project_live_url",
    DROP CONSTRAINT "Project_source_url",
    DROP COLUMN "year",
    DROP COLUMN "liveUrl",
    DROP COLUMN "sourceUrl",
    ALTER COLUMN "kind" SET NOT NULL,
    ALTER COLUMN "startedOn" SET NOT NULL,
    ALTER COLUMN "technologies" SET DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "ProjectLink_projectId_sortOrder_idx" ON "ProjectLink"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectLink_projectId_url_key" ON "ProjectLink"("projectId", "url");

-- CreateIndex
CREATE INDEX "ProjectMedia_projectId_sortOrder_idx" ON "ProjectMedia"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectMetric_projectId_sortOrder_idx" ON "ProjectMetric"("projectId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProjectLink" ADD CONSTRAINT "ProjectLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMedia" ADD CONSTRAINT "ProjectMedia_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMetric" ADD CONSTRAINT "ProjectMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Editorial integrity: these checks complement the Prisma model.
ALTER TABLE "Project"
    ADD CONSTRAINT "Project_period" CHECK (
        "startedOn" >= DATE '1990-01-01' AND
        ("endedOn" IS NULL OR "endedOn" >= "startedOn")
    ),
    ADD CONSTRAINT "Project_client" CHECK ("client" IS NULL OR length(trim("client")) > 0),
    ADD CONSTRAINT "Project_notice" CHECK ("notice" IS NULL OR length(trim("notice")) > 0),
    ADD CONSTRAINT "Project_highlights" CHECK (array_position("highlights", NULL) IS NULL),
    ADD CONSTRAINT "Project_technologies" CHECK (array_position("technologies", NULL) IS NULL);

ALTER TABLE "ProjectLink"
    ADD CONSTRAINT "ProjectLink_label" CHECK (length(trim("label")) > 0),
    ADD CONSTRAINT "ProjectLink_url" CHECK ("url" ~ '^https?://[^[:space:]]+$');

ALTER TABLE "ProjectMedia"
    ADD CONSTRAINT "ProjectMedia_alt" CHECK (length(trim("alt")) > 0),
    ADD CONSTRAINT "ProjectMedia_url" CHECK ("url" ~ '^(https?://[^[:space:]]+|/[a-zA-Z0-9/_%.-]+)$');

ALTER TABLE "ProjectMetric"
    ADD CONSTRAINT "ProjectMetric_content" CHECK (
        length(trim("value")) > 0 AND length(trim("label")) > 0
    );
