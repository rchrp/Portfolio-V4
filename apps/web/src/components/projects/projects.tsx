"use client";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useStage } from "@/components/stage/stage";
import { projectWorld } from "@/lib/project-worlds";
import {
  projectPeriod,
  type Project,
  type ProjectCatalog,
} from "@/lib/projects";
import {
  holdPageScroll,
  magnetizeScroll,
  scrollPageTo,
} from "@/lib/smooth-scroll";
import { Carousel } from "@/stage/carousel";
import { direction } from "@/stage/direction";
import { clamp } from "@/stage/math";
import { ProjectDetail } from "./project-detail";

/** Scroll each project takes, in viewport heights. */
const STEP = 0.85;
/** Milliseconds the project's page takes to leave. */
const LEAVE_MS = 780;

const pad = (value: number) => String(value).padStart(2, "0");

const coverOf = (project: Project) =>
  project.imageUrl ?? "/projects/placeholder.svg";

// The projects: a carousel turned by the scroll, one project in focus at a
// time with only what is needed to want to open it, and the project's own
// page, which the cover in focus opens into.
export function Projects({ catalog }: { catalog: ProjectCatalog }) {
  const { projects } = catalog;
  const stage = useStage();
  const params = useSearchParams();
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLElement | null>(null);
  const carouselRef = useRef<Carousel | null>(null);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  // The open project follows the address, so the back button closes it and
  // a link can open one directly.
  const slug = params.get("projet");
  const openIndex = slug
    ? projects.findIndex((project) => project.slug === slug)
    : -1;
  // What is displayed lingers while the page leaves.
  const [shownIndex, setShownIndex] = useState(openIndex);
  const [leaving, setLeaving] = useState(false);
  if (openIndex >= 0 && (shownIndex !== openIndex || leaving)) {
    setShownIndex(openIndex);
    setLeaving(false);
  } else if (openIndex < 0 && shownIndex >= 0 && !leaving) {
    setLeaving(true);
  }
  const shown = shownIndex >= 0 ? projects[shownIndex] : null;

  useEffect(() => {
    if (!leaving) return;
    const timeout = window.setTimeout(() => {
      setShownIndex(-1);
      setLeaving(false);
    }, LEAVE_MS);
    return () => window.clearTimeout(timeout);
  }, [leaving]);

  const sources = useMemo(() => projects.map(coverOf), [projects]);

  /** Scroll position at which a project is in focus. */
  const stopOf = useCallback((index: number) => {
    const section = sectionRef.current;
    if (!section) return 0;
    return (
      section.getBoundingClientRect().top +
      window.scrollY +
      index * STEP * window.innerHeight
    );
  }, []);

  const open = useCallback(
    (index: number) => {
      const project = projects[index];
      if (!project) return;
      const next = new URLSearchParams(window.location.search);
      next.set("projet", project.slug);
      // Moving between projects replaces the entry: one step back closes.
      if (new URLSearchParams(window.location.search).has("projet")) {
        window.history.replaceState(null, "", `?${next}`);
      } else {
        window.history.pushState({ projet: true }, "", `?${next}`);
      }
    },
    [projects],
  );

  const close = useCallback(() => {
    if (window.history.state?.projet) {
      window.history.back();
      return;
    }
    const next = new URLSearchParams(window.location.search);
    next.delete("projet");
    const query = next.toString();
    window.history.replaceState(
      null,
      "",
      query ? `?${query}` : window.location.pathname,
    );
  }, []);

  // The carousel itself: positions computed every frame from the scroll.
  useEffect(() => {
    if (!stage) return;
    const section = sectionRef.current;
    const sticky = stickyRef.current;
    if (!section || !sticky || sources.length === 0) return;
    const carousel = new Carousel(sources);
    carouselRef.current = carousel;
    let laidOutFor = "";

    const release = stage.direct((engine, dt) => {
      const height = window.innerHeight;
      const bounds = section.getBoundingClientRect();
      const target = clamp(
        -bounds.top / (STEP * height),
        0,
        sources.length - 1,
      );
      const visible =
        bounds.bottom > -height * 0.2 && bounds.top < height * 1.2;
      const shift = sticky.getBoundingClientRect().top;
      const cover = coverRef.current?.getBoundingClientRect() ?? null;
      const moving = carousel.update(
        engine,
        dt,
        target,
        shift,
        visible,
        cover,
        height,
      );
      if (moving) engine.wake();

      const index = Math.round(target);
      if (index !== activeRef.current) {
        activeRef.current = index;
        setActive(index);
      }

      // The page's own controls follow the layout the stage draws.
      const key = `${engine.width}|${height}`;
      if (key !== laidOutFor) {
        laidOutFor = key;
        const layout = Carousel.layout(engine.width, height);
        const style = sticky.style;
        style.setProperty("--card-x", `${layout.x}px`);
        style.setProperty("--card-y", `${layout.y}px`);
        style.setProperty("--card-width", `${layout.width}px`);
        style.setProperty("--card-height", `${layout.height}px`);
      }
    });

    // Covers load once the page is idle, before the section is reached.
    const preload = window.setTimeout(() => {
      for (const src of sources) stage.cards.preload(src);
    }, 1200);

    return () => {
      window.clearTimeout(preload);
      release();
      carouselRef.current = null;
    };
  }, [stage, sources]);

  // The wheel settles on a project rather than between two.
  useEffect(() => {
    let release = () => {};
    const place = () => {
      release();
      release = magnetizeScroll(
        projects.map((_, index) => Math.round(stopOf(index))),
      );
    };
    place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      release();
    };
  }, [projects, stopOf]);

  // Opening a project: the page stays where it is, held behind.
  const openedOnce = useRef(false);
  useEffect(() => {
    const carousel = carouselRef.current;
    const root = document.documentElement;
    if (openIndex >= 0) {
      // Reached by a link: bring the carousel to that project first.
      const away = Math.abs(window.scrollY - stopOf(openIndex)) > 4;
      const direct = !openedOnce.current && away;
      if (away) scrollPageTo(stopOf(openIndex), true);
      if (direct) carousel?.jumpTo(openIndex);
      carousel?.setOpen(openIndex, direct);
      openedOnce.current = true;
      holdPageScroll(true);
      root.dataset.detail = "open";
      const project = projects[openIndex];
      direction.project = projectWorld(project);
    } else {
      carousel?.setOpen(null);
      direction.project = null;
      holdPageScroll(false);
      delete root.dataset.detail;
    }
    stage?.invalidate();
  }, [openIndex, projects, stopOf, stage]);

  useEffect(
    () => () => {
      direction.project = null;
      holdPageScroll(false);
      delete document.documentElement.dataset.detail;
    },
    [],
  );

  if (projects.length === 0) {
    return (
      <section id="projets" className="work work-empty" aria-label="Projets">
        <p>Les projets arrivent bientôt.</p>
      </section>
    );
  }

  const project = projects[Math.min(active, projects.length - 1)];

  return (
    <>
      <section
        ref={sectionRef}
        id="projets"
        className="work"
        aria-labelledby="work-heading"
        data-nav-stops={projects
          .map((_, index) => (index * STEP).toFixed(2))
          .join(" ")}
        style={
          {
            "--count": projects.length,
            "--step": STEP,
          } as CSSProperties
        }
      >
        <div ref={stickyRef} className="work-sticky">
          <header className="work-head">
            <h2 id="work-heading">Projets</h2>
            <p aria-hidden="true">
              <span className="work-current" key={active}>
                {pad(active + 1)}
              </span>
              <span className="work-total"> / {pad(projects.length)}</span>
            </p>
          </header>

          <div
            className="work-info"
            key={project.slug}
            aria-live="polite"
            data-calm
          >
            <p className="work-kicker">
              {project.category}
              <span aria-hidden="true"> — </span>
              {projectPeriod(project)}
            </p>
            <h3 className="work-title">{project.title}</h3>
            <p className="work-summary">{project.summary}</p>
            <button
              type="button"
              className="button button-solid work-open"
              onClick={() => open(active)}
            >
              Voir le projet
            </button>
          </div>

          {/* Over the cover the stage draws: it takes the click and the
              focus, and shows the picture itself where the stage cannot. */}
          <button
            type="button"
            className="work-cover"
            aria-label={`Ouvrir le projet ${project.title}`}
            onClick={() => open(active)}
            tabIndex={-1}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverOf(project)} alt="" loading="lazy" />
          </button>

          <ol className="work-pager" aria-label="Tous les projets">
            {projects.map((item, index) => (
              <li key={item.slug}>
                <button
                  type="button"
                  aria-label={item.title}
                  aria-current={index === active ? "true" : undefined}
                  onClick={() => scrollPageTo(stopOf(index))}
                >
                  <span aria-hidden="true">{item.title}</span>
                </button>
              </li>
            ))}
          </ol>

          {catalog.source === "demo" && (
            <p className="work-notice">Exemples fictifs</p>
          )}
        </div>
      </section>

      {shown && (
        <ProjectDetail
          key={shown.slug}
          project={shown}
          leaving={leaving}
          coverRef={coverRef}
          next={projects[(shownIndex + 1) % projects.length]}
          hasNext={projects.length > 1}
          onClose={close}
          onNext={() => open((shownIndex + 1) % projects.length)}
        />
      )}
    </>
  );
}
