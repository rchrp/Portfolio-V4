import type { Mood } from "./moods";
import type { Scene } from "./world";

// What the page currently asks of the stage beyond its scroll position.
// Components write here; the home director reads it every frame.
export const direction = {
  /** A project is open: its mood and scene take over the whole stage. */
  project: null as { mood: Mood; scene: Scene | null } | null,
};
