"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { PixelArrow } from "@/components/pixel-arrow";
import { PixelMatrix, type FieldRect } from "@/components/pixel-matrix";
import type { Project, ProjectCatalog } from "@/lib/projects";
import { projectsChapter } from "@/lib/site-content";
import { useScrollProgress } from "@/lib/use-scroll-progress";
import type { CrtRenderer, TheaterLayout } from "./crt-renderer";
import { ProjectDialog, recoverArtwork } from "./project-dialog";
import { ScrambleText } from "./scramble-text";

// Scroll budget, in viewport heights: approaching the monitor, one channel per
// project, then switching it off.
const INTRO = 1.1;
const OUTRO = 0.9;

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
  const [detail, setDetail] = useState<Project | null>(null);
  const project = projects[active];
  const count = projects.length;

  const screenProject = useMemo(
    () =>
      project && {
        slug: project.slug,
        title: project.title,
        year: project.year,
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

  const scrollToProject = (index: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const top =
      section.getBoundingClientRect().top +
      window.scrollY +
      (INTRO + clamp(index, 0, count - 1) + 0.35) * window.innerHeight;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? activeRef.current + 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? activeRef.current - 1
          : null;
    if (next === null || next < 0 || next >= count) return;
    event.preventDefault();
    scrollToProject(next);
  };

  if (!project) {
    return (
      <section
        id="projets"
        className="theater theater-empty"
        aria-labelledby="projects-heading"
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
            fieldSource={powered ? project.imageUrl : null}
            fieldRect={layout === "side" ? sideField : stackedField}
            fieldFit={layout === "side" ? "contain" : "cover"}
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
          onKeyDown={onKeyDown}
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
            {project.category} <span aria-hidden="true">·</span> {project.year}
          </p>
          <ul
            key={`tech-${project.id}`}
            className="theater-technologies"
            aria-label="Technologies"
          >
            {project.technologies.map((technology, index) => (
              <li
                key={`${technology}-${index}`}
                style={{ "--i": index } as CSSProperties}
              >
                {technology}
              </li>
            ))}
          </ul>
          <button
            className="pixel-button pixel-button-dark"
            onClick={() => setDetail(project)}
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

      {detail && (
        <ProjectDialog
          project={detail}
          isDemo={source === "demo"}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
}
