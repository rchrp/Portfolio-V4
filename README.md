# Portfolio-V4

A minimal Next.js starter configured for the Portfolio-V4 workspace.

## Stack

- Next.js with the App Router and TypeScript
- Tailwind CSS
- shadcn/ui configuration
- Next.js route-handler API support
- Prisma with PostgreSQL
- pnpm workspaces
- ESLint and Prettier

## Getting started

Requirements: Node.js 24, pnpm (`corepack enable`) and Docker (Docker Desktop on macOS).

```bash
pnpm install
pnpm dev
```

`pnpm dev` does everything the site needs: it creates `apps/web/.env` from `apps/web/.env.example` on the first run, starts Docker if needed, starts the PostgreSQL container from `docker-compose.yml`, applies pending migrations, seeds the projects when the database has none, then runs the Next.js dev server on http://localhost:3000. The database keeps running after Ctrl+C.

`DATABASE_URL` lives in `apps/web/.env` only: Next.js reads that file, and so do the Prisma CLI and the seed script.

## Commands

```bash
pnpm dev            # database + migrations + seed if empty + Next.js
pnpm dev:web        # Next.js only
pnpm build
pnpm lint
pnpm format
pnpm format:check

pnpm db:up          # start PostgreSQL (docker compose)
pnpm db:down        # stop it; the data stays in the postgres-data volume
pnpm db:migrate     # apply pending migrations
pnpm db:seed        # write prisma/seed-data.ts into the database
pnpm db:reset       # drop everything, re-apply migrations, then seed
pnpm db:studio      # browse and edit records locally

pnpm admin:invite   # one-time link to enroll an admin passkey
```

## Story and animation

The page reads as one scroll-driven story; its copy lives in `apps/web/src/lib/site-content.ts`.

1. **Hero** — interactive pixel matrix, name and contact actions (light, editorial). On load, a short WebGL intro draws the portrait from its edge map on the matrix grid, fills the silhouette, doubles its resolution step by step while shifting from orange to the photo's colors, then hands over to the real image and releases its WebGL context. Contact details and profile links live in `contact` (`apps/web/src/lib/site-content.ts`) and appear once set.
2. **Manifesto** — after a light-to-night gradient, the statement lights up word by word as you scroll.
3. **Terminal** — a three.js scene (loaded on demand) with a vintage computer model powers on, boots, and switches channel for each project as the page scrolls. The screen is a 2D canvas texture (a small retro desktop) rendered through a curved-glass shader: barrel distortion, light radial chromatic aberration, scanlines, aperture grille, glitch on channel change, line-then-open power cycle. The shader is applied to the model's own curved glass. A `RectAreaLight` tinted by the displayed image lights the keyboard and desk. Behind the canvas, the pixel matrix redraws the active project from its edge map. Arrow keys, the side rail and previous/next buttons scroll to a given project; each opens an accessible native dialog.
4. **Contact** — the monitor switches off and the matrix redraws the portrait from its edge map.

Reduced-motion preferences make power changes and project switches instant and remove glitches, camera drift and blur. Without WebGL, the project image is shown in a CSS monitor frame.

### Pixel-matrix edge maps

The matrix draws images from precomputed edge maps: gradient magnitude of a derivative-of-Gaussian filter (separable kernels, percentile normalization), stored as small grayscale PNGs in `apps/web/public/matrix/` and indexed in `apps/web/src/lib/edge-maps.json` by image URL. Generate them once, after adding or changing an image:

```bash
pnpm --filter web edges                         # public/projects/* and the portrait
pnpm --filter web edges public/projects/new.png # specific files under public/
pnpm --filter web edges https://example.com/cover.jpg
```

Projects whose image has no edge map fall back to computing it in the browser (remote images need CORS headers). The portrait also gets a light color texture (`*-color.webp`, 960 px) used by the hero intro.

### 3D model

The monitor is a third-party model, adapted for the site by `apps/web/scripts/build-model.mjs`: it removes Sketchfab's backdrop planes, splits the screen glass into its own `Screen` primitive (UVs spanning 0–1, for the CRT shader) and re-encodes textures as WebP (3.9 MB → 0.34 MB). The source stays in `apps/web/assets/models/` (not served); rebuild after changing it:

```bash
pnpm --filter web model
```

## Project catalog

