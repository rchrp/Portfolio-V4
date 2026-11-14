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

## Home page

The home page is one scroll: who I am, the projects, and how to reach me. Its copy lives in `apps/web/src/lib/site-content.ts`.

Behind everything, one canvas stays fixed to the screen: **the stage** (`apps/web/src/stage/`, mounted by `src/components/stage/stage.tsx`). It owns a single WebGL2 context and a single animation loop.

### What the stage draws

- **The pixel matrix** — a grid of square cells covering the viewport (5 to 7 px apart). `cells.ts` holds one record per cell (a level from resting dot to full square, and a colour) and packs it into a texture: one texel per cell. `matrix-layer.ts` draws the whole grid with one fragment shader, which also computes the resting dots, their slow breathing, the pointer's light and the rings that run through the dots (`pulse`). An idle matrix costs one texture read per pixel and nothing on the CPU.
- **What lives in it** — figures are not sprites laid over the grid. `world.ts` runs small simulations (fixed 60 Hz steps) whose shapes are *sampled by the cells*: a hummingbird is an implicit shape tested at each cell's centre plus four taps, so a cell half covered grows half way. Layers live in `stage/layers/`: `grass.ts` (a meadow, wind, the pointer brushing through), `hummingbirds.ts`, `koi.ts` (a chain of joints, rasterised from distances to its spine), `birds.ts` (a murmuration), `fireflies.ts`, and `name-relief.ts` (a word standing in relief, its sides thrown away from the pointer's light). Cells grow fast and fade slowly, which leaves a pale wake behind anything that passes.
- **The portrait** — `portrait-layer.ts`. At rest it is the photograph itself. The photograph is also sampled once per cell, and each sample is a square that can take over from the patch of picture it stands for: under the pointer the picture gives way to its squares, which are swept along the pointer's path, glide, and are brought home by a spring. The same squares tell how the portrait arrives: they condense out of the resting dots, then sharpen into the photograph.
- **Pictures** — `cards-layer.ts` draws project covers, screenshots and the hero's own card as planes placed on a roller or bent around an axis. A picture resolves out of matrix-sized cells while it loads in.
- **Glass** — `glass-layer.ts`, last: see below.

There are two matrices (`matrix-scene.ts`): the **hero's** (`hero-scene.ts`: meadow, hummingbirds, the first name in relief, the portrait) and the **backdrop** behind the rest of the page. The hero is drawn straight to the screen while it fills it, and into a picture of its own once it starts leaving, so that it can become a card.

### The story the page tells

The page tells the stage what to show through **directors**: callbacks run at the start of each frame that read where the page is scrolled (`src/components/home-director.tsx`, `src/components/projects/projects.tsx`). A **mood** (`stage/moods.ts`: paper, resting dots, light, figure colours) and a **scene** (which layers are alive) are eased from one section to the next, so nothing cuts.

1. **Arrival** — the page opens on bare dots. A ring runs through them from where the face will be; the first name rises out of the grid letter by letter, the portrait condenses from pixels then sharpens into the photograph, the meadow grows, the hummingbirds fly in. The words come last.
2. **Hero** — the first name, a sentence and two actions, over a meadow at golden hour. The pointer is a light: it turns the name's relief and lifts the dots around it, and it brushes the portrait apart.
3. **From one to many** — scrolling, the whole hero draws back, shrinks to a card and turns away on a roller as the first project comes round (`stage/carousel.ts`): the person becomes the first card of the work.
4. **Projects** — a roller standing upright, turned by the scroll, which settles on one project at a time (`lenis/snap`). The cover in focus faces the reader; its neighbours have turned away and wrap around the roller. Beside it, only the list of names, the one in focus inked in. On narrow screens the covers travel along a row instead, clear of the list.
5. **A project** — clicking the cover or its name (`?projet=<slug>`, so links and the back button work) sends a ring through the matrix, brings the cover forward and flattens it into the project's page: facts, story, figures, screenshots on a strip wrapped around a cylinder. The matrix takes the project's colour and a world of its own (`src/lib/project-worlds.ts`).
6. **Contact** — the sky turns to sunset, then to night: the hero's meadow again, lit by fireflies. The invitation arrives once it is dark, one way to answer after another.
7. **Elsewhere** — leaving for `/parcours`, the page sinks into the dark that page opens on.

