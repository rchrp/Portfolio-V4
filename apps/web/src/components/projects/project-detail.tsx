"use client";

import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { projectKindLabels, projectPeriod, type Project } from "@/lib/projects";
import { smoothElementScroll } from "@/lib/smooth-scroll";
import { ProjectGallery } from "./project-gallery";

type ProjectDetailProps = {
  project: Project;
  /** The page is on its way out. */
  leaving: boolean;
  /** Where the stage brings the project's cover. */
  coverRef: RefObject<HTMLElement | null>;
  next: Project;
  hasNext: boolean;
  onClose: () => void;
  onNext: () => void;
};

const subscribeToNothing = () => () => {};

// A project's own page, laid over the home page. The stage keeps drawing
// behind it: the cover that was in the carousel flattens into the frame kept
// here, and the matrix takes the project's colour and its world. The page
// reads top to bottom: what it is, the picture, the facts, the story, the
// screenshots, the way out.
export function ProjectDetail({
  project,
  leaving,
  coverRef,
  next,
  hasNext,
  onClose,
  onNext,
}: ProjectDetailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const coverElementRef = useRef<HTMLElement>(null);
  // The page is laid over the document's body, which only the browser has.
  const inBrowser = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  // The stage reads the cover's place every frame.
  useEffect(() => {
    coverRef.current = coverElementRef.current;
    return () => {
      coverRef.current = null;
    };
  }, [coverRef, inBrowser]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const returnTo = document.activeElement;
    scroller.focus({ preventScroll: true });
    const lenis = smoothElementScroll(scroller);

    // Everything else on the page is out of reach while this one is open.
    const behind = Array.from(
      document.querySelectorAll<HTMLElement>(".site, .site-header"),
    );
    for (const element of behind) element.inert = true;

    return () => {
      lenis?.destroy();
      for (const element of behind) element.inert = false;
      if (returnTo instanceof HTMLElement) {
        returnTo.focus({ preventScroll: true });
      }
    };
  }, [inBrowser]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const facts = [
    { label: "Rôle", value: project.role },
    ...(project.client ? [{ label: "Client", value: project.client }] : []),
    { label: "Type", value: project.category },
    { label: "Période", value: projectPeriod(project) },
  ];

  if (!inBrowser) return null;

  return createPortal(
    <div
      ref={scrollerRef}
      className="detail"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-title"
      data-leaving={leaving || undefined}
      tabIndex={-1}
    >
      <div className="detail-bar">
        <button type="button" className="detail-back" onClick={onClose}>
          <ArrowLeft size={17} aria-hidden="true" />
          Projets
        </button>
      </div>

      <article className="detail-page">
        <header className="detail-intro" data-calm>
          <p className="detail-kicker">
            {projectKindLabels[project.kind]}
            <span aria-hidden="true"> · </span>
            {projectPeriod(project)}
          </p>
          <h2 id="detail-title" className="detail-title">
            {project.title}
          </h2>
          <p className="detail-summary">{project.summary}</p>
        </header>

        <figure ref={coverElementRef} className="detail-cover">
          {project.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.imageUrl} alt={project.imageAlt ?? ""} />
          )}
        </figure>

        <section className="detail-body" aria-label="Présentation">
          <dl className="detail-facts" data-calm>
            {facts.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="detail-story" data-calm>
            <p>{project.description}</p>
            {project.highlights.length > 0 && (
              <ul className="detail-highlights">
                {project.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {project.metrics.length > 0 && (
          <ul className="detail-metrics" aria-label="En chiffres" data-calm>
            {project.metrics.map(({ value, label }) => (
              <li key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        )}

        {project.media.length > 0 && <ProjectGallery images={project.media} />}

        <section className="detail-close" aria-label="Technologies et liens">
          {project.technologies.length > 0 && (
            <div className="detail-stack" data-calm>
              <h3>Technologies</h3>
              <p>{project.technologies.join(" · ")}</p>
            </div>
          )}
          {(project.links.length > 0 || project.notice) && (
            <div className="detail-links" data-calm>
              {project.notice && (
                <p className="detail-notice">{project.notice}</p>
              )}
              {project.links.map((link) => (
                <a
                  key={link.url}
                  className="button button-outline"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                  <ArrowUpRight size={16} aria-hidden="true" />
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
              ))}
            </div>
          )}
        </section>

        <footer className="detail-end">
          <button type="button" className="detail-return" onClick={onClose}>
            <ArrowLeft size={17} aria-hidden="true" />
            Tous les projets
          </button>
          {hasNext && (
            <button
              type="button"
              className="detail-next"
              onClick={onNext}
              data-calm
            >
              <span className="detail-next-label">Projet suivant</span>
              <span className="detail-next-title">
                {next.title}
                <ArrowRight size={22} aria-hidden="true" />
              </span>
            </button>
          )}
        </footer>
      </article>
    </div>,
    document.body,
  );
}
