import { Butterflies } from "./layers/butterflies";
import { Fireflies } from "./layers/fireflies";
import { Grass } from "./layers/grass";
import type { LayerSpec, Scene } from "./world";

// The scenes of the home page. A scene only says which layers live in the
// matrix; their colours come from the mood set alongside it.

const meadowGrass: LayerSpec = {
  key: "meadow-grass",
  create: (frame) => new Grass(frame, { height: 0.15 }),
};

const butterflies: LayerSpec = {
  key: "butterflies",
  create: (frame) =>
    new Butterflies(frame, { count: frame.width < 700 ? 3 : 5, course: 24 }),
};

const nightGrass: LayerSpec = {
  key: "night-grass",
  create: (frame) => new Grass(frame, { height: 0.17, warmth: 0.35 }),
};

const fireflies: LayerSpec = {
  key: "fireflies",
  create: (frame) => new Fireflies(frame),
};

/** Hero: a meadow at golden hour, a few butterflies passing. */
export const meadowScene: Scene = [meadowGrass, butterflies];

/** Past the hero: the butterflies carry on, the meadow stays behind. */
export const driftScene: Scene = [butterflies];

/** Contact: the meadow after dark, lit by fireflies. */
export const duskScene: Scene = [nightGrass, fireflies];
