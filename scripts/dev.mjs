// `pnpm dev`: everything the site needs, in one command.
//
// 1. Creates apps/web/.env from its template on the first run.
// 2. Starts Docker (Docker Desktop on macOS) if it is not running yet.
// 3. Starts the Postgres container and waits until it accepts connections.
// 4. Applies pending migrations, then seeds the projects if there are none.
// 5. Runs the Next.js dev server.
//
// The database keeps running after Ctrl+C; `pnpm db:down` stops it.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webEnv = path.join(root, "apps/web/.env");

function run(command, args) {
  const { status, error } = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (status !== 0) {
    console.error(
      `\n[dev] \`${command} ${args.join(" ")}\` failed${error ? `: ${error.message}` : "."}`,
    );
    process.exit(status ?? 1);
  }
}

const dockerIsUp = () =>
  spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

async function ensureDocker() {
  if (dockerIsUp()) return;
  if (process.platform !== "darwin") {
    console.error(
      "[dev] Docker is not running. Start it, then run `pnpm dev` again.",
    );
    process.exit(1);
  }
  console.log("[dev] Starting Docker Desktop…");
  spawnSync("open", ["-a", "Docker"], { stdio: "ignore" });
  for (let waited = 0; waited < 90; waited += 2) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (dockerIsUp()) return;
  }
  console.error("[dev] Docker did not start within 90 s.");
  process.exit(1);
}

if (!existsSync(webEnv)) {
  copyFileSync(path.join(root, "apps/web/.env.example"), webEnv);
  console.log("[dev] Created apps/web/.env from .env.example.");
}

await ensureDocker();
run("docker", ["compose", "up", "--detach", "--wait", "db"]);
run("pnpm", ["--filter", "web", "db:migrate"]);
run("pnpm", ["--filter", "web", "db:seed", "--if-empty"]);

const server = spawn("pnpm", ["--filter", "web", "dev"], {
  cwd: root,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
