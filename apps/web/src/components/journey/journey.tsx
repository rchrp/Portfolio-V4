"use client";

import { ArrowUpRight } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useStage } from "@/components/stage/stage";
import {
  isOngoing,
  journeyKindLabels,
  journeyPeriod,
  type JourneyEntry,
} from "@/lib/journey";
import { direction } from "@/stage/direction";
import { clamp01 } from "@/stage/math";

// The journey, a year at a time. The years stand in a column; the one in
// focus is drawn by the stage, large, in relief in the matrix, as the first
// name is in the hero, and a pane of glass tells what began that year.
export function Journey({
  entries,
  now,
}: {
  entries: JourneyEntry[];
  /** "YYYY-MM" of the current month, as the server saw it. */
  now: string;
}) {
  const stage = useStage();
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // One entry per year something began in, oldest first.
  const years = useMemo(() => {
    const byYear = new Map<string, JourneyEntry[]>();
    for (const entry of entries) {
      const year = entry.startedOn.slice(0, 4);
      byYear.set(year, [...(byYear.get(year) ?? []), entry]);
    }
    return [...byYear].map(([year, steps]) => ({ year, steps }));
  }, [entries]);
  // The page opens on the present.
  const [active, setActive] = useState(years.length - 1);
  const current = years[Math.min(active, years.length - 1)];

  // The stage is told which year to draw.
  useEffect(() => {
    direction.journey.year = current.year;
    stage?.invalidate();
  }, [current.year, stage]);

  // On narrow screens the years are a row that scrolls: the one in focus
  // stays in sight.
  const settled = useRef(false);
  useEffect(() => {
    const tab = tabRefs.current[active];
    const row = tab?.parentElement;
    if (!tab || !row) return;
    row.scrollTo({
      left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2,
      behavior: settled.current ? "smooth" : "auto",
    });
    settled.current = true;
  }, [active]);

  // And where: the slot kept for it moves with the page.
  useEffect(() => {
    if (!stage) return;
    const section = sectionRef.current;
    const content = contentRef.current;
    const slot = slotRef.current;
    if (!section || !content || !slot) return;
    let faded = 1;

    const release = stage.direct(() => {
      const height = window.innerHeight;
      // Night falls on the next section: the journey has gone by then, so
      // that no dark word is left on a darkening page.
      const bottom = section.getBoundingClientRect().bottom / height;
      const shown = clamp01((bottom - 0.6) / 0.3);
      if (shown !== faded) {
        faded = shown;
        content.style.opacity = shown.toFixed(3);
      }
      const bounds = slot.getBoundingClientRect();
      const onScreen = bounds.bottom > -60 && bounds.top < height + 60;
      const journey = direction.journey;
      journey.shown = shown;
      if (!onScreen || shown <= 0) {
        journey.rect = null;
        return;
      }
      const x = Math.round(bounds.left);
      const y = Math.round(bounds.top);
      const width = Math.round(bounds.width);
      const rect = journey.rect;
      if (
        !rect ||
        rect.x !== x ||
        rect.y !== y ||
        rect.width !== width ||
        rect.height !== Math.round(bounds.height)
      ) {
        journey.rect = { x, y, width, height: Math.round(bounds.height) };
      }
    });

    return () => {
      release();
      content.style.opacity = "";
      direction.journey.rect = null;
    };
  }, [stage]);

  // A column of tabs: the arrows move through the years.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? years.length - 1
          : step
            ? (active + step + years.length) % years.length
            : -1;
    if (to < 0) return;
    event.preventDefault();
    setActive(to);
    tabRefs.current[to]?.focus();
  };

  // A project made that year opens in its own page, over this one.
  const openProject = (event: MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    const next = new URLSearchParams(window.location.search);
    next.set("projet", slug);
    window.history.pushState({ projet: true }, "", `?${next}`);
  };

  return (
    <section
      ref={sectionRef}
      id="parcours"
      className="journey"
      aria-labelledby="journey-heading"
      data-nav-stops="0"
    >
      <div ref={contentRef} className="journey-content">
        <h2 id="journey-heading" className="journey-title">
          Parcours
        </h2>

        {/* Where the stage draws the year: the figures below only show
            where it cannot. */}
        <div ref={slotRef} className="journey-year" aria-hidden="true">
          <span>{current.year}</span>
        </div>

        <div
          className="journey-years"
          role="tablist"
          aria-label="Années"
          aria-orientation="vertical"
          onKeyDown={onKeyDown}
          data-calm
        >
          {years.map(({ year }, index) => (
            <button
              key={year}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`journey-tab-${year}`}
              aria-selected={index === active}
              aria-controls="journey-panel"
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
            >
              {year}
            </button>
          ))}
        </div>

        <div
          id="journey-panel"
          className="journey-card glass"
          role="tabpanel"
          aria-labelledby={`journey-tab-${current.year}`}
          data-calm
        >
          {/* Keyed by year: each year's steps come in afresh. */}
          <div key={current.year} className="journey-steps">
            {current.steps.map((step) => (
              <article key={step.id} className="journey-step">
                <p className="journey-step-when">
                  {journeyKindLabels[step.kind]} · {journeyPeriod(step)}
                  {isOngoing(step, now) && (
                    <span className="journey-step-now">En cours</span>
                  )}
                </p>
                <h3>{step.title}</h3>
                <p className="journey-step-where">
                  {step.organization}
                  {step.location && ` · ${step.location}`}
                </p>
                <p className="journey-step-summary">{step.summary}</p>
                {step.projects.length > 0 && (
                  <p className="journey-step-links">
                    {step.projects.map((project) => (
                      <a
                        key={project.slug}
                        href={`/?projet=${encodeURIComponent(project.slug)}`}
                        onClick={(event) => openProject(event, project.slug)}
                      >
                        {project.title}
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </a>
                    ))}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
