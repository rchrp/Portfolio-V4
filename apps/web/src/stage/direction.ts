import type { ReliefRect } from "./layers/name-relief";
import type { Mood } from "./moods";
import type { Scene } from "./world";

// What the page currently asks of the stage beyond its scroll position.
// Components write here; the home director reads it every frame.
export const direction = {
  /** A project is open: its mood and scene take over the backdrop. */
  project: null as { mood: Mood; scene: Scene | null } | null,
  /** Where the story's carousel stands. */
  story: {
    /** 0 is the hero, 1 the first project, and so on. */
    position: 0,
    /** How far the open project's cover has come forward, 0 to 1. */
    opened: 0,
  },
  /** The journey: the year in focus, and where it stands in the matrix. */
  journey: {
    year: "",
    /** How much of the section is left to see, 0 to 1. */
    shown: 1,
    /** In viewport pixels; null while the section is off screen. */
    rect: null as ReliefRect | null,
  },
};
