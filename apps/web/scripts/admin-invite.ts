// Prints a one-time link that enrolls a passkey in the admin panel.
//
//   pnpm admin:invite
//
// Run it on the server (or against its database) to register the first
// passkey, or to recover after losing every passkey. The link works once,
// expires after 15 minutes, and carries its token in the URL fragment, which
// browsers never send to the server, its logs or a Referer header.
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { createHash, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../src/generated/prisma/client";

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env"),
  quiet: true,
});

const LIFETIME_MS = 15 * 60 * 1000;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[admin] DATABASE_URL is not set in apps/web/.env.");
  process.exit(1);
}
const origin = new URL(process.env.ADMIN_ORIGIN || "http://localhost:3000")
  .origin;

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const now = new Date();
  // Older unused invites stop working: only the latest link is live.
  await database.adminInvite.deleteMany({ where: { usedAt: null } });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + LIFETIME_MS);
  await database.adminInvite.create({
    data: {
      id: createHash("sha256").update(token).digest("hex"),
      expiresAt,
    },
  });

  const passkeys = await database.adminPasskey.count();
  console.log(
    `\nOne-time passkey enrollment link (valid until ${expiresAt.toLocaleTimeString()}):\n`,
  );
  console.log(`  ${origin}/admin/enroll#${token}\n`);
  console.log(
    passkeys
      ? `${passkeys} passkey(s) already registered; this adds another.`
      : "No passkey registered yet; this one will be the first.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => database.$disconnect());
