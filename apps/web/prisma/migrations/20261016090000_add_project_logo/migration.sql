-- AlterTable
ALTER TABLE "Project" ADD COLUMN "logoUrl" VARCHAR(2048);

-- Same rule as the cover: an http(s) URL or a local /public path.
ALTER TABLE "Project"
    ADD CONSTRAINT "Project_logo_url" CHECK ("logoUrl" IS NULL OR "logoUrl" ~ '^(https?://[^[:space:]]+|/[a-zA-Z0-9/_%.-]+)$');
