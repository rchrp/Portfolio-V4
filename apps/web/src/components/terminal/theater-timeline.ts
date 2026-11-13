// Scroll budget of the projects chapter, in viewport heights: the monitor
// comes forward and holds the chapter's title, one channel per project, then
// it steps back. Shared by the chapter's HTML and by the monitor's stage,
// which read the same scroll.

export const INTRO = 2;
export const OUTRO = 0.9;
// The monitor comes forward over the first part of the intro; the title then
// holds the glass until the first project slides in.
const ARRIVAL = 1.2;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/** How far past the glass's switch a project rests, in channels. */
export const channelRest = 0.35;

/** Where each channel rests, in viewport heights from the top of the chapter. */
export const channelStop = (index: number) => INTRO + index + channelRest;

/** Where the chapter's title rests on the glass, one channel before the first project. */
export const titleStop = channelStop(-1);

export type TheaterProgress = {
  /** 0 → 1 while the monitor comes forward. */
  intro: number;
  /**
   * Continuous project position: 1.5 is halfway through the second project,
   * negative during the intro. Project `i` reaches the glass at `i`.
   */
  project: number;
  /** 0 → 1 while the monitor steps back after the last project. */
  outro: number;
};

/** Progress of the chapter once `steps` viewport heights have been scrolled. */
export function theaterProgress(steps: number, count: number): TheaterProgress {
  return {
    intro: clamp(steps / ARRIVAL, 0, 1),
    project: clamp(steps - INTRO, -INTRO, count + OUTRO),
    outro: clamp((steps - INTRO - count) / OUTRO, 0, 1),
  };
}

/** The glass shows the projects from the end of the intro to mid-outro. */
export const showsProjects = (
  { project, outro }: TheaterProgress,
  count: number,
) => count > 0 && project >= 0 && outro < 0.5;
