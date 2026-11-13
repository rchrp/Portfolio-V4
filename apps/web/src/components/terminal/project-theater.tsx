"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { PixelArrow } from "@/components/pixel-arrow";
import { restingPoints } from "@/components/keyboard-navigation";
import {
  PixelMatrix,
  prefetchField,
  type FieldRect,
} from "@/components/pixel-matrix";
import { useMonitor } from "@/components/monitor-stage";
import {
  projectKindLabels,
  projectPeriod,
  type Project,
  type ProjectCatalog,
} from "@/lib/projects";
import { projectsChapter } from "@/lib/site-content";
import {
  holdPageScroll,
  magnetizeScroll,
  scrollPageTo,
} from "@/lib/smooth-scroll";
import { useScrollProgress } from "@/lib/use-scroll-progress";
import type { StageLayout } from "./monitor-path";
import type { MonitorRenderer, ScreenRect } from "./monitor-renderer";
import { ProjectDeck } from "./project-deck";
import {
  placeholderArtwork,
  ProjectShowcase,
  recoverArtwork,
  type ShowcaseEntry,
  type ShowcasePhase,
} from "./project-showcase";
import type { ScreenProject } from "./screen-composer";
import {
  channelStop,
  INTRO,
  OUTRO,
  showsProjects,
  theaterProgress,
  titleStop,
} from "./theater-timeline";

const brandRgb = [241, 90, 36];
// The project's mark: on wide screens in the top left corner, like a channel's
// logo, clear of the monitor (from about 14% of the width, even as it sways),
// of the left card (from 40% of the height) and of the shade along the top;
// below the monitor on narrow ones, which leave no room above it.
const sideField: FieldRect = { x: 0.03, y: 0.08, width: 0.11, height: 0.29 };
const stackedField: FieldRect = { x: 0.06, y: 0.7, width: 0.88, height: 0.24 };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

// The picture whose edges the wall draws when its edge map is missing.
const fieldSourceOf = (project: Project) => project.logoUrl ?? project.imageUrl;

