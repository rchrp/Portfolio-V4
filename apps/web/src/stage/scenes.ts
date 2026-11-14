import { direction } from "./direction";
import { Fireflies } from "./layers/fireflies";
import { Grass } from "./layers/grass";
import { NameRelief } from "./layers/name-relief";
import type { Scene } from "./world";

// The scenes of the backdrop, the matrix behind the page. A scene only says
// which layers live in it; their colours come from the mood set alongside.
// The hero has a scene of its own (see `hero-scene.ts`).

/**
 * The journey: the year in focus stands in the matrix, in relief as the
 * first name does in the hero, its sides in the same orange.
 */
export const journeyScene: Scene = [
  {
    key: "journey-year",
    create: () =>
      new NameRelief({
        text: () => direction.journey.year,
        rect: () => direction.journey.rect,
        rise: () => direction.journey.shown,
        // Years are not all as wide: they keep the size of the widest.
        measure: "2000",
        face: 0.78,
        sides: [
          [241, 90, 36],
          [176, 62, 24],
        ],
      }),
  },
];

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
