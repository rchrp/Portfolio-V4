// The chapters the monitor carries on its glass: the name and the contact
// details in the hero, the statement in the manifesto, the invitation at the
// end. Each card is drawn in the screen's units and declares the regions a
// visitor can click, which the page covers with real links and buttons.

export const palette = {
  phosphor: "#ece8da",
  soft: "rgba(236, 232, 218, 0.8)",
  faded: "rgba(236, 232, 218, 0.78)",
  dim: "#8d8a7f",
  hairline: "rgba(236, 232, 218, 0.24)",
  glassTint: "rgba(12, 11, 9, 0.45)",
  night: "#0c0b09",
  accent: "#f15a24",
};

export type CardAction = { id: string; label: string };

export type HeroCard = {
  firstName: string;
  lastName: string;
  /** The first one is the main action. */
  actions: CardAction[];
};

export type ContactRow = {
  /** Region of the value, a link. */
  id: string;
  label: string;
  value: string;
  /** Copied with its own button, or opened with the whole row. */
  action: { kind: "copy"; id: string } | { kind: "open" };
};

export type ContactCard = {
  kicker: string;
  close: CardAction;
  rows: ContactRow[];
};

export type ManifestoCard = {
  kicker: string;
  /** Words wrapped in *asterisks* are highlighted with the accent color. */
  text: string;
  disciplines: { label: string; detail: string }[];
};

export type CtaCard = {
  kicker: string;
  aside: string;
  title: [string, string];
  lead: string;
  actions: CardAction[];
};

export type ScreenCard =
  | { kind: "hero"; card: HeroCard }
  | { kind: "contact"; card: ContactCard }
  | { kind: "manifesto"; card: ManifestoCard }
  | { kind: "cta"; card: CtaCard };

/** What a card needs from the screen to draw itself. */
export type Pen = {
  context: CanvasRenderingContext2D;
  /** Sets the font and its tracking, in ems. */
  font(weight: number, size: number, tracking?: number): void;
  /** Words of `text` in at most `maxLines` lines, the last one cut short. */
  wrap(text: string, maxWidth: number, maxLines: number): { lines: string[] };
  /** The site's pill button; returns its width. */
  pill(
    x: number,
    y: number,
    height: number,
    label: string,
    options: { lit: boolean; solid?: boolean; arrow?: boolean },
  ): number;
  pillWidth(height: number, label: string, arrow?: boolean): number;
};

export type CardFrame = {
  width: number;
  height: number;
  compact: boolean;
  /** Milliseconds since the card was shown. */
  elapsed: number;
  /** Scroll progress of the chapter, 0 → 1. */
  progress: number;
  /** Region under the pointer or the focus. */
  highlight: string | null;
  /** Copy button that just copied. */
  copied: string | null;
  /** Declares a clickable region, in drawing units. */
  region(id: string, x: number, y: number, width: number, height: number): void;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);
const pad = (value: number) => String(value).padStart(2, "0");

// Elements rise one after the other, as on the project cards.
const riseDelay = 160;
const riseDuration = 560;
const riseStagger = 80;
export const cardSettleTime = riseDelay + riseDuration + riseStagger * 5;

function riser(pen: Pen, frame: CardFrame) {
  return (step: number) => {
    const shown = easeOut(
      clamp01((frame.elapsed - riseDelay - step * riseStagger) / riseDuration),
    );
    pen.context.globalAlpha = shown;
    return (1 - shown) * 22;
  };
}

