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
import { PixelMatrix, type FieldRect } from "@/components/pixel-matrix";
import {
  projectKindLabels,
  projectPeriod,
  type ProjectCatalog,
} from "@/lib/projects";
import { projectsChapter } from "@/lib/site-content";
import { useScrollProgress } from "@/lib/use-scroll-progress";
import type { CrtRenderer, TheaterLayout } from "./crt-renderer";
import {
  placeholderArtwork,
  ProjectShowcase,
  recoverArtwork,
  type ShowcaseEntry,
  type ShowcasePhase,
} from "./project-showcase";
import { ScrambleText } from "./scramble-text";

// Scroll budget, in viewport heights: approaching the monitor, one channel per
// project, then switching it off.
const INTRO = 1.1;
const OUTRO = 0.9;

// Where each channel rests, in viewport heights from the top of the section.
const channelStop = (index: number) => INTRO + index + 0.35;

const brandRgb = [241, 90, 36];
// Left of the monitor, above the project title: the monitor would hide it.
const sideField: FieldRect = { x: 0.02, y: 0.07, width: 0.38, height: 0.42 };
const stackedField: FieldRect = { x: 0, y: 0, width: 1, height: 0.62 };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

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
};

const unlockPage = () => {
  document.body.style.overflow = "";
  window.history.scrollRestoration = "auto";
};

type Showcase = {
  index: number;
  phase: ShowcasePhase;
  entry: ShowcaseEntry;
  enterScale: number;
};

// The chips stay on one or two lines; the showcase lists the whole stack.
const maxTechnologies = 5;

