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

Install dependencies from the workspace root:

```bash
pnpm install
```

Copy `.env.example` to `apps/web/.env` and set `DATABASE_URL` to your PostgreSQL connection string. The application reads this file through Next.js; Prisma also accepts a root `.env` for CLI usage. No connection string is hardcoded. Start the development server with:

```bash
pnpm dev
```

The web application lives in `apps/web` and can also be run from that directory with `pnpm dev`.

## Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm format:check
```

## Story and animation

The page reads as one scroll-driven story; its copy lives in `apps/web/src/lib/site-content.ts`.

1. **Hero** — portrait and interactive pixel matrix (light, editorial).
2. **Manifesto** — after a light-to-night gradient, the statement lights up word by word as you scroll.
3. **Terminal** — a procedural three.js CRT (loaded on demand) powers on, boots, and switches channel for each project as the page scrolls. The screen is a 2D canvas texture (a small retro desktop) rendered through a curved-glass shader: barrel distortion, light radial chromatic aberration, scanlines, aperture grille, glitch on channel change, line-then-open power cycle. A `RectAreaLight` tinted by the displayed image lights the keyboard and desk. Behind the canvas, the pixel matrix redraws the active project from its edge map. Arrow keys, the side rail and previous/next buttons scroll to a given project; each opens an accessible native dialog.
4. **Contact** — the monitor switches off and the matrix redraws the portrait from its edge map.

Reduced-motion preferences make power changes and project switches instant and remove glitches, camera drift and blur. Without WebGL, the project image is shown in a CSS monitor frame.

### Pixel-matrix edge maps

The matrix draws images from precomputed edge maps: gradient magnitude of a derivative-of-Gaussian filter (separable kernels, percentile normalization), stored as small grayscale PNGs in `apps/web/public/matrix/` and indexed in `apps/web/src/lib/edge-maps.json` by image URL. Generate them once, after adding or changing an image:

```bash
pnpm --filter web edges                         # public/projects/* and the portrait
pnpm --filter web edges public/projects/new.png # specific files under public/
pnpm --filter web edges https://example.com/cover.jpg
```

Projects whose image has no edge map fall back to computing it in the browser (remote images need CORS headers).

## Project catalog

The terminal chapter reads published projects from PostgreSQL on the server. `GET /api/projects` exposes the same public catalog with a `source` field (`database` or `demo`), without caching database failures. There are no public write endpoints or administrator panel yet.

- Missing or unreachable database: four **clearly labeled fictional examples**, using locally stored SVG artwork, are displayed. They are never inserted into PostgreSQL. A failed database read is reported server-side without logging credentials.
- Connected but empty database (or only drafts): an intentional empty state is shown, **not** fabricated projects.

### Database setup and migrations

Use an existing PostgreSQL database or provision one with your hosting provider, then configure `apps/web/.env`. With `DATABASE_URL` set:

```bash
pnpm --filter web db:validate
pnpm --filter web db:migrate
pnpm --filter web db:generate
```

`db:migrate` applies the versioned initial migration in `apps/web/prisma/migrations`. It creates the `Project` table, publication enum, unique slug, sorting index, and data-integrity constraints. It does not reset data or insert examples. Client generation also runs automatically before `dev` and `build` and does not require a database connection.

For future schema changes, use `pnpm --filter web db:migrate:dev --name your_change` against a development database (Prisma may require shadow-database privileges). Use `db:migrate` in deployment setup; do not use `db push` in production.

Until the future authenticated administrator panel exists, maintain records locally with `pnpm --filter web db:studio`. Never expose Studio as a public administration service.

### Project content contract

Required content: unique `slug`, `title`, `summary`, plain-text `description`, `category`, `role`, and `year`. `technologies` is a string array. Optional `imageUrl` and `imageAlt` describe the preview; a landscape image with an **8:5 ratio** works best. Use local `/projects/...` assets or HTTP(S) images. Images are rendered directly in HTML and no longer require WebGL/CORS texture access; a local cover is retained if loading fails. `liveUrl` and `sourceUrl` accept HTTP(S) URLs only. `accentColor` is a six-digit hex color.

Projects default to `DRAFT`. To publish, set `status = PUBLISHED` **and** `publishedAt` to a current or past timestamp. Future timestamps remain hidden until that time; `ARCHIVED` and draft records never enter the public catalog. Ordering is `sortOrder` ascending, then newest `createdAt`, then `id` for stable ties. All published projects are returned. The public DTO excludes editorial status and internal timestamps.

The future admin panel should validate field lengths, URLs, color, year, and publication state before writing, and enforce authentication/authorization on every mutation. Database constraints provide the final integrity boundary.
