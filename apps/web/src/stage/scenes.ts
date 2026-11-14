import { Fireflies } from "./layers/fireflies";
import { Grass } from "./layers/grass";
import type { Scene } from "./world";

// The scenes of the backdrop, the matrix behind the page. A scene only says
// which layers live in it; their colours come from the mood set alongside.
// The hero has a scene of its own (see `hero-scene.ts`).

/** Contact: the hero's meadow after dark, lit by fireflies. */
export const duskScene: Scene = [
  {
    key: "night-grass",
    create: (frame) => new Grass(frame, { height: 0.19, warmth: 0.35 }),
  },
  {
    key: "fireflies",
    create: (frame) => new Fireflies(frame),
  },
];
