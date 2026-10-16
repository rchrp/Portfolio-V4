-- CreateEnum
CREATE TYPE "JourneyKind" AS ENUM ('EDUCATION', 'WORK', 'FREELANCE', 'PROJECT', 'MILESTONE');

-- CreateTable
CREATE TABLE "JourneyEntry" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "kind" "JourneyKind" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "organization" VARCHAR(120) NOT NULL,
    "location" VARCHAR(120),
    "startedOn" DATE NOT NULL,
    "endedOn" DATE,
    "showMonths" BOOLEAN NOT NULL DEFAULT true,
    "summary" VARCHAR(320) NOT NULL,
    "description" TEXT,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "projectSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "websiteUrl" VARCHAR(2048),
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JourneyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEntry_slug_key" ON "JourneyEntry"("slug");

-- CreateIndex
CREATE INDEX "JourneyEntry_status_startedOn_idx" ON "JourneyEntry"("status", "startedOn");


-- Same rules as projects: lists never hold NULL, text is never blank.
ALTER TABLE "JourneyEntry"
    ALTER COLUMN "highlights" SET NOT NULL,
    ALTER COLUMN "technologies" SET NOT NULL,
    ALTER COLUMN "projectSlugs" SET NOT NULL,
    ADD CONSTRAINT "JourneyEntry_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD CONSTRAINT "JourneyEntry_required_content" CHECK (
        length(trim("title")) > 0 AND
        length(trim("organization")) > 0 AND
        length(trim("summary")) > 0
    ),
    ADD CONSTRAINT "JourneyEntry_period" CHECK (
        "startedOn" >= DATE '1990-01-01' AND
        ("endedOn" IS NULL OR "endedOn" >= "startedOn")
    ),
    ADD CONSTRAINT "JourneyEntry_location" CHECK ("location" IS NULL OR length(trim("location")) > 0),
    ADD CONSTRAINT "JourneyEntry_description" CHECK ("description" IS NULL OR length(trim("description")) > 0),
    ADD CONSTRAINT "JourneyEntry_website_url" CHECK ("websiteUrl" IS NULL OR "websiteUrl" ~ '^https?://[^[:space:]]+$'),
    ADD CONSTRAINT "JourneyEntry_highlights" CHECK (array_position("highlights", NULL) IS NULL),
    ADD CONSTRAINT "JourneyEntry_technologies" CHECK (array_position("technologies", NULL) IS NULL),
    ADD CONSTRAINT "JourneyEntry_project_slugs" CHECK (array_position("projectSlugs", NULL) IS NULL);
