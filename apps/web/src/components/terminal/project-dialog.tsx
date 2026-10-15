"use client";

import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useRef, type SyntheticEvent } from "react";
import type { Project } from "@/lib/projects";

export function recoverArtwork(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.fallback) return;
  image.dataset.fallback = "true";
  image.src = "/projects/placeholder.svg";
}

export function ProjectDialog({
  project,
  isDemo,
  onClose,
}: {
  project: Project;
  isDemo: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      dialog.close();
      trigger?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="project-dialog"
      aria-labelledby="project-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <div className="project-dialog-bar">
        <span aria-hidden="true">{project.slug}.app</span>
        <button
          className="project-dialog-close"
          aria-label="Fermer le projet"
          autoFocus
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="project-dialog-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={project.imageUrl ?? "/projects/placeholder.svg"}
          alt={project.imageAlt ?? `Aperçu de ${project.title}`}
          onError={recoverArtwork}
        />
      </div>
      <div className="project-dialog-content">
        <p className="chapter-label">
          {project.category} / {project.year}
        </p>
        <h2 id="project-dialog-title">{project.title}</h2>
        <p className="project-dialog-description">{project.description}</p>
        <dl>
          <div>
            <dt>Intervention</dt>
            <dd>{project.role}</dd>
          </div>
          <div>
            <dt>Technologies</dt>
            <dd>{project.technologies.join(" · ") || "Non renseignées"}</dd>
          </div>
        </dl>
        <div className="project-dialog-links">
          {project.liveUrl && (
            <a href={project.liveUrl} target="_blank" rel="noopener noreferrer">
              Voir le site <ArrowUpRight size={16} aria-hidden="true" />
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          )}
          {project.sourceUrl && (
            <a
              href={project.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Code source <ArrowUpRight size={16} aria-hidden="true" />
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          )}
        </div>
        {isDemo && (
          <p className="project-demo-note">
            Projet de démonstration. Ce concept illustre la présentation de vos
            futurs projets ; il ne correspond pas à une réalisation client.
          </p>
        )}
      </div>
    </dialog>
  );
}
