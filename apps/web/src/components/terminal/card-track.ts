// Where the project cards stand as the chapter scrolls by. They slide from
// right to left behind the monitor, one per project: the next one waits on
// the right, the last one leaves on the left. As the whole row moves across,
// each card grows as it nears the glass, which hides it and shows its project
// instead, and shrinks as it moves away. Shared by the cards (HTML) and by the
// glass, which shows them in x-ray as they pass behind it.

import type { StageLayout } from "./monitor-path";
import { channelRest } from "./theater-timeline";

export type CardTrack = {
  /** From one card to the next, in normalized device coordinates. */
  spacing: number;
  /** Height of the track, in normalized device coordinates. */
  y: number;
  /** Height of a card at rest, as a share of the viewport's height. */
  size: number;
};

// Behind the glass on wide screens, far enough out to clear most of the
// monitor (see the projects pose in monitor-path.ts); below it on phones.
export const cardTracks: Record<StageLayout, CardTrack> = {
  side: { spacing: 0.84, y: 0, size: 0.2 },
  stacked: { spacing: 0.8, y: -0.55, size: 0.15 },
};

/** Cards are 16:10. */
export const cardAspect = 1.6;

export type CardPlacement = {
  /** Centre, in normalized device coordinates. */
  x: number;
  y: number;
  /** Height, as a share of the viewport's height. */
  height: number;
  /** Distance from the middle, in channels. */
  away: number;
  /** 1 on either side, 0 in the middle (behind the glass) and beyond. */
  opacity: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
};

/** Height of a card `away` channels from the middle, as a share of the viewport's. */
export const cardHeight = (away: number, layout: StageLayout) =>
  cardTracks[layout].size * (0.62 + 0.68 * (1 - smoothstep(0.45, 1.6, away)));

/** Where card `index` stands while the chapter is at `project` (see TheaterProgress). */
export function placeCard(
  project: number,
  index: number,
  layout: StageLayout,
): CardPlacement {
  const track = cardTracks[layout];
  // Positive once the card has passed the middle, towards the left.
  const place = project - index - channelRest;
  const away = Math.abs(place);
  return {
    x: -place * track.spacing,
    y: track.y,
    height: cardHeight(away, layout),
    away,
    opacity: (1 - smoothstep(1.2, 1.6, away)) * smoothstep(0.25, 0.6, away),
  };
}

/** How present the cards are: they come with the monitor and leave with it. */
export const deckPresence = (intro: number, outro: number) =>
  smoothstep(0.1, 0.6, intro) * (1 - smoothstep(0.1, 0.5, outro));
