"use client";

import { ArrowUpRight } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { PixelArrow } from "@/components/pixel-arrow";
import {
  isOngoing,
  journeyKindLabels,
  journeyPeriod,
  journeySpan,
  type JourneyEntry,
} from "@/lib/journey";
import { journeyIntro } from "@/lib/journey-content";
import { useScrollProgress } from "@/lib/use-scroll-progress";
import type { JourneyScene } from "./journey-scene";

// "pending" until the script decides: the list shows by itself if it never
// does (see globals.css). "flat" is the plain list: reduced motion, no
// WebGL. "depth" is the 3D corridor.
type Mode = "pending" | "flat" | "depth";

const pad = (value: number) => String(value).padStart(2, "0");

const titleWords = journeyIntro.title
  .split(/(\*[^*]+\*)/)
  .filter(Boolean)
  .map((part) =>
    part.startsWith("*")
      ? { text: part.slice(1, -1), accent: true }
      : { text: part, accent: false },
  );

let webgl: boolean | undefined;
function supportsWebgl() {
  if (webgl === undefined) {
    try {
      const canvas = document.createElement("canvas");
      webgl = Boolean(
        canvas.getContext("webgl2") ?? canvas.getContext("webgl"),
      );
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

const reducedMotion = "(prefers-reduced-motion: reduce)";
const subscribeToMotion = (onChange: () => void) => {
  const query = window.matchMedia(reducedMotion);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const canWalk = () =>
  !window.matchMedia(reducedMotion).matches && supportsWebgl();

export function JourneyTimeline({ entries }: { entries: JourneyEntry[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const yearRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const sceneRef = useRef<JourneyScene | null>(null);
  // Null on the server: the decision belongs to the browser.
  const depth = useSyncExternalStore(subscribeToMotion, canWalk, () => null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [now] = useState(() => new Date().toISOString().slice(0, 7));

  const count = entries.length;
  const mode: Mode =
    depth === null ? "pending" : depth && count && !failed ? "depth" : "flat";
  const span = journeySpan(entries);
  // A year label opens each new year of the journey.
  const years = entries.flatMap((entry, index) => {
    const year = entry.startedOn.slice(0, 4);
    return index === 0 || entries[index - 1].startedOn.slice(0, 4) !== year
      ? [{ year, index }]
      : [];
  });

  const scrollToStep = useCallback(
    (index: number, behavior?: ScrollBehavior) => {
      const section = sectionRef.current;
      if (!section) return;
      const top =
        section.getBoundingClientRect().top +
        window.scrollY +
        (index + 1) * window.innerHeight;
      window.scrollTo({ top, behavior: behavior ?? "smooth" });
    },
    [],
  );

  useEffect(() => {
    if (mode !== "depth") return;
    let disposed = false;
    let scene: JourneyScene | null = null;
    import("./journey-scene")
      .then(({ JourneyScene }) => {
        const host = hostRef.current;
        const view = viewRef.current;
        const camera = cameraRef.current;
        if (disposed || !host || !view || !camera) return;
        scene = new JourneyScene({
          host,
          view,
          camera,
          cards: cardRefs.current.slice(0, count) as HTMLElement[],
          years: years.map(({ index }, order) => ({
            element: yearRefs.current[order]!,
            index,
          })),
          ongoing: entries.map((entry) => isOngoing(entry, now)),
          onActive: setActive,
        });
        sceneRef.current = scene;
        // The page may have scrolled while the scene was loading.
        const top = sectionRef.current?.getBoundingClientRect().top ?? 0;
        const position = Math.min(count, Math.max(0, -top / innerHeight)) - 1;
        scene.setProgress(position, true);
        // Steps linked by their anchor, e.g. /parcours#epitech.
        const target = entries.findIndex(
          (entry) => `#${entry.slug}` === window.location.hash,
        );
        if (target >= 0) scrollToStep(target, "instant");
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      scene?.dispose();
      sceneRef.current = null;
    };
    // The scene is built once per set of entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, entries, scrollToStep]);

  useScrollProgress(
    sectionRef,
    ({ offset, viewport }) => {
      const position = offset / viewport - 1;
      sceneRef.current?.setProgress(position);
      sectionRef.current?.style.setProperty(
        "--intro",
        Math.min(1, Math.max(0, -position)).toFixed(4),
      );
    },
    0,
  );

  if (!count) {
    return (
      <section
        className="journey"
        data-mode="flat"
        aria-labelledby="journey-title"
      >
        <JourneyIntro span={span} />
        <p className="journey-empty">{journeyIntro.empty}</p>
      </section>
    );
  }

  const current = entries[active];

  return (
    <section
      ref={sectionRef}
      className="journey"
      data-mode={mode}
      aria-labelledby="journey-title"
      // The intro, then one stop per step (see KeyboardNavigation).
      data-nav-stops={
        mode === "depth"
          ? Array.from({ length: count + 1 }, (_, index) => index).join(" ")
          : "0"
      }
      style={{ "--count": count } as CSSProperties}
    >
      <div className="journey-sticky">
        <div ref={hostRef} className="journey-canvas" aria-hidden="true" />

        <JourneyIntro span={span} />

        <div ref={viewRef} className="journey-view">
          <div ref={cameraRef} className="journey-camera">
            <div className="journey-years" aria-hidden="true">
              {years.map(({ year }, order) => (
                <span
                  key={year}
                  ref={(element) => {
                    yearRefs.current[order] = element;
                  }}
                  className="journey-year"
                >
                  {year}
                </span>
              ))}
            </div>
            <ol className="journey-cards">
              {entries.map((entry, index) => (
                <JourneyCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  count={count}
                  ongoing={isOngoing(entry, now)}
                  ref={(element) => {
                    cardRefs.current[index] = element;
                  }}
                  onFocus={() => {
                    if (mode === "depth" && index !== active) {
                      scrollToStep(index);
                    }
                  }}
                />
              ))}
            </ol>
          </div>
        </div>

        {mode === "depth" && (
          <>
            <nav className="journey-rail" aria-label="Étapes du parcours">
              <ol>
                {entries.map((entry, index) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => scrollToStep(index)}
                      aria-current={index === active ? "step" : undefined}
                      data-reached={index <= active || undefined}
                    >
                      <span className="journey-rail-year">
                        {entry.startedOn.slice(0, 4)}
                      </span>
                      <span className="sr-only">
                        {entry.title}, {entry.organization}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <p className="journey-hud" aria-hidden="true">
              <span className="journey-hud-index">
                {pad(active + 1)}
                <small> / {pad(count)}</small>
              </span>
              <span>{journeyKindLabels[current.kind]}</span>
              <span>{journeyPeriod(current)}</span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function JourneyIntro({ span }: { span: string | null }) {
  return (
    <header className="journey-intro">
      <p className="journey-kicker">
        {journeyIntro.kicker}
        {span && <span> · {span}</span>}
      </p>
      <h1 id="journey-title" className="journey-title">
        {titleWords.map(({ text, accent }, index) => (
          <Fragment key={index}>{accent ? <em>{text}</em> : text}</Fragment>
        ))}
      </h1>
      <p className="journey-lead">{journeyIntro.lead}</p>
      <p className="journey-hint" aria-hidden="true">
        <span />
        {journeyIntro.hint}
      </p>
    </header>
  );
}

function JourneyCard({
  entry,
  index,
  count,
  ongoing,
  ref,
  onFocus,
}: {
  entry: JourneyEntry;
  index: number;
  count: number;
  ongoing: boolean;
  ref: (element: HTMLLIElement | null) => void;
  onFocus: () => void;
}) {
  return (
    <li
      ref={ref}
      id={entry.slug}
      className="journey-card"
      data-kind={entry.kind}
      onFocus={onFocus}
    >
      <article aria-labelledby={`${entry.slug}-title`}>
        <p className="journey-card-kicker">
          <span className="journey-card-index" aria-hidden="true">
            {pad(index + 1)}/{pad(count)}
          </span>
          <span className="journey-card-kind">
            {journeyKindLabels[entry.kind]}
          </span>
          <span>{journeyPeriod(entry)}</span>
          {ongoing && <span className="journey-live">En cours</span>}
        </p>
        <h2 id={`${entry.slug}-title`} className="journey-card-title">
          {entry.title}
        </h2>
        <p className="journey-card-org">
          {entry.websiteUrl ? (
            <a
              href={entry.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {entry.organization}
              <ArrowUpRight aria-hidden="true" />
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          ) : (
            entry.organization
          )}
          {entry.location && <span> · {entry.location}</span>}
        </p>
        <p className="journey-card-summary">{entry.summary}</p>
        {entry.description && (
          <p className="journey-card-description">{entry.description}</p>
        )}
        {entry.highlights.length > 0 && (
          <ul className="journey-card-highlights">
            {entry.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        )}
        {entry.technologies.length > 0 && (
          <ul className="journey-card-tags" aria-label="Technologies">
            {entry.technologies.map((technology) => (
              <li key={technology}>{technology}</li>
            ))}
          </ul>
        )}
        {entry.projects.length > 0 && (
          <div className="journey-card-projects">
            {entry.projects.map((project) => (
              <a
                key={project.slug}
                className="pixel-button journey-project"
                href={`/?projet=${encodeURIComponent(project.slug)}`}
              >
                {project.title}
                <PixelArrow />
              </a>
            ))}
          </div>
        )}
      </article>
    </li>
  );
}