function background(pen: Pen, frame: CardFrame) {
  const { context } = pen;
  const { width, height } = frame;
  context.globalAlpha = 1;
  context.fillStyle = palette.night;
  context.fillRect(0, 0, width, height);
  // A faint warmth in the middle of the tube.
  const glow = context.createRadialGradient(
    width * 0.4,
    height * 0.6,
    0,
    width * 0.4,
    height * 0.6,
    width * 0.7,
  );
  glow.addColorStop(0, "rgba(241, 90, 36, 0.13)");
  glow.addColorStop(1, "rgba(241, 90, 36, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  context.textBaseline = "top";
  context.textAlign = "left";
}

// Margins clear of the glass's rounded corners.
const layout = (frame: CardFrame) =>
  frame.compact
    ? { margin: 96, top: 76, bottom: 84, kicker: 44, pill: 104 }
    : { margin: 96, top: 68, bottom: 76, kicker: 30, pill: 74 };

/** Size of `text` fitting `maxWidth`, from `size` down. */
function fit(
  pen: Pen,
  text: string,
  maxWidth: number,
  size: number,
  weight: number,
  tracking: number,
) {
  pen.font(weight, size, tracking);
  const width = pen.context.measureText(text).width;
  if (width <= maxWidth) return size;
  const fitted = Math.floor((size * maxWidth) / width);
  pen.font(weight, fitted, tracking);
  return fitted;
}

/** A row of pills from `x`, registering each one as a region. */
function pills(
  pen: Pen,
  frame: CardFrame,
  actions: CardAction[],
  x: number,
  y: number,
  height: number,
) {
  let left = x;
  actions.forEach((action, index) => {
    const width = pen.pill(left, y, height, action.label, {
      lit: frame.highlight === action.id,
      solid: index === 0,
      arrow: index === 0,
    });
    frame.region(action.id, left, y, width, height);
    left += width + height * 0.24;
  });
}

function drawHero(pen: Pen, frame: CardFrame, card: HeroCard) {
  const { context } = pen;
  const sizes = layout(frame);
  const rise = riser(pen, frame);
  const maxWidth = frame.width - sizes.margin * 2;

  // The name fills the glass, like the hero's title did.
  const first = fit(pen, card.firstName, maxWidth, 320, 500, -0.055);
  const last = Math.min(
    first * 0.76,
    fit(pen, card.lastName, maxWidth, first * 0.76, 400, -0.045),
  );
  const pillTop = frame.height - sizes.bottom - sizes.pill;
  const nameBottom = pillTop - sizes.pill * 0.45;
  const lastTop = nameBottom - last * 0.92;
  const firstTop = lastTop - first * 0.88;

  let offset = rise(0);
  pen.font(500, first, -0.055);
  context.fillStyle = palette.phosphor;
  context.fillText(
    card.firstName,
    sizes.margin - first * 0.04,
    firstTop + offset,
  );
  offset = rise(1);
  pen.font(400, last, -0.045);
  context.fillStyle = palette.faded;
  context.fillText(card.lastName, sizes.margin - last * 0.03, lastTop + offset);

  offset = rise(2);
  pills(pen, frame, card.actions, sizes.margin, pillTop + offset, sizes.pill);
  context.globalAlpha = 1;
}

function drawContact(pen: Pen, frame: CardFrame, card: ContactCard) {
  const { context } = pen;
  const sizes = layout(frame);
  const rise = riser(pen, frame);
  const right = frame.width - sizes.margin;

  let offset = rise(0);
  pen.font(500, sizes.kicker, -0.01);
  context.fillStyle = palette.soft;
  context.fillText(card.kicker, sizes.margin, sizes.top + offset);
  const closeHeight = sizes.pill * 0.86;
  const closeWidth = pen.pillWidth(closeHeight, card.close.label, false);
  const closeTop = sizes.top - (closeHeight - sizes.kicker) / 2;
  pen.pill(
    right - closeWidth,
    closeTop + offset,
    closeHeight,
    card.close.label,
    {
      lit: frame.highlight === card.close.id,
      arrow: false,
    },
  );
  frame.region(
    card.close.id,
    right - closeWidth,
    closeTop,
    closeWidth,
    closeHeight,
  );

  const rowsTop = sizes.top + closeHeight + 40;
  const rowHeight = Math.min(
    frame.compact ? 150 : 128,
    (frame.height - sizes.bottom - rowsTop) / Math.max(1, card.rows.length),
  );
  const label = frame.compact ? 32 : 24;
  const value = frame.compact ? 66 : 52;
  const actionHeight = Math.min(sizes.pill * 0.86, rowHeight * 0.56);

  card.rows.forEach((row, index) => {
    offset = rise(index + 1);
    const top = rowsTop + index * rowHeight;
    const lit =
      frame.highlight === row.id ||
      (row.action.kind === "copy" && frame.highlight === row.action.id);
    context.fillStyle = palette.hairline;
    context.fillRect(sizes.margin, top + offset, right - sizes.margin, 1.5);

    const actionLabel =
      row.action.kind === "copy"
        ? frame.copied === row.action.id
          ? "Copié"
          : "Copier"
        : "Ouvrir";
    const arrow = row.action.kind === "open";
    const actionWidth = pen.pillWidth(actionHeight, actionLabel, arrow);
    const actionLeft = right - actionWidth;
    const actionTop = top + (rowHeight - actionHeight) / 2;
    pen.pill(actionLeft, actionTop + offset, actionHeight, actionLabel, {
      lit:
        row.action.kind === "copy"
          ? frame.highlight === row.action.id
          : frame.highlight === row.id,
      arrow,
    });

    pen.font(400, label);
    context.fillStyle = palette.dim;
    const textTop = top + (rowHeight - label - value * 1.1) / 2;
    context.fillText(row.label, sizes.margin, textTop + offset);
    const valueWidth = actionLeft - sizes.margin - 40;
    fit(pen, row.value, valueWidth, value, 450, -0.03);
    context.fillStyle = lit ? palette.accent : palette.phosphor;
    context.fillText(row.value, sizes.margin, textTop + label + 10 + offset);

    if (row.action.kind === "copy") {
      frame.region(row.id, sizes.margin, top, valueWidth, rowHeight);
      frame.region(
        row.action.id,
        actionLeft,
        actionTop,
        actionWidth,
        actionHeight,
      );
    } else {
      frame.region(row.id, sizes.margin, top, right - sizes.margin, rowHeight);
    }
  });
  context.globalAlpha = 1;
}

function drawManifesto(pen: Pen, frame: CardFrame, card: ManifestoCard) {
  const { context } = pen;
  const sizes = layout(frame);
  const rise = riser(pen, frame);
  const maxWidth = frame.width - sizes.margin * 2;
  // The same pace as the chapter's own words (see Manifesto).
  const lit = clamp01((frame.progress - 0.3) / 0.45);
  const tail = clamp01((frame.progress - 0.74) / 0.14);

  const offset = rise(0);
  pen.font(500, sizes.kicker, -0.01);
  context.fillStyle = palette.soft;
  context.fillText(card.kicker, sizes.margin, sizes.top + offset);

  const words = card.text.split(/(\*[^*]+\*)/).flatMap((part) =>
    part.startsWith("*")
      ? part
          .slice(1, -1)
          .split(/\s+/)
          .map((word) => ({ word, accent: true }))
      : part
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => ({ word, accent: false })),
  );
  const size = frame.compact ? 92 : 78;
  const leading = size * 1.04;
  pen.font(450, size, -0.05);
  const space = context.measureText(" ").width + size * 0.12;
  const disciplinesTop = frame.compact
    ? frame.height - sizes.bottom - 64
    : frame.height - sizes.bottom - 168;
  const entrance = riserAlpha(frame);
  let x = sizes.margin;
  let y = sizes.top + sizes.kicker + 44;
  words.forEach(({ word, accent }, index) => {
    const width = context.measureText(word).width;
    if (x > sizes.margin && x + width > sizes.margin + maxWidth) {
      x = sizes.margin;
      y += leading;
    }
    // Each word lights up across a window of six words.
    const shown = clamp01((lit * (words.length + 6) - index) / 6);
    context.globalAlpha = entrance * (0.12 + 0.88 * shown);
    context.fillStyle = accent ? palette.accent : palette.phosphor;
    context.fillText(word, x, y);
    x += width + space;
  });

  // The disciplines, one after the other.
  const count = card.disciplines.length;
  const gap = 48;
  const columnWidth = (maxWidth - gap * (count - 1)) / count;
  card.disciplines.forEach(({ label, detail }, index) => {
    const shown = clamp01(tail * count - index);
    context.globalAlpha = shown * entrance;
    const lift = (1 - shown) * 24;
    const left = sizes.margin + index * (columnWidth + gap);
    context.fillStyle = palette.hairline;
    context.fillRect(left, disciplinesTop + lift, columnWidth, 1.5);
    if (frame.compact) {
      pen.font(500, 40);
      context.fillStyle = palette.accent;
      context.fillText(pad(index + 1), left, disciplinesTop + 18 + lift);
      const indexWidth = context.measureText(pad(index + 1)).width + 12;
      fit(pen, label, columnWidth - indexWidth, 40, 500, -0.03);
      context.fillStyle = palette.phosphor;
      context.fillText(label, left + indexWidth, disciplinesTop + 18 + lift);
      return;
    }
    pen.font(500, 40, -0.07);
    context.fillStyle = palette.accent;
    context.fillText(pad(index + 1), left, disciplinesTop + 22 + lift);
    pen.font(500, 34, -0.03);
    context.fillStyle = palette.phosphor;
    context.fillText(label, left, disciplinesTop + 74 + lift);
    pen.font(400, 23);
    context.fillStyle = palette.dim;
    pen
      .wrap(detail, columnWidth, 2)
      .lines.forEach((line, row) =>
        context.fillText(line, left, disciplinesTop + 120 + row * 30 + lift),
      );
  });
  context.globalAlpha = 1;
}

