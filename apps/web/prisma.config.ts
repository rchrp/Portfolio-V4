import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// The same file Next.js reads, so the CLI and the site share one database.
const directory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(directory, ".env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // Generation works without a database; migration commands require DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL },
});
