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
pnpm db:seed        # write prisma/seed-data.ts (projects, journey) into the database
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

In the projects chapter, the matrix draws the project's **logo** when it has one (always fitted whole, never cropped), and its cover otherwise. Logos and covers uploaded from the [admin panel](#images) get their edge map at upload time, stored next to the image (`<name>.edges.png`) and found by that naming convention, so they need no script run. Projects whose image has no edge map fall back to computing it in the browser (remote images need CORS headers). The portrait also gets a light color texture (`*-color.webp`, 960 px) used by the hero intro.

### 3D model

The monitor is a third-party model, adapted for the site by `apps/web/scripts/build-model.mjs`: it removes Sketchfab's backdrop planes, splits the screen glass into its own `Screen` primitive (UVs spanning 0–1, for the CRT shader) and re-encodes textures as WebP (3.9 MB → 0.34 MB). The source stays in `apps/web/assets/models/` (not served); rebuild after changing it:

```bash
pnpm --filter web model
```

## Journey page

`/parcours` tells the journey (studies, jobs, freelance work, projects) as a corridor in the dark, walked as the page scrolls. Its steps live in the `JourneyEntry` table, are edited from the admin panel (**Parcours**) and are ordered by start date; its copy lives in `apps/web/src/lib/journey-content.ts`. A step can link the published projects made during it, which open in the homepage's showcase (`/?projet=<slug>`), and each one has an anchor (`/parcours#<slug>`).

- **three.js** (`src/components/journey/journey-scene.ts`, loaded on demand) draws the world: a floor of square pixels fading into fog, the path (orange where it has been walked), a marker and a connector per step, floating dust, and a desk lamp that flickers on and lights the start of the path.
- **The steps stay HTML**, so they remain crisp, selectable and accessible: the scene places them in the same 3D space with CSS transforms computed from its camera (the CSS3DRenderer technique). Depth of field is a CSS blur growing with the distance to the step being read; steps ahead wait in the haze, steps already read fly past, blurred.
- Arrow keys and the side rail step through the journey. With reduced motion, without WebGL or without JavaScript, the steps read as a plain list.

The lamp is a third-party model, adapted by `apps/web/scripts/build-lamp-model.mjs`: transforms baked, one unit tall with its base on the origin, attributes quantized (`KHR_mesh_quantization`, read by three.js without a decoder), textures resized and re-encoded as WebP (3.3 MB → 0.4 MB). Rebuild after changing it:

```bash
pnpm --filter web model:lamp
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
| `logoUrl`                                 | Optional logo, drawn by the pixel matrix instead of the cover. Best on transparency.      |
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
- **Uploads**: see [Images](#images). The file's real type is read from its first bytes, the image is decoded and re-encoded, and its name is generated server side.
- **Abuse**: sign-in and enrollment are rate limited per address (in memory, so per server instance), and the number of pending challenges is capped.
- **Headers**: admin responses carry a nonce-based Content Security Policy, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `noindex` and `no-referrer`.
- **Audit**: sign-ins (successful or refused), passkey and session changes and every project change are listed in **Sécurité** with their address. Behind a reverse proxy, make sure it sets `X-Forwarded-For`.

### Images

In **Visuels**, the cover, the logo and each screenshot have an **Importer** button, and accept an image dropped on them; **Importer des captures** (or a drop on the gallery) adds several screenshots at once. The field is filled in, the thumbnail and the live preview follow, and the project still has to be saved. A path under `apps/web/public/` or an HTTPS URL can still be typed instead.

The upload is a Server Action (`src/app/admin/_actions/uploads.ts`, then `src/lib/admin/uploads.ts`):

1. `requireAdmin()` runs first; Next.js rejects calls from another origin.
2. PNG, JPEG or WebP only, recognized by their magic bytes and confirmed by the decoder (a GIF or a renamed file is refused); logos may also be SVG, without DTD entities, rasterized on the server so the SVG itself is never stored or served. 8 MB and 50 megapixels at most. `next.config.ts` raises the Server Action body limit to 9 MB for this, for every Server Action.
3. sharp applies the EXIF orientation, fits the image within 2400 px (1024 px for a logo) and re-encodes it to WebP, which drops EXIF (GPS included), ICC and XMP metadata.
4. The file is stored as `projects/<slug>/<24 random hex>.webp`: the slug must match `^[a-z0-9]+(-[a-z0-9]+)*$`, and nothing else from the client reaches the path. Uploading needs a valid slug; an image keeps its folder if the slug changes later.
5. A logo or a cover also gets its pixel-matrix edge map, `<same name>.edges.png`, used by the site without running `pnpm --filter web edges`; the admin shows the logo's next to it. A logo is trimmed and given a margin, and a transparent one is laid on the background that contrasts with its ink, so a white logo still has an outline. Images that are neither uploaded nor listed by that script still fall back to the browser.

Uploads are logged in the audit trail. Replaced or removed images are not deleted.

#### Storage in production

By default images are written to `apps/web/public/projects/<slug>/`. That suits a server with a persistent disk: `next start` only serves the `public/` files present when it started, so `src/app/projects/[slug]/[file]/route.ts` serves the newer uploads (generated names only) until the next restart. In development, commit the uploaded files like any other project image.

On a host whose filesystem is ephemeral or read-only (serverless, most containers), use an S3-compatible bucket (AWS S3, Cloudflare R2, Scaleway, MinIO…) instead:

```bash
UPLOAD_STORAGE="s3"
S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com"  # path-style requests
S3_REGION="auto"                                          # e.g. "eu-west-3" on AWS
S3_BUCKET="portfolio-images"
S3_ACCESS_KEY_ID="…"                                      # write access to this bucket only
S3_SECRET_ACCESS_KEY="…"
S3_PUBLIC_URL="https://images.example.com"                # public base URL of the bucket
```

Objects are written with a one-year immutable `Cache-Control` and saved in the project as `https://` URLs, which the admin CSP already allows (`img-src https:`). For the pixel matrix to read an edge map from another origin, the bucket must send CORS headers allowing `GET` from the site's origin.

## Third-party assets and credits

The source code of this repository is licensed under the [MIT License](LICENSE). The following assets are **not** covered by the MIT License and keep their own licenses:

- **3D model** — ["Computer Terminal"](https://skfb.ly/6vrwA) by [Chris Sweetwood](https://sketchfab.com/ChrisSweetwood), licensed under [Creative Commons Attribution-ShareAlike 4.0](http://creativecommons.org/licenses/by-sa/4.0/) (CC BY-SA 4.0).
  - Files: `apps/web/assets/models/computer_terminal.glb` (original) and `apps/web/public/models/computer-terminal.glb` (adapted).
  - Changes: backdrop planes removed, screen glass split into a separate primitive with remapped UVs, textures resized and converted to WebP. The adapted model is distributed under the same CC BY-SA 4.0 license.
  - The site credits the author in its footer.
- **3D model** — ["Desk lamp"](https://sketchfab.com/3d-models/desk-lamp-b9458e04d30e4b6284d46d35880a9b95) by [HASSAN](https://sketchfab.com/7ASSAN), licensed under [Creative Commons Attribution 4.0](http://creativecommons.org/licenses/by/4.0/) (CC BY 4.0).
  - Files: `apps/web/assets/models/desk_lamp.glb` (original) and `apps/web/public/models/desk-lamp.glb` (adapted).
  - Changes: transforms baked, rescaled, attributes quantized, textures resized and converted to WebP.
  - The /parcours page credits the author below the timeline.
