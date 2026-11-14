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
import type { Project, ProjectCatalog } from "@/lib/projects";
import {
  holdPageScroll,
  magnetizeScroll,
  scrollPageTo,
} from "@/lib/smooth-scroll";
import { Carousel } from "@/stage/carousel";
import { direction } from "@/stage/direction";
import { clamp } from "@/stage/math";
import { ProjectDetail } from "./project-detail";

/** Scroll each card takes, in viewport heights. */
const STEP = 0.85;
/** Milliseconds the project's page takes to leave. */
const LEAVE_MS = 780;

const pad = (value: number) => String(value).padStart(2, "0");

const coverOf = (project: Project) =>
  project.imageUrl ?? "/projects/placeholder.svg";

// The projects, as the rest of the story the hero opens. The stage draws the
// carousel: the hero's card first, then one cover per project, on a roller
// the scroll turns. The page keeps what is not a picture: the list of names,
// where the project in focus is marked, the button laid over its cover, and
// the project's own page, which that cover opens into.
export function Projects({ catalog }: { catalog: ProjectCatalog }) {
  const { projects } = catalog;
  const stage = useStage();
  const params = useSearchParams();
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLElement | null>(null);
  const carouselRef = useRef<Carousel | null>(null);
  /** Card in focus: 0 is the hero, 1 the first project. */
  const focusRef = useRef(0);
  const [focus, setFocus] = useState(0);

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

  // The first card of the carousel is the hero: it has no picture to load.
  const sources = useMemo(() => ["", ...projects.map(coverOf)], [projects]);

  /** Scroll position at which a card of the carousel is in focus. */
  const stopOf = useCallback((card: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    return (
      track.getBoundingClientRect().top +
      window.scrollY +
      card * STEP * window.innerHeight
    );
  }, []);

  const open = useCallback(
    (index: number) => {
      const project = projects[index];
      if (!project) return;
      const next = new URLSearchParams(window.location.search);
      // Moving between projects replaces the entry: one step back closes.
      const replace = next.has("projet");
      next.set("projet", project.slug);
      if (replace) window.history.replaceState(null, "", `?${next}`);
      else window.history.pushState({ projet: true }, "", `?${next}`);
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

  /** A name in the list: brings its project round, or opens it if it is. */
  const choose = (index: number) => {
    if (focusRef.current === index + 1) open(index);
    else scrollPageTo(stopOf(index + 1));
  };

  // The carousel: positions computed every frame from the scroll.
  useEffect(() => {
    if (!stage) return;
    const track = trackRef.current;
    const sticky = stickyRef.current;
    const story = track?.closest<HTMLElement>(".story");
    if (!track || !sticky || !story) return;
    const carousel = new Carousel(sources);
    carouselRef.current = carousel;
    let laidOutFor = "";
    let faded = 1;
    let told = -1;

    const release = stage.direct((engine, dt) => {
      const height = window.innerHeight;
      const bounds = track.getBoundingClientRect();
      const target = clamp(
        -bounds.top / (STEP * height),
        0,
        sources.length - 1,
      );
      const visible = bounds.bottom > -height * 0.2 && bounds.top < height;
      const cover = coverRef.current?.getBoundingClientRect() ?? null;
      // Past its last project, the story fades before night falls on the
      // contact section: no dark words on a darkening page.
      const left = -sticky.getBoundingClientRect().top / height;
      const fade = 1 - clamp((left - 0.04) / 0.36, 0, 1);
      if (fade !== faded) {
        faded = fade;
        sticky.style.opacity = fade.toFixed(3);
      }
      const moving = carousel.update(
        engine,
        dt,
        target,
        visible,
        cover,
        height,
        fade,
      );
      if (moving) engine.wake();

      // The page follows the carousel as drawn, not as asked for.
      direction.story.position = carousel.position;
      direction.story.opened = carousel.opened;
      const rounded = Math.round(carousel.position * 500) / 500;
      if (rounded !== told) {
        told = rounded;
        story.style.setProperty("--story", String(rounded));
      }

      const card = Math.round(target);
      if (card !== focusRef.current) {
        focusRef.current = card;
        setFocus(card);
      }

      // The page's own controls follow the layout the stage draws.
      const key = `${engine.width}|${height}`;
      if (key !== laidOutFor) {
        laidOutFor = key;
        const layout = Carousel.layout(engine.width, height);
        const style = story.style;
        style.setProperty("--card-x", `${layout.x}px`);
        style.setProperty("--card-y", `${layout.y}px`);
        style.setProperty("--card-width", `${layout.width}px`);
        style.setProperty("--card-height", `${layout.height}px`);
      }
    });

    // Covers load once the page is idle, before they are scrolled to.
    const preload = window.setTimeout(() => {
      for (const src of sources) if (src) stage.cards.preload(src);
    }, 1400);

    return () => {
      window.clearTimeout(preload);
      release();
      sticky.style.opacity = "";
      story.style.removeProperty("--story");
      direction.story.position = 0;
      direction.story.opened = 0;
      carouselRef.current = null;
    };
  }, [stage, sources]);

  // The wheel settles on a card rather than between two.
  useEffect(() => {
    let release = () => {};
    const place = () => {
      release();
      release = magnetizeScroll(
        sources.map((_, card) => Math.round(stopOf(card))),
      );
    };
    place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      release();
    };
  }, [sources, stopOf]);

  // Opening a project: the page stays where it is, held behind.
  const openedOnce = useRef(false);
  useEffect(() => {
    const carousel = carouselRef.current;
    const root = document.documentElement;
    if (openIndex >= 0) {
      const card = openIndex + 1;
      // Reached by a link: bring the carousel to that project first.
      const away = Math.abs(window.scrollY - stopOf(card)) > 4;
      const direct = !openedOnce.current && away;
      if (away) scrollPageTo(stopOf(card), true);
      if (direct) carousel?.jumpTo(card);
      carousel?.setOpen(card, direct);
      openedOnce.current = true;
      holdPageScroll(true);
      root.dataset.detail = "open";
      direction.project = projectWorld(projects[openIndex]);
      // The matrix answers: a ring spreads from the middle of the cover.
      if (stage && !direct) {
        stage.pulse(
          stage.width * (stage.width < 832 ? 0.5 : 0.595),
          window.innerHeight * 0.5,
        );
      }
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

  if (projects.length === 0) return null;

  const active = focus - 1;
  const project = active >= 0 ? projects[active] : null;

  return (
    <>
      <div
        ref={trackRef}
        className="work"
        data-nav-stops={sources
          .map((_, card) => (card * STEP).toFixed(2))
          .join(" ")}
        style={
          {
            "--count": projects.length,
            "--step": STEP,
          } as CSSProperties
        }
      >
        {/* Where "Projets" leads: the first project in focus. */}
        <div id="projets" className="work-anchor" data-nav-stops="0" />

        <div
          ref={stickyRef}
          className="work-sticky"
          data-shown={focus > 0 || undefined}
        >
          <nav className="work-list" aria-label="Projets" data-calm>
            <h2>Projets</h2>
            <ol>
              {projects.map((item, index) => (
                <li key={item.slug}>
                  <button
                    type="button"
                    aria-current={index === active ? "true" : undefined}
                    tabIndex={focus > 0 ? 0 : -1}
                    onClick={() => choose(index)}
                  >
                    <span className="work-number" aria-hidden="true">
                      {pad(index + 1)}
                    </span>
                    {item.title}
                  </button>
                </li>
              ))}
            </ol>
            {catalog.source === "demo" && (
              <p className="work-notice">Exemples fictifs</p>
            )}
          </nav>

          {/* Over the cover the stage draws: it takes the click, and shows
              the picture itself where the stage cannot. */}
          {project && (
            <button
              type="button"
              className="work-cover"
              aria-label={`Ouvrir le projet ${project.title}`}
              onClick={() => open(active)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverOf(project)} alt="" loading="lazy" />
              <span className="work-cover-hint glass" aria-hidden="true">
                Ouvrir
              </span>
            </button>
          )}
        </div>
      </div>

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
