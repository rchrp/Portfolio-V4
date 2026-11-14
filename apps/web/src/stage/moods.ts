import {
  hexToRgb,
  hslToRgb,
  lerp,
  luminance,
  mixRgb,
  rgbToHsl,
  type RGB,
} from "./math";
import type { Palette } from "./world";

// The mood of the matrix: its paper, its resting dots, the light the pointer
// carries and the colours figures are drawn with. The stage eases from one
// mood to the next, so sections blend into each other.

export type Mood = Palette & {
  /** Resting dots: colour, opacity, size as a fraction of the cell. */
  rest: RGB;
  restAlpha: number;
  restSize: number;
  /** How much the resting dots swell and ebb, 0 to 1. */
  breath: number;
  /** Colour resting dots take under the pointer's light. */
  light: RGB;
  /** Colour the paper leans to under the pointer, and how much. */
  bloom: RGB;
  bloomAmount: number;
  /** Colour and strength of the scene's own pool of light. */
  halo: RGB;
  haloAmount: number;
};

export const PAPER: RGB = [246, 240, 231];
export const INK: RGB = [43, 27, 17];
export const ORANGE: RGB = [241, 90, 36];
export const NIGHT: RGB = [24, 14, 9];

/** Hero: a meadow at golden hour. */
export const goldenMood: Mood = {
  bg: PAPER,
  ink: [58, 33, 20],
  accent: ORANGE,
  accent2: [156, 82, 38],
  pale: [250, 196, 148],
  rest: [122, 82, 56],
  restAlpha: 0.2,
  restSize: 0.2,
  breath: 0.25,
  light: ORANGE,
  bloom: [255, 222, 190],
  bloomAmount: 0.55,
  halo: [244, 150, 84],
  haloAmount: 1,
};

/** Reading sections and the project list: the matrix steps back. */
export const quietMood: Mood = {
  bg: PAPER,
  ink: [58, 33, 20],
  accent: [128, 96, 76],
  accent2: [92, 68, 54],
  pale: [206, 190, 176],
  rest: [96, 80, 70],
  restAlpha: 0.15,
  restSize: 0.18,
  breath: 0.7,
  light: [120, 84, 62],
  bloom: [255, 232, 212],
  bloomAmount: 0.4,
  halo: [244, 150, 84],
  haloAmount: 0,
};

/** Between the page and its last section: the sky, for a moment, at sunset. */
export const sunsetMood: Mood = {
  bg: [232, 150, 96],
  ink: [84, 40, 22],
  accent: [255, 214, 160],
  accent2: [150, 70, 36],
  pale: [255, 232, 196],
  rest: [124, 56, 28],
  restAlpha: 0.2,
  restSize: 0.19,
  breath: 0.6,
  light: [255, 236, 200],
  bloom: [255, 196, 136],
  bloomAmount: 0.5,
  halo: [244, 150, 84],
  haloAmount: 0,
};

/** Contact: the same meadow, after dark. */
export const nightMood: Mood = {
  bg: NIGHT,
  ink: [94, 58, 38],
  accent: [255, 148, 66],
  accent2: [176, 92, 44],
  pale: [255, 230, 184],
  rest: [214, 150, 104],
  restAlpha: 0.11,
  restSize: 0.17,
  breath: 0.4,
  light: [255, 150, 74],
  bloom: [104, 54, 24],
  bloomAmount: 0.6,
  halo: [244, 150, 84],
  haloAmount: 0,
};

/**
 * The mood of one project: the site's paper leaning towards the project's
 * colour, and figures drawn in it. Light colours are deepened so they hold
 * on the paper.
 */
export function projectMood(accentHex: string): Mood {
  const raw = hexToRgb(accentHex);
  const [h, s, l] = rgbToHsl(raw);
  const accent = hslToRgb(h, Math.min(0.92, s), Math.min(l, 0.5));
  const accent2 = hslToRgb(
    (h + 0.96) % 1,
    Math.min(0.8, s),
    Math.min(l, 0.5) * 0.62,
  );
  const pale = hslToRgb(h, Math.min(0.85, s), 0.82);
  return {
    bg: mixRgb(PAPER, raw, 0.07),
    ink: mixRgb(INK, accent, 0.22),
    accent,
    accent2,
    pale,
    rest: mixRgb([96, 80, 70], accent, 0.45),
    restAlpha: 0.17,
    restSize: 0.18,
    breath: 0.45,
    light: accent,
    bloom: mixRgb([255, 255, 255], raw, luminance(raw) > 0.6 ? 0.3 : 0.18),
    bloomAmount: 0.5,
    halo: accent,
    haloAmount: 0,
  };
}

const colorKeys = [
  "bg",
  "ink",
  "accent",
  "accent2",
  "pale",
  "rest",
  "light",
  "bloom",
  "halo",
] as const;
const numberKeys = [
  "restAlpha",
  "restSize",
  "breath",
  "bloomAmount",
  "haloAmount",
] as const;

export const cloneMood = (mood: Mood): Mood => ({
  ...mood,
  bg: [...mood.bg],
  ink: [...mood.ink],
  accent: [...mood.accent],
  accent2: [...mood.accent2],
  pale: [...mood.pale],
  rest: [...mood.rest],
  light: [...mood.light],
  bloom: [...mood.bloom],
  halo: [...mood.halo],
});

/** Moves `current` towards `target` by `amount` (0 to 1), in place. */
export function approachMood(current: Mood, target: Mood, amount: number) {
  for (const key of colorKeys) {
    const from = current[key];
    const to = target[key];
    from[0] = lerp(from[0], to[0], amount);
    from[1] = lerp(from[1], to[1], amount);
    from[2] = lerp(from[2], to[2], amount);
  }
  for (const key of numberKeys) {
    current[key] = lerp(current[key], target[key], amount);
  }
}

/** A blend of two moods, for sections that fade into each other. */
export function blendMoods(from: Mood, to: Mood, amount: number): Mood {
  const mood = cloneMood(from);
  approachMood(mood, to, amount);
  return mood;
}
