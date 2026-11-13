// Where the monitor stands as the story scrolls by: a few poses, laid out in
// screen space so that they suit any viewport, blended chapter after chapter.
// It carries the name in the bottom left corner in daylight (and comes to
// the front with the contact details when asked), comes closer as night
// falls, holds the statement up, takes the centre for the projects, steps
// back, and ends up low in the middle, carrying the invitation to talk.

import type { TheaterProgress } from "./theater-timeline";

export type StageLayout = "side" | "stacked";

/** Scroll progress of the story, chapter by chapter. */
export type StoryScroll = TheaterProgress & {
  /** 0 → 1 from the top of the page until the manifesto is pinned. */
  dusk: number;
  /** 0 → 1 while the manifesto is pinned. */
  manifesto: number;
  /** 0 → 1 as the contact chapter comes in. */
  ending: number;
};

export const storyStart: StoryScroll = {
  dusk: 0,
  manifesto: 0,
  intro: 0,
  project: -1,
  outro: 0,
  ending: 0,
};

export type Pose = {
  /** Centre of the glass, in normalized device coordinates (−1 → 1). */
  x: number;
  y: number;
  /** Height of the glass, as a share of the viewport's height. */
  size: number;
  /** Largest share of the viewport's width the glass may take. */
  width: number;
  /** Radians: yaw > 0 turns the glass to the right, pitch > 0 down. */
  yaw: number;
  pitch: number;
  /** Radians: roll > 0 leans the top to the left. */
  roll: number;
  /** Idle floating and response to the pointer, 0 → 1. */
  float: number;
};

type Poses = Record<
  | "hero"
  | "heroOpen"
  | "dusk"
  | "manifesto"
  | "manifestoEnd"
  | "projects"
  | "leave"
  | "contact",
  Pose
>;

// One pose a line, to compare them at a glance.
// prettier-ignore
const poses: Record<StageLayout, Poses> = {
  side: {
    // In the bottom left corner, where the title was, turned a little towards
    // the portrait.
    hero: { x: -0.45, y: -0.42, size: 0.32, width: 0.4, yaw: 0.24, pitch: -0.02, roll: 0.01, float: 0.5 },
    // In front, large and facing, for the contact details.
    heroOpen: { x: 0, y: -0.03, size: 0.6, width: 0.8, yaw: 0, pitch: 0, roll: 0, float: 0.15 },
    // Over the night transition: closer, almost facing the visitor.
    dusk: { x: 0.04, y: 0.02, size: 0.4, width: 0.5, yaw: -0.16, pitch: 0.02, roll: -0.04, float: 0.8 },
    // Centre stage, holding the statement up.
    manifesto: { x: 0, y: 0.02, size: 0.48, width: 0.55, yaw: -0.05, pitch: 0.02, roll: 0, float: 0.25 },
    manifestoEnd: { x: 0, y: 0.04, size: 0.47, width: 0.54, yaw: 0.05, pitch: 0, roll: 0, float: 0.25 },
    // Centre stage, closer than for the statement: the chapter zooms in on
    // the projects, their cards on either side.
    projects: { x: 0, y: 0.05, size: 0.56, width: 0.58, yaw: 0, pitch: 0, roll: 0, float: 0.3 },
    leave: { x: -0.2, y: 0.12, size: 0.3, width: 0.4, yaw: 0.25, pitch: 0.05, roll: -0.03, float: 0.8 },
    // Low in the middle, carrying the invitation.
    contact: { x: 0, y: -0.22, size: 0.44, width: 0.52, yaw: 0, pitch: -0.04, roll: 0, float: 0.4 },
  },
  stacked: {
    // Over the bottom of the portrait, where the name was.
    hero: { x: 0, y: -0.6, size: 0.26, width: 0.92, yaw: 0, pitch: -0.03, roll: 0, float: 0.4 },
    heroOpen: { x: 0, y: 0, size: 0.4, width: 0.98, yaw: 0, pitch: 0, roll: 0, float: 0.15 },
    dusk: { x: 0, y: 0.04, size: 0.24, width: 0.9, yaw: -0.15, pitch: 0.02, roll: -0.04, float: 0.8 },
    manifesto: { x: 0, y: 0.05, size: 0.28, width: 0.84, yaw: 0, pitch: 0, roll: 0, float: 0.25 },
    manifestoEnd: { x: 0, y: 0.08, size: 0.28, width: 0.84, yaw: 0.04, pitch: 0, roll: 0, float: 0.25 },
    projects: { x: 0, y: 0.26, size: 0.34, width: 0.9, yaw: 0, pitch: 0, roll: 0, float: 0.3 },
    leave: { x: 0, y: 0.4, size: 0.18, width: 0.6, yaw: 0.2, pitch: 0.05, roll: -0.03, float: 0.8 },
    contact: { x: 0, y: -0.5, size: 0.26, width: 0.92, yaw: 0, pitch: -0.03, roll: 0, float: 0.4 },
  },
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const ease = (value: number) => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;
// Progress of `value` across the window [start, end].
const span = (value: number, start: number, end: number) =>
  clamp01((value - start) / (end - start));

export function mixPose(from: Pose, to: Pose, amount: number): Pose {
  return {
    x: lerp(from.x, to.x, amount),
    y: lerp(from.y, to.y, amount),
    size: lerp(from.size, to.size, amount),
    width: lerp(from.width, to.width, amount),
    yaw: lerp(from.yaw, to.yaw, amount),
    pitch: lerp(from.pitch, to.pitch, amount),
    roll: lerp(from.roll, to.roll, amount),
    float: lerp(from.float, to.float, amount),
  };
}

/** Where the monitor stands at this point of the story. */
export function poseAt(
  story: StoryScroll,
  layout: StageLayout,
  contactOpen = false,
): Pose {
  const set = poses[layout];
  // Between projects it sways a little, sliding the reflections across.
  const projects = {
    ...set.projects,
    yaw: set.projects.yaw + Math.sin(story.project * 1.15) * 0.07,
    y: set.projects.y + Math.cos(story.project * 0.9) * 0.015,
  };
  let pose = contactOpen ? set.heroOpen : set.hero;
  pose = mixPose(pose, set.dusk, ease(span(story.dusk, 0, 0.55)));
  pose = mixPose(pose, set.manifesto, ease(span(story.dusk, 0.55, 1)));
  pose = mixPose(pose, set.manifestoEnd, story.manifesto);
  pose = mixPose(pose, projects, ease(story.intro));
  pose = mixPose(pose, set.leave, ease(story.outro));
  return mixPose(pose, set.contact, ease(story.ending));
}
