"use client";

import { ArrowLeft, ArrowUpRight } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import { PixelArrow } from "@/components/pixel-arrow";
import type { Project } from "@/lib/projects";
import { useScrollProgress } from "@/lib/use-scroll-progress";

export const placeholderArtwork = "/projects/placeholder.svg";

export function recoverArtwork(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.fallback) return;
  image.dataset.fallback = "true";
  image.src = placeholderArtwork;
}

/**
 * - `entering`: mounted but invisible while the camera dives into the CRT,
 * - `open`: shown, taking over from the picture on the glass,
 * - `closing`: fading back to the glass before the camera pulls out.
 */
export type ShowcasePhase = "entering" | "open" | "closing";

/** How the picture arrives: from the CRT glass, or simply faded in. */
export type ShowcaseEntry = "dive" | "fade";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const pad = (value: number) => String(value).padStart(2, "0");

function splitWords(text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => ({ word, index }));
}

export function ProjectShowcase({
  project,
  index,
  count,
  next,
  isDemo,
  phase,
  entry,
  enterScale,
  onClose,
  onNext,
}: {
  project: Project;
  index: number;
  count: number;
  next: Project | null;
  isDemo: boolean;
  phase: ShowcasePhase;
  entry: ShowcaseEntry;
  /** Scale of the picture on the glass, relative to it covering the viewport. */
  enterScale: number;
  onClose: () => void;
  onNext: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const words = useMemo(
    () => splitWords(project.description),
    [project.description],
  );
  const image = project.imageUrl ?? placeholderArtwork;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // No dialog.close() on unmount: the element leaves the top layer when
    // React removes it.
  }, []);

  // A new project starts from its picture.
  useEffect(() => {
    dialogRef.current?.scrollTo({ top: 0 });
  }, [project.id]);

  // The description lights up word by word while its chapter is pinned.
  useScrollProgress(
    storyRef,
    ({ progress }) => {
      storyRef.current?.style.setProperty(
        "--words",
        clamp01((progress - 0.04) / 0.72).toFixed(4),
      );
    },
    0,
    dialogRef,
  );

  const facts = [
    { label: "Intervention", value: project.role },
    { label: "Catégorie", value: project.category },
    { label: "Année", value: String(project.year) },
  ];

  return (
    <dialog
      ref={dialogRef}
      className="showcase"
      aria-labelledby="showcase-title"
      data-phase={phase}
      data-entry={entry}
      style={
        {
          "--enter-scale": enterScale,
          "--project-accent": project.accentColor,
        } as CSSProperties
      }
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="showcase-bar">
        <button className="showcase-back" onClick={onClose}>
          <ArrowLeft size={16} aria-hidden="true" />
          Projets
        </button>
        <p className="showcase-counter">
          <span className="sr-only">Projet </span>
          {pad(index + 1)}
          <span aria-hidden="true"> / </span>
          <span className="sr-only"> sur </span>
          {pad(count)}
        </p>
      </div>

      <div key={project.id} className="showcase-content">
        <header className="showcase-hero">
          <div className="showcase-picture">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={project.imageAlt ?? `Aperçu de ${project.title}`}
              decoding="async"
              fetchPriority="high"
              onError={recoverArtwork}
            />
          </div>
          <div className="showcase-blur" aria-hidden="true" />

          <div className="showcase-intro">
            <div className="showcase-intro-main">
              <p className="showcase-kicker">
                <span>{project.category}</span>
                <span className="showcase-kicker-divider" aria-hidden="true">
                  ·
                </span>
                <span>{project.year}</span>
              </p>
              <h2 id="showcase-title" className="showcase-title">
                <span className="big-index" aria-hidden="true">
                  {pad(index + 1)}
                </span>
                {project.title}
              </h2>
              <p className="showcase-summary">{project.summary}</p>
            </div>

            <div className="showcase-intro-side">
              <dl className="showcase-glance">
                <div>
                  <dt>Rôle</dt>
                  <dd>{project.role}</dd>
                </div>
                {project.technologies.length > 0 && (
                  <div>
                    <dt>Stack</dt>
                    <dd>{project.technologies.join(" · ")}</dd>
                  </div>
                )}
              </dl>
              <ProjectLinks project={project} />
            </div>
          </div>

          <p className="showcase-cue" aria-hidden="true">
            Défiler
            <span />
          </p>
        </header>

        {words.length > 0 && (
          <section
            ref={storyRef}
            className="showcase-story"
            aria-labelledby="showcase-story-heading"
            data-length={words.length > 60 ? "long" : undefined}
            style={{ "--n": words.length } as CSSProperties}
          >
            <div className="showcase-story-sticky">
              <h3 id="showcase-story-heading" className="showcase-label">
                <span>01</span> Le projet
              </h3>
              <p className="showcase-story-text">
                <span className="sr-only">{project.description}</span>
                <span aria-hidden="true">
                  {words.map(({ word, index: wordIndex }) => (
                    <span
                      key={wordIndex}
                      className="showcase-word"
                      style={{ "--i": wordIndex } as CSSProperties}
                    >
                      {word}{" "}
                    </span>
                  ))}
                </span>
              </p>
            </div>
          </section>
        )}

        <section
          className="showcase-facts"
          aria-labelledby="showcase-facts-heading"
        >
          <h3
            id="showcase-facts-heading"
            className="showcase-label showcase-reveal"
          >
            <span>02</span> En bref
          </h3>
          <dl>
            {facts.map(({ label, value }, factIndex) => (
              <div
                key={label}
                className="showcase-fact showcase-reveal"
                style={{ "--i": factIndex } as CSSProperties}
              >
                <span className="big-index" aria-hidden="true">
                  {pad(factIndex + 1)}
                </span>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {project.technologies.length > 0 && (
          <section
            className="showcase-stack"
            aria-labelledby="showcase-stack-heading"
          >
            <h3
              id="showcase-stack-heading"
              className="showcase-label showcase-reveal"
            >
              <span>03</span> Technologies
            </h3>
            <ul>
              {project.technologies.map((technology, technologyIndex) => (
                <li
                  key={`${technology}-${technologyIndex}`}
                  className="showcase-reveal"
                >
                  <span className="showcase-stack-index" aria-hidden="true">
                    {pad(technologyIndex + 1)}
                  </span>
                  {technology}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(project.liveUrl || project.sourceUrl || isDemo) && (
          <section className="showcase-visit showcase-reveal">
            <ProjectLinks project={project} />
            {isDemo && (
              <p className="showcase-demo-note">
                Projet de démonstration. Ce concept illustre la présentation de
                vos futurs projets ; il ne correspond pas à une réalisation
                client.
              </p>
            )}
          </section>
        )}

        <footer className="showcase-footer">
          {next && (
            <button className="showcase-next" onClick={onNext}>
              <span className="showcase-next-picture" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={next.imageUrl ?? placeholderArtwork}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={recoverArtwork}
                />
              </span>
              <span className="showcase-label">Projet suivant</span>
              <span className="showcase-next-title">
                {next.title}
                <PixelArrow />
              </span>
            </button>
          )}
          <button className="pixel-button showcase-return" onClick={onClose}>
            Retour aux projets
            <PixelArrow />
          </button>
        </footer>
      </div>
    </dialog>
  );
}

function ProjectLinks({ project }: { project: Project }) {
  if (!project.liveUrl && !project.sourceUrl) return null;
  return (
    <div className="showcase-links">
      {project.liveUrl && (
        <a
          className="pixel-button pixel-button-light"
          href={project.liveUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Voir le site
          <ArrowUpRight size={16} aria-hidden="true" />
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
      )}
      {project.sourceUrl && (
        <a
          className="pixel-button"
          href={project.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Code source
          <ArrowUpRight size={16} aria-hidden="true" />
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
      )}
    </div>
  );
}
