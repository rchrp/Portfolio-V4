"use client";

import { useRef, type CSSProperties, type RefObject } from "react";
import { projectKindLabels, projectPeriod, type Project } from "@/lib/projects";
import { useScrollProgress } from "@/lib/use-scroll-progress";
import { cardTracks, deckPresence, placeCard } from "./card-track";
import type { StageLayout } from "./monitor-path";
import { placeholderArtwork, recoverArtwork } from "./project-showcase";
import { theaterProgress } from "./theater-timeline";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The projects as panes of glass sliding by behind the monitor, the wall's
 * light blurred through them; the glass shows them in x-ray as they pass
 * behind it (see card-track.ts). Decorative: the rail lists the same
 * projects.
 */
export function ProjectDeck({
  projects,
  layout,
  sectionRef,
}: {
  projects: Project[];
  layout: StageLayout;
  /** The chapter, whose scroll moves the cards. */
  sectionRef: RefObject<HTMLElement | null>;
}) {
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const track = cardTracks[layout];

  // Placed in shares of the deck (see .theater-card): they stay right while
  // the deck is hidden, waiting for the monitor, and as it resizes.
  useScrollProgress(sectionRef, ({ offset, viewport }) => {
    const { intro, outro, project } = theaterProgress(
      offset / viewport,
      projects.length,
    );
    const presence = deckPresence(intro, outro);
    cardsRef.current.forEach((card, index) => {
      if (!card) return;
      const placement = placeCard(project, index, layout);
      const opacity = presence * placement.opacity;
      if (opacity < 0.002) {
        card.style.visibility = "hidden";
        return;
      }
      card.style.visibility = "visible";
      card.style.opacity = opacity.toFixed(3);
      card.style.setProperty("--card-x", placement.x.toFixed(4));
      card.style.setProperty("--card-y", placement.y.toFixed(4));
      card.style.setProperty(
        "--card-scale",
        (placement.height / track.size).toFixed(4),
      );
    });
  });

  return (
    <div
      className="theater-deck"
      aria-hidden="true"
      style={{ "--card-height": `${track.size * 100}svh` } as CSSProperties}
    >
      {projects.map((project, index) => (
        <div
          key={project.id}
          ref={(card) => {
            cardsRef.current[index] = card;
          }}
          className="theater-card"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={project.imageUrl ?? placeholderArtwork}
            alt=""
            decoding="async"
            onError={recoverArtwork}
          />
          <span className="theater-card-index">
            {pad(index + 1)} / {pad(projects.length)}
          </span>
          <span className="theater-card-caption">
            <span className="theater-card-kicker">
              {projectKindLabels[project.kind]} · {projectPeriod(project)}
            </span>
            <span className="theater-card-title">{project.title}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