export function ProjectTheater({ catalog }: { catalog: ProjectCatalog }) {
  const { projects, source } = catalog;
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CrtRenderer | null>(null);
  const activeRef = useRef(0);
  const poweredRef = useRef(false);
  const [active, setActive] = useState(0);
  const [powered, setPowered] = useState(false);
  const [layout, setLayout] = useState<TheaterLayout>("side");
  const [webgl, setWebgl] = useState<"pending" | "ready" | "failed">("pending");
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

  const screenProject = useMemo(
    () =>
      project && {
        slug: project.slug,
        title: project.title,
        year: project.startYear,
        technologies: project.technologies,
        imageUrl: project.imageUrl,
        accentColor: project.accentColor,
        index: active,
        total: count,
      },
    [project, active, count],
  );

  useEffect(() => {
    const query = window.matchMedia(
      "(max-width: 52rem), (max-aspect-ratio: 4/5)",
    );
    const update = () => setLayout(query.matches ? "stacked" : "side");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // The three.js scene is loaded on demand, once the page is interactive.
  useEffect(() => {
    const canvas = canvasRef.current;
    const sticky = stickyRef.current;
    if (!canvas || !sticky || count === 0) return;
    let disposed = false;
    let renderer: CrtRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;

    const start = async () => {
      try {
        const [{ CrtRenderer }] = await Promise.all([
          import("./crt-renderer"),
          document.fonts?.ready,
        ]);
        if (disposed) return;
        const styles = getComputedStyle(document.body);
        renderer = new CrtRenderer(canvas, {
          mono: styles.getPropertyValue("--font-geist-mono") || "monospace",
          sans: styles.getPropertyValue("--font-geist-sans") || "sans-serif",
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
        });
        await renderer.load("/models/computer-terminal.glb");
        if (disposed) {
          renderer.dispose();
          return;
        }
        rendererRef.current = renderer;
        resizeObserver = new ResizeObserver(([entry]) =>
          renderer?.resize(entry.contentRect.width, entry.contentRect.height),
        );
        resizeObserver.observe(canvas);
        intersectionObserver = new IntersectionObserver(([entry]) =>
          renderer?.setActive(entry.isIntersecting),
        );
        intersectionObserver.observe(sticky);
        setWebgl("ready");
      } catch {
        renderer?.dispose();
        renderer = null;
        if (!disposed) setWebgl("failed");
      }
    };
    void start();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, [count]);

  useEffect(() => {
    rendererRef.current?.setLayout(layout);
  }, [layout, webgl]);

  useEffect(() => {
    if (screenProject) rendererRef.current?.showProject(screenProject);
  }, [screenProject, webgl]);

  useEffect(() => {
    rendererRef.current?.setPower(powered);
  }, [powered, webgl]);

  useScrollProgress(sectionRef, ({ offset, viewport }) => {
    if (count === 0) return;
    const steps = offset / viewport;
    const intro = clamp(steps / INTRO, 0, 1);
    const projectPosition = clamp(steps - INTRO, 0, count);
    const outro = clamp((steps - INTRO - count) / OUTRO, 0, 1);
    const index = clamp(Math.floor(projectPosition), 0, count - 1);
    const shouldPower = intro > 0.55 && outro < 0.45;

    rendererRef.current?.setScroll({ intro, project: projectPosition, outro });
    const style = sectionRef.current?.style;
    style?.setProperty("--intro", intro.toFixed(4));
    style?.setProperty("--outro", outro.toFixed(4));
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
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      window.scrollTo({
        top,
        behavior: instant || reduced ? "auto" : "smooth",
      });
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
      // The arrow keys rest on each channel (see KeyboardNavigation).
      data-nav-stops={projects.map((_, index) => channelStop(index)).join(" ")}
      style={
        {
          "--steps": INTRO + count + OUTRO,
          "--project-accent": project.accentColor,
        } as CSSProperties
      }
    >
      <div
        ref={stickyRef}
        className="theater-sticky"
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const bounds = event.currentTarget.getBoundingClientRect();
          rendererRef.current?.setPointer(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
          );
        }}
      >
        <div className="theater-matrix" aria-hidden="true">
          <PixelMatrix
            color={matrixColor(project.accentColor)}
            cellSpacing={layout === "side" ? 15 : 12}
            influenceRadius={260}
            minScale={0.1}
            maxScale={0.62}
            fieldScale={0.86}
            restOpacity={0.22}
            edgeFade={90}
            intro={false}
            field={powered ? project.edgeMapUrl : null}
            fieldSource={powered ? (project.logoUrl ?? project.imageUrl) : null}
            fieldRect={layout === "side" ? sideField : stackedField}
            // A logo is never cropped; a cover fills the stacked layout.
            fieldFit={
              layout === "side" || project.logoUrl ? "contain" : "cover"
            }
          />
        </div>

        <canvas ref={canvasRef} className="theater-canvas" aria-hidden="true" />
        {webgl === "failed" && (
          <div className="crt-fallback" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={project.imageUrl ?? "/projects/placeholder.svg"}
              alt=""
              onError={recoverArtwork}
            />
          </div>
        )}
        <div className="theater-shade" aria-hidden="true" />

        <header className="theater-header">
          <h2 id="projects-heading" className="theater-heading">
            {projectsChapter.title}
          </h2>
          <p className="theater-lead">{projectsChapter.lead}</p>
        </header>

        <div
          className="theater-info"
          role="group"
          aria-roledescription="chaîne"
          aria-label={`Projet ${active + 1} sur ${count}`}
          tabIndex={0}
        >
          <h3 className="theater-title">
            <span
              key={`index-${project.id}`}
              className="big-index theater-index"
              aria-hidden="true"
            >
              {pad(active + 1)}
            </span>
            <ScrambleText text={project.title} />
          </h3>
          <p key={`summary-${project.id}`} className="theater-summary">
            {project.summary}
          </p>
          <p key={`meta-${project.id}`} className="theater-meta">
            {projectKindLabels[project.kind]} <span aria-hidden="true">·</span>{" "}
            {projectPeriod(project)}
          </p>
          <ul
            key={`tech-${project.id}`}
            className="theater-technologies"
            aria-label="Technologies"
          >
            {project.technologies
              .slice(0, maxTechnologies)
              .map((technology, index) => (
                <li
                  key={`${technology}-${index}`}
                  style={{ "--i": index } as CSSProperties}
                >
                  {technology}
                </li>
              ))}
            {project.technologies.length > maxTechnologies && (
              <li
                style={{ "--i": maxTechnologies } as CSSProperties}
                aria-label={`et ${project.technologies.length - maxTechnologies} autres`}
              >
                +{project.technologies.length - maxTechnologies}
              </li>
            )}
          </ul>
          <button
            ref={triggerRef}
            className="pixel-button pixel-button-dark"
            onClick={() => void openShowcase(active)}
          >
            Découvrir le projet
            <PixelArrow />
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
                  <span className="theater-rail-index">{pad(index + 1)}</span>
                  <span className="theater-rail-title">{item.title}</span>
                  <span className="theater-rail-progress" aria-hidden="true" />
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
