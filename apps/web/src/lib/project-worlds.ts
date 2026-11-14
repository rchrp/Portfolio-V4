import type { Project } from "@/lib/projects";
import { Murmuration } from "@/stage/layers/birds";
import { Butterflies } from "@/stage/layers/butterflies";
import { Fireflies } from "@/stage/layers/fireflies";
import { Grass } from "@/stage/layers/grass";
import { KoiPond } from "@/stage/layers/koi";
import { projectMood, type Mood } from "@/stage/moods";
import type { Scene } from "@/stage/world";

// Each project has a world of its own in the matrix: the same grid, in the
// project's colour, with something alive in it.

type WorldKind = "butterflies" | "koi" | "birds" | "fireflies" | "meadow";

const scenes: Record<WorldKind, Scene> = {
  butterflies: [
    {
      key: "world-butterflies",
      create: (frame) =>
        new Butterflies(frame, {
          count: frame.width < 700 ? 3 : 6,
          course: 18,
        }),
    },
  ],
  koi: [{ key: "world-koi", create: (frame) => new KoiPond(frame) }],
  birds: [{ key: "world-birds", create: (frame) => new Murmuration(frame) }],
  fireflies: [
    { key: "world-fireflies", create: (frame) => new Fireflies(frame) },
  ],
  meadow: [
    {
      key: "world-grass",
      create: (frame) => new Grass(frame, { height: 0.2, warmth: 0.9 }),
    },
    {
      key: "world-butterflies-few",
      create: (frame) => new Butterflies(frame, { count: 2, course: 30 }),
    },
  ],
};

/** Worlds chosen for the projects of the catalog. */
const chosen: Record<string, WorldKind> = {
  blame: "birds",
  "amazon-analyzer": "butterflies",
  finvio: "koi",
  finalyzing: "fireflies",
  "atelier-sophie-sylvestre": "butterflies",
  neurastock: "koi",
  "gt3-event": "birds",
  minishell: "meadow",
  grossify: "meadow",
};

const kinds = Object.keys(scenes) as WorldKind[];

// A project added later gets a world too, always the same one.
function fallbackKind(slug: string): WorldKind {
  let hash = 0;
  for (const character of slug) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return kinds[hash % kinds.length];
}

const moods = new Map<string, Mood>();

export function projectWorld(project: Project): { mood: Mood; scene: Scene } {
  let mood = moods.get(project.accentColor);
  if (!mood) {
    mood = projectMood(project.accentColor);
    moods.set(project.accentColor, mood);
  }
  return {
    mood,
    scene: scenes[chosen[project.slug] ?? fallbackKind(project.slug)],
  };
}