// The wall keeps the site's orange, nudged towards each project's accent.
function matrixColor(accent: string) {
  const channels = [1, 3, 5].map((offset, index) =>
    Math.round(
      brandRgb[index] * 0.75 +
        parseInt(accent.slice(offset, offset + 2), 16) * 0.25,
    ),
  );
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

const pad = (value: number) => String(value).padStart(2, "0");

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const nextFrame = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

// Loads and decodes a picture so it is on screen the frame it is shown.
const decodeImage = (src: string) => {
  const image = new Image();
  image.src = src;
  return image.decode().catch(() => undefined);
};

// URL search parameter naming the project shown full screen.
const projectParam = "projet";
// Matches the showcase's closing transitions (see globals.css).
const closeDuration = 700;

// Freezes the page behind the showcase. The browser must not restore an older
// scroll position when its history entry is popped: the monitor stays on the
// channel of the last project shown.
const lockPage = () => {
  document.body.style.overflow = "hidden";
  window.history.scrollRestoration = "manual";
  holdPageScroll(true);
};

const unlockPage = () => {
  document.body.style.overflow = "";
  window.history.scrollRestoration = "auto";
  holdPageScroll(false);
};

type Showcase = {
  index: number;
  phase: ShowcasePhase;
  entry: ShowcaseEntry;
  enterScale: number;
};

// The button over the glass follows it as the camera moves.
const placeOverGlass = (button: HTMLElement | null, rect: ScreenRect) => {
  button?.style.setProperty("--screen-left", `${rect.left}px`);
  button?.style.setProperty("--screen-top", `${rect.top}px`);
  button?.style.setProperty("--screen-width", `${rect.width}px`);
  button?.style.setProperty("--screen-height", `${rect.height}px`);
};

export function ProjectTheater({ catalog }: { catalog: ProjectCatalog }) {
  const { projects, source } = catalog;
  const { renderer, status: webgl } = useMonitor();
  const sectionRef = useRef<HTMLElement>(null);
  // The transitions read it when they run, the effects below keep it current.
  const rendererRef = useRef<MonitorRenderer | null>(null);
  const activeRef = useRef(0);
  const poweredRef = useRef(false);
  const [active, setActive] = useState(0);
  const [powered, setPowered] = useState(false);
  const [layout, setLayout] = useState<StageLayout>("side");
  const [showcase, setShowcase] = useState<Showcase | null>(null);
  // True from the moment the camera starts diving until it is back out.
  const [dived, setDived] = useState(false);
  const showcaseRef = useRef<Showcase | null>(null);
  const transitionRef = useRef(0);
  const pushedRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const project = projects[active];
  const count = projects.length;

  // The ref answers synchronously for the transitions; state renders.
  const updateShowcase = useCallback(
    (update: (current: Showcase | null) => Showcase | null) => {
      showcaseRef.current = update(showcaseRef.current);
      setShowcase(showcaseRef.current);
    },
    [],
  );

  // What the glass shows of each project, and its card in x-ray: the hero of
  // its showcase.
  const screenProjects = useMemo(
    (): ScreenProject[] =>
      projects.map((item, index) => ({
        slug: item.slug,
        title: item.title,
        summary: item.summary,
        kicker: [projectKindLabels[item.kind], projectPeriod(item)],
        facts: [
          { label: "Rôle", value: item.role },
          item.client
            ? { label: "Client", value: item.client }
            : { label: "Type", value: item.category },
        ],
        imageUrl: item.imageUrl ?? placeholderArtwork,
        accentColor: item.accentColor,
        index,
        total: projects.length,
      })),
    [projects],
  );

  // Every channel's edge map is ready before it is shown: switching projects
  // then morphs the wall without fetching or reading pixels.
  useEffect(() => {
    for (const item of projects) {
      prefetchField(item.edgeMapUrl, fieldSourceOf(item));
    }
  }, [projects]);

  useEffect(() => {
    const query = window.matchMedia(
      "(max-width: 52rem), (max-aspect-ratio: 4/5)",
    );
    const update = () => setLayout(query.matches ? "stacked" : "side");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // The page's monitor shows these projects; the button over its glass
  // follows it.
  useEffect(() => {
    rendererRef.current = renderer;
    if (!renderer) return;
    renderer.setProjects(screenProjects);
    const stop = renderer.onScreen(({ rect }) =>
      placeOverGlass(triggerRef.current, rect),
    );
    return () => {
      stop();
      renderer.setProjects([]);
    };
  }, [renderer, screenProjects]);

  // Left between the title and the projects, or between two of them, the page
  // settles on the nearest: its resting points are the arrow keys' (see
  // data-nav-stops). They move with the chapters above and the viewport.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || count === 0) return;
    let release = () => {};
    const update = () => {
      release();
      release = magnetizeScroll(restingPoints(section));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      release();
    };
  }, [count]);

  useScrollProgress(sectionRef, ({ offset, viewport }) => {
    if (count === 0) return;
    const steps = offset / viewport;
    const progress = theaterProgress(steps, count);
    const { intro, outro } = progress;
    const projectPosition = clamp(progress.project, 0, count);
    const index = clamp(Math.floor(projectPosition), 0, count - 1);
    // Clickable while the glass shows the projects.
    const shouldPower = showsProjects(progress, count);

    const style = sectionRef.current?.style;
    style?.setProperty("--intro", intro.toFixed(4));
    style?.setProperty("--outro", outro.toFixed(4));
    // 0 → 1 from the title's rest to the first project reaching the glass.
    style?.setProperty(
      "--title-out",
      clamp((steps - titleStop) / (INTRO - titleStop), 0, 1).toFixed(4),
    );
    style?.setProperty(
      "--channel",
      clamp(projectPosition - index, 0, 1).toFixed(4),
    );

    if (index !== activeRef.current) {
      activeRef.current = index;
      setActive(index);
    }
    if (shouldPower !== poweredRef.current) {
      poweredRef.current = shouldPower;
      setPowered(shouldPower);
    }
  });

  const scrollToProject = useCallback(
    (index: number, instant = false) => {
      const section = sectionRef.current;
      if (!section) return;
      const top =
        section.getBoundingClientRect().top +
        window.scrollY +
        channelStop(clamp(index, 0, count - 1)) * window.innerHeight;
      scrollPageTo(top, instant);
    },
    [count],
  );

  // Dives into the monitor, then hands over to the full-screen showcase,
  // whose picture is laid out exactly as the glass shows it.
  const openShowcase = useCallback(
    async (index: number, push = true) => {
      if (showcaseRef.current) return;
      const target = projects[index];
      if (!target) return;
      const token = ++transitionRef.current;
      if (push) {
        const url = new URL(window.location.href);
        url.searchParams.set(projectParam, target.slug);
        window.history.pushState(window.history.state, "", url);
      }
      pushedRef.current = push;
      lockPage();
      setDived(true);
      updateShowcase(() => ({
        index,
        phase: "entering",
        entry: "dive",
        enterScale: 1,
      }));

      const image = target.imageUrl ?? placeholderArtwork;
      const renderer = rendererRef.current;
      const [enterScale] = await Promise.all([
        renderer ? renderer.diveIn(image) : 1,
        decodeImage(image),
      ]);
      if (token !== transitionRef.current) return;
      updateShowcase((current) => current && { ...current, enterScale });
      await nextFrame();
      if (token !== transitionRef.current) return;
      updateShowcase((current) => current && { ...current, phase: "open" });
      // Nothing of the scene shows once the showcase has faded in.
      await wait(400);
      if (token === transitionRef.current) renderer?.setHeld(true);
    },
    [projects, updateShowcase],
  );

  const closeShowcase = useCallback(async () => {
    if (!showcaseRef.current || showcaseRef.current.phase === "closing") return;
    const token = ++transitionRef.current;
    const renderer = rendererRef.current;
    const { index } = showcaseRef.current;
    // The glass, still filling the screen, shows through as the page fades.
    renderer?.setHeld(false);
    updateShowcase((current) => current && { ...current, phase: "closing" });
    await wait(closeDuration);
    if (token !== transitionRef.current) return;
    updateShowcase(() => null);
    unlockPage();
    if (activeRef.current !== index) scrollToProject(index, true);
    const out = renderer?.diveOut();
    // The text returns while the camera is still pulling back.
    await wait(renderer ? 900 : 0);
    if (token !== transitionRef.current) return;
    setDived(false);
    // Focus returns to the button once it is visible again.
    await nextFrame();
    triggerRef.current?.focus({ preventScroll: true });
    await out;
  }, [scrollToProject, updateShowcase]);

  // The close button, Escape and the browser's back button all lead here.
  const requestClose = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete(projectParam);
    window.history.replaceState(window.history.state, "", url);
    void closeShowcase();
  }, [closeShowcase]);

  const showSibling = useCallback(
    (step: 1 | -1) => {
      const current = showcaseRef.current;
      if (!current || current.phase !== "open" || count < 2) return;
      const index = (current.index + step + count) % count;
      const url = new URL(window.location.href);
      url.searchParams.set(projectParam, projects[index].slug);
      window.history.replaceState(window.history.state, "", url);
      updateShowcase(() => ({
        index,
        phase: "open",
        entry: "fade",
        enterScale: 1,
      }));
      // Behind the showcase, tune the monitor to the same channel.
      scrollToProject(index, true);
      void rendererRef.current?.setFocusImage(
        projects[index].imageUrl ?? placeholderArtwork,
      );
    },
    [count, projects, scrollToProject, updateShowcase],
  );
  const showNext = useCallback(() => showSibling(1), [showSibling]);
  const showPrevious = useCallback(() => showSibling(-1), [showSibling]);

  useEffect(() => {
    const onPopState = () => {
      const slug = new URLSearchParams(window.location.search).get(
        projectParam,
      );
      const index = projects.findIndex((item) => item.slug === slug);
      if (index === -1) {
        pushedRef.current = false;
        void closeShowcase();
      } else if (!showcaseRef.current) {
        scrollToProject(index, true);
        void openShowcase(index, false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [closeShowcase, openShowcase, projects, scrollToProject]);

  // A shared link opens its project straight away, on its channel.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get(projectParam);
    const index = projects.findIndex((item) => item.slug === slug);
    if (index === -1) return;
    scrollToProject(index, true);
    lockPage();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once, after hydration
    setDived(true);
    updateShowcase(() => ({
      index,
      phase: "open",
      entry: "fade",
      enterScale: 1,
    }));
    // Mount only: later URL changes go through popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (showcaseRef.current) unlockPage();
    },
    [],
  );

  if (!project) {
    return (
      <section
        id="projets"
        className="theater theater-empty"
        aria-labelledby="projects-heading"
        data-nav-stops="0"
      >
        <h2 id="projects-heading">La suite se construit.</h2>
        <p>Les projets seront présentés ici dès leur publication.</p>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      id="projets"
      className="theater"
      aria-labelledby="projects-heading"
      data-powered={powered}
      data-webgl={webgl}
      data-dived={dived || undefined}
      // Read by the page's monitor (see MonitorStage).
      data-count={count}
      // The arrow keys rest on the title, then on each channel (see
      // KeyboardNavigation).
      data-nav-stops={[
        titleStop,
        ...projects.map((_, index) => channelStop(index)),
      ].join(" ")}
      style={
        {
          "--steps": INTRO + count + OUTRO,
          "--project-accent": project.accentColor,
        } as CSSProperties
      }
    >
      <div className="theater-sticky">
        <div className="theater-matrix" aria-hidden="true">
          <PixelMatrix
            color={matrixColor(project.accentColor)}
            cellSpacing={layout === "side" ? 15 : 12}
            influenceRadius={260}
            minScale={0.1}
            maxScale={0.62}
            fieldScale={0.86}
            restOpacity={0.22}
            // Narrow enough to leave the mark in the corner unfaded.
            edgeFade={56}
            intro={false}
            field={powered ? project.edgeMapUrl : null}
            fieldSource={powered ? fieldSourceOf(project) : null}
            fieldRect={layout === "side" ? sideField : stackedField}
            fieldFit="contain"
          />
        </div>

        <div className="theater-shade" aria-hidden="true" />

        <ProjectDeck
          projects={projects}
          layout={layout}
          sectionRef={sectionRef}
        />

        <header className="theater-header">
          <h2 id="projects-heading" className="theater-heading">
            {projectsChapter.title}
          </h2>
          <p className="theater-lead">{projectsChapter.lead}</p>
        </header>

        {/* The glass draws the project; this is its text and its button.
            Without WebGL, a flat monitor shows both. */}
        <div
          className={
            webgl === "failed"
              ? "theater-screen crt-fallback"
              : "theater-screen"
          }
          role="group"
          aria-roledescription="chaîne"
          aria-label={`Projet ${active + 1} sur ${count}`}
        >
          {webgl === "failed" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.imageUrl ?? placeholderArtwork}
              alt=""
              onError={recoverArtwork}
            />
          )}
          <div
            className={webgl === "failed" ? "theater-screen-info" : "sr-only"}
          >
            <p className="theater-screen-kicker">
              {projectKindLabels[project.kind]}{" "}
              <span aria-hidden="true">·</span> {projectPeriod(project)}
            </p>
            <h3 className="theater-screen-title">{project.title}</h3>
            <p className="theater-screen-summary">{project.summary}</p>
          </div>
          <button
            ref={triggerRef}
            className="theater-screen-button"
            onClick={() => void openShowcase(active)}
            onPointerEnter={() => rendererRef.current?.setHovered(true)}
            onPointerLeave={() => rendererRef.current?.setHovered(false)}
            onFocus={() => rendererRef.current?.setHovered(true)}
            onBlur={() => rendererRef.current?.setHovered(false)}
          >
            <span
              className={
                webgl === "failed"
                  ? "pixel-button pixel-button-light theater-screen-cta"
                  : "sr-only"
              }
            >
              Découvrir le projet
              <span className="sr-only"> {project.title}</span>
              {webgl === "failed" && <PixelArrow />}
            </span>
          </button>
        </div>

        <nav className="theater-rail" aria-label="Chaînes">
          <button
            className="theater-step"
            aria-label="Projet précédent"
            disabled={active === 0}
            onClick={() => scrollToProject(active - 1)}
          >
            <ChevronUp size={16} aria-hidden="true" />
          </button>
          <ol>
            {projects.map((item, index) => (
              <li key={item.id}>
                <button
                  aria-current={index === active ? "true" : undefined}
                  onClick={() => scrollToProject(index)}
                >
                  <span className="theater-rail-progress" aria-hidden="true" />
                  <span className="theater-rail-index">{pad(index + 1)}</span>
                  <span className="theater-rail-title">{item.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <button
            className="theater-step"
            aria-label="Projet suivant"
            disabled={active === count - 1}
            onClick={() => scrollToProject(active + 1)}
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </nav>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Projet {active + 1} sur {count} : {project.title}.
        </p>
      </div>

      {showcase && (
        <ProjectShowcase
          project={projects[showcase.index]}
          index={showcase.index}
          count={count}
          next={count > 1 ? projects[(showcase.index + 1) % count] : null}
          isDemo={source === "demo"}
          phase={showcase.phase}
          entry={showcase.entry}
          enterScale={showcase.enterScale}
          onClose={requestClose}
          onNext={showNext}
          onPrevious={showPrevious}
        />
      )}
    </section>
  );
}
