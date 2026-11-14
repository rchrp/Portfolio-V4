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
};