Text always wins over the matrix: blocks marked `data-calm` are passed to the grid shader, which fades figures and the pointer's light behind them. Controls that float over the matrix are panes of liquid glass (`.glass`); each screen keeps one solid button. The stage draws the glass itself (`stage/glass-layer.ts`): under each pane, the picture just drawn is copied and drawn back bent along the rim, softened, its colours slightly parted. `backdrop-filter` would do part of this, but over a canvas that changes every frame it cost one frame in six here; in the stage it is one small copy and one quad per pane, in every browser.

### Without WebGL, or with reduced motion

- `data-stage` on the root element says whether the stage runs. When it cannot (`off`), sections bring back plain backgrounds, the name is a heading and the portrait a picture, the list of projects follows the scroll and shows the cover in focus as an image, and screenshots scroll sideways.
- With `prefers-reduced-motion`, the stage draws stills: scenes are simulated ahead for a few seconds, then a frame is drawn only when something changes (scroll, resize, a project opening). Smooth scrolling and CSS animations are off.
- The loop pauses with the tab, drops to every other frame when only the resting dots breathe, and lowers its resolution if frames keep coming in late.

### Pixel-matrix edge maps

The admin panel still computes an edge map for each uploaded logo or cover (`<name>.edges.png`), and `pnpm --filter web edges` does the same for local images. The home page no longer draws them: the matrix now shows pictures in full colour rather than their outlines.

## Journey page

`/parcours` tells the journey (studies, jobs, freelance work, projects) as a corridor in the dark, walked as the page scrolls. Its steps live in the `JourneyEntry` table, are edited from the admin panel (**Parcours**) and are ordered by start date; its copy lives in `apps/web/src/lib/journey-content.ts`. A step can link the published projects made during it, which open in their page on the home page (`/?projet=<slug>`), and each one has an anchor (`/parcours#<slug>`).

- **three.js** (`src/components/journey/journey-scene.ts`, loaded on demand) draws the world: a floor of square pixels fading into fog, the path (orange where it has been walked), a marker and a connector per step, floating dust, and a desk lamp that flickers on and lights the start of the path.
- **The steps stay HTML**, so they remain crisp, selectable and accessible: the scene places them in the same 3D space with CSS transforms computed from its camera (the CSS3DRenderer technique). Depth of field is a CSS blur growing with the distance to the step being read; steps ahead wait in the haze, steps already read fly past, blurred.
- Arrow keys and the side rail step through the journey. With reduced motion, without WebGL or without JavaScript, the steps read as a plain list.

The lamp is a third-party model, adapted by `apps/web/scripts/build-lamp-model.mjs`: transforms baked, one unit tall with its base on the origin, attributes quantized (`KHR_mesh_quantization`, read by three.js without a decoder), textures resized and re-encoded as WebP (3.3 MB → 0.4 MB). Rebuild after changing it:

```bash
pnpm --filter web model:lamp
```

## Project catalog

The projects section reads published projects, with their links, gallery and figures, from PostgreSQL on the server. `GET /api/projects` exposes the same public catalog with a `source` field (`database` or `demo`), without caching database failures. Projects are edited in the [admin panel](#admin-panel); there are no public write endpoints.

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
| `slug`, `title`, `summary`, `description` | Required. `summary` is one sentence; `description` is plain text.                         |
| `kind`                                    | `PRODUCT`, `FREELANCE`, `PERSONAL` or `SCHOOL`; shown as the project's kicker.            |
| `category`, `role`                        | Required, short: what the project is, and what I did.                                     |
| `client`                                  | Optional, for client work.                                                                |
| `startedOn`, `endedOn`                    | Dates; displayed as years. No `endedOn` means the project is ongoing ("Depuis 2026").     |
| `highlights`                              | Key points, one short sentence each.                                                      |
| `technologies`                            | Shown as compact tags.                                                                    |
| `imageUrl`, `imageAlt`                    | Cover, shown in the carousel and at the top of the project's page. Landscape, 16:9.       |
| `logoUrl`                                 | Optional logo. Kept with the project; the home page does not display it at the moment.    |
| `accentColor`                             | Six-digit hex color: tints the matrix and its figures on the project's page.              |
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

- **3D model** — ["Desk lamp"](https://sketchfab.com/3d-models/desk-lamp-b9458e04d30e4b6284d46d35880a9b95) by [HASSAN](https://sketchfab.com/7ASSAN), licensed under [Creative Commons Attribution 4.0](http://creativecommons.org/licenses/by/4.0/) (CC BY 4.0).
  - Files: `apps/web/assets/models/desk_lamp.glb` (original) and `apps/web/public/models/desk-lamp.glb` (adapted).
  - Changes: transforms baked, rescaled, attributes quantized, textures resized and converted to WebP.
  - The /parcours page credits the author below the timeline.