// Opacity of the elements that rise in, once they are all in.
function riserAlpha(frame: CardFrame) {
  return easeOut(clamp01((frame.elapsed - riseDelay) / riseDuration));
}

function drawCta(pen: Pen, frame: CardFrame, card: CtaCard) {
  const { context } = pen;
  const sizes = layout(frame);
  const rise = riser(pen, frame);
  const right = frame.width - sizes.margin;
  const maxWidth = frame.width - sizes.margin * 2;

  let offset = rise(0);
  pen.font(500, sizes.kicker, -0.01);
  context.fillStyle = palette.soft;
  context.fillText(card.kicker, sizes.margin, sizes.top + offset);
  pen.font(400, sizes.kicker);
  context.fillStyle = palette.dim;
  context.textAlign = "right";
  context.fillText(card.aside, right, sizes.top + offset);
  context.textAlign = "left";

  const pillTop = frame.height - sizes.bottom - sizes.pill;
  const leadSize = frame.compact ? 40 : 30;
  pen.font(400, leadSize);
  const lead = pen.wrap(card.lead, Math.min(maxWidth, 1000), 2).lines;
  const leadTop = pillTop - sizes.pill * 0.5 - lead.length * leadSize * 1.4;
  const title = Math.min(
    fit(pen, card.title[0], maxWidth, frame.compact ? 150 : 132, 450, -0.07),
    fit(pen, card.title[1], maxWidth, frame.compact ? 150 : 132, 450, -0.07),
  );
  const titleTop = leadTop - leadSize * 0.9 - title * 1.82;

  offset = rise(1);
  pen.font(450, title, -0.07);
  context.fillStyle = palette.phosphor;
  context.fillText(
    card.title[0],
    sizes.margin - title * 0.03,
    titleTop + offset,
  );
  offset = rise(2);
  context.fillStyle = palette.accent;
  context.fillText(
    card.title[1],
    sizes.margin - title * 0.03,
    titleTop + title * 0.92 + offset,
  );
  offset = rise(3);
  pen.font(400, leadSize);
  context.fillStyle = palette.dim;
  lead.forEach((line, row) =>
    context.fillText(
      line,
      sizes.margin,
      leadTop + row * leadSize * 1.4 + offset,
    ),
  );
  offset = rise(4);
  pills(pen, frame, card.actions, sizes.margin, pillTop + offset, sizes.pill);
  context.globalAlpha = 1;
}

export function drawCard(pen: Pen, frame: CardFrame, card: ScreenCard) {
  background(pen, frame);
  if (card.kind === "hero") drawHero(pen, frame, card.card);
  else if (card.kind === "contact") drawContact(pen, frame, card.card);
  else if (card.kind === "manifesto") drawManifesto(pen, frame, card.card);
  else drawCta(pen, frame, card.card);
}