The terminal chapter reads published projects, with their links, gallery and figures, from PostgreSQL on the server. `GET /api/projects` exposes the same public catalog with a `source` field (`database` or `demo`), without caching database failures. Projects are edited in the [admin panel](#admin-panel); there are no public write endpoints.

- Missing or unreachable database: four **clearly labeled fictional examples**, using locally stored SVG artwork, are displayed. They are never inserted into PostgreSQL. A failed database read is reported server-side without logging credentials.
- Connected but empty database (or only drafts): an intentional empty state is shown, **not** fabricated projects.

### Database setup and migrations

Locally, `pnpm dev` (or `pnpm db:up` then `pnpm db:migrate`) is enough. Elsewhere, provision PostgreSQL, set `DATABASE_URL` in `apps/web/.env`, then run `pnpm db:migrate`. Migrations live in `apps/web/prisma/migrations` and never reset data; client generation runs before `dev` and `build` and needs no database.

For schema changes, use `pnpm --filter web db:migrate:dev --name your_change` against the development database. Use `db:migrate` in deployment setup; do not use `db push` in production.

### Project content

The projects shown on the site are written in `apps/web/prisma/seed-data.ts`, in display order, and their images live in `apps/web/public/projects/<slug>/`. After editing that file, run `pnpm db:seed`: it creates or updates each project by slug, replaces its links, gallery and figures, keeps an existing publication date, and leaves projects absent from the file untouched. `pnpm dev` only seeds an empty database, so edits made in Studio survive restarts. After adding or changing a cover image, run `pnpm --filter web edges`.

Day-to-day edits go through the [admin panel](#admin-panel). `pnpm db:studio` stays available locally; never expose Studio as a public administration service.

### Project content contract

| Field                                     | Content                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `slug`, `title`, `summary`, `description` | Required. `summary` is one sentence; `description` is plain text, revealed word by word.  |
| `kind`                                    | `PRODUCT`, `FREELANCE`, `PERSONAL` or `SCHOOL`; shown as the project's kicker.            |
| `category`, `role`                        | Required, short: what the project is, and what I did.                                     |
| `client`                                  | Optional, for client work.                                                                |
| `startedOn`, `endedOn`                    | Dates; displayed as years. No `endedOn` means the project is ongoing ("Depuis 2026").     |
| `highlights`                              | Key points, one short sentence each.                                                      |
| `technologies`                            | Shown as compact tags.                                                                    |
| `imageUrl`, `imageAlt`                    | Cover, shown on the monitor and in the showcase hero. Landscape, about 16:9.              |
| `accentColor`                             | Six-digit hex color.                                                                      |
| `notice`                                  | Optional caveat shown above the links, e.g. a platform taken offline.                     |
| `featured`                                | Marks the project to highlight first.                                                     |
| `links`                                   | `WEBSITE`, `SOURCE`, `DOWNLOAD`, `VIDEO` or `COMMUNITY`, with a label and an HTTP(S) URL. |
| `media`                                   | Gallery screenshots after the cover, each with alt text and an optional caption.          |
| `metrics`                                 | Figures worth a glance: a short `value` ("10 000") and its `label` ("joueurs").           |

Projects default to `DRAFT`. To publish, set `status = PUBLISHED` **and** `publishedAt` to a current or past timestamp (the seed does both). Future timestamps remain hidden until that time; `ARCHIVED` and draft records never enter the public catalog. Ordering is `sortOrder` ascending, then newest `createdAt`, then `id` for stable ties. The public DTO excludes editorial status and internal timestamps. Database constraints check periods, URLs, colors and required text, and stay the final integrity boundary behind the admin panel's own validation.

## Admin panel

`/admin` manages the project catalog: create, edit, reorder, publish, archive and delete projects, with their links, gallery and figures, and a live preview. It is in French, like the site, and is never indexed.

### Signing in with passkeys

There is no password. The single administrator signs in with a **passkey** (WebAuthn), kept for example in Bitwarden, iCloud Keychain, Windows Hello or on a security key.

1. Set `ADMIN_ORIGIN` in `apps/web/.env` to the exact origin the site is served from, e.g. `https://example.com`. Passkeys are bound to its host name. Locally it defaults to `http://localhost:3000`; in production the panel stays closed until it is set.
2. On the server, run `pnpm admin:invite`. It prints a link that works once, for 15 minutes; generating a new one revokes the previous one.
3. Open the link, name the passkey and let your password manager create it. You are signed in.
4. From **Sécurité**, add a second passkey (a backup key) as soon as possible.

Lost every passkey? Run `pnpm admin:invite` again: shell access to the server is the recovery path.

### Security model

- **Authentication**: discoverable passkeys with user verification required (`@simplewebauthn/server`). Challenges are stored server side, tied to an HttpOnly cookie, single use and valid for 5 minutes. Signature counters are checked and updated atomically, so a replayed or cloned assertion is refused.
- **Sessions**: a random 256-bit token in an HttpOnly, `SameSite=Strict`, `__Host-` cookie (over HTTPS). Only its SHA-256 is stored, so a database leak does not leak sessions. Sessions end after 2 hours of inactivity or 12 hours at most, can be revoked from **Sécurité**, and disappear with the passkey that opened them.
- **Authorization**: every admin page and every Server Action calls `requireAdmin()`, which checks the session against the database. `src/proxy.ts` only redirects early; it is not the gate. Next.js rejects Server Action requests from another origin.
- **Input**: every write is validated with zod on the server (`src/lib/admin/project-form.ts`); URLs are restricted to `http(s)` or local `/public` paths, then the database CHECK constraints apply.
- **Abuse**: sign-in and enrollment are rate limited per address (in memory, so per server instance), and the number of pending challenges is capped.
- **Headers**: admin responses carry a nonce-based Content Security Policy, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `noindex` and `no-referrer`.
- **Audit**: sign-ins (successful or refused), passkey and session changes and every project change are listed in **Sécurité** with their address. Behind a reverse proxy, make sure it sets `X-Forwarded-For`.

Images are referenced by path (`/projects/<slug>/…` under `apps/web/public/`) or by HTTPS URL; there is no upload yet. Run `pnpm --filter web edges` after adding a cover image.

## Third-party assets and credits

The source code of this repository is licensed under the [MIT License](LICENSE). The following asset is **not** covered by the MIT License and keeps its own license:

- **3D model** — ["Computer Terminal"](https://skfb.ly/6vrwA) by [Chris Sweetwood](https://sketchfab.com/ChrisSweetwood), licensed under [Creative Commons Attribution-ShareAlike 4.0](http://creativecommons.org/licenses/by-sa/4.0/) (CC BY-SA 4.0).
  - Files: `apps/web/assets/models/computer_terminal.glb` (original) and `apps/web/public/models/computer-terminal.glb` (adapted).
  - Changes: backdrop planes removed, screen glass split into a separate primitive with remapped UVs, textures resized and converted to WebP. The adapted model is distributed under the same CC BY-SA 4.0 license.
  - The site credits the author in its footer.
