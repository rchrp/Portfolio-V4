"use client";

import { useEffect } from "react";
import { useStage } from "@/components/stage/stage";
import { direction } from "@/stage/direction";
import { clamp01, smoothstep } from "@/stage/math";
import { goldenMood, nightMood, quietMood } from "@/stage/moods";
import { driftScene, duskScene, meadowScene } from "@/stage/scenes";

const PORTRAIT = "/matrix/portrait-color.webp";

// Translates where the page is into what the stage shows: the golden meadow
// and the portrait over the hero, a quiet matrix through the middle of the
// page, the meadow by night at the contact section, and a project's own
// world while one is open.
export function HomeDirector() {
  const stage = useStage();

  useEffect(() => {
    if (!stage) return;
    const hero = document.getElementById("accueil");
    const slot = document.querySelector<HTMLElement>("[data-portrait-slot]");
    const contact = document.getElementById("contact");
    const projects = document.getElementById("projets");
    const root = document.documentElement;
    let cancelled = false;

    const image = new Image();
    image.decoding = "async";
    image.src = PORTRAIT;
    image
      .decode()
      .then(() => {
        if (cancelled) return;
        stage.portrait.setImage(image);
        stage.invalidate();
      })
      .catch(() => {});

    const release = stage.direct((engine) => {
      const viewport = engine.height;
      const scroll = window.scrollY;
      const project = direction.project;

      // Hero: how far it has been scrolled away, 0 to 1.
      const heroHeight = hero?.offsetHeight ?? viewport;
      const away = clamp01(scroll / Math.max(1, heroHeight));
      const portraitPresence = project ? 0 : 1 - smoothstep(0.06, 0.6, away);

      if (slot) {
        // The slot's place in the page: the portrait stays there, fixed to
        // the screen, and dissolves as the hero scrolls away.
        const bounds = slot.getBoundingClientRect();
        const top = bounds.top + scroll;
        engine.portrait.setRect({
          x: Math.round(bounds.left),
          y: Math.round(top),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        });
        engine.setHalo(
          bounds.left + bounds.width * 0.5,
          top + bounds.height * 0.34,
          Math.max(bounds.width, bounds.height) * 0.56,
          portraitPresence,
        );
      }
      engine.portrait.target = portraitPresence;

      // Contact: night falls as the section rises into view.
      const contactTop = contact
        ? contact.getBoundingClientRect().top
        : Infinity;
      const night =
        1 - smoothstep(viewport * 0.18, viewport * 0.92, contactTop);

      if (project) {
        engine.setMood(project.mood);
        engine.setScene(project.scene);
      } else if (night > 0) {
        engine.setMoodMix(quietMood, nightMood, night);
        engine.setScene(night > 0.25 ? duskScene : null);
      } else {
        const golden = 1 - smoothstep(0.2, 0.75, away);
        engine.setMoodMix(quietMood, goldenMood, golden);
        const projectsTop = projects
          ? projects.getBoundingClientRect().top
          : Infinity;
        // The grass sinks as soon as the hero starts to leave; the
        // butterflies keep the reader company until the projects.
        engine.setScene(
          away < 0.14
            ? meadowScene
            : projectsTop > viewport * 0.7
              ? driftScene
              : null,
        );
      }

      // Fixed chrome reads the tone of what lies behind it.
      const tone = !project && night > 0.55 ? "dark" : "light";
      if (root.dataset.tone !== tone) root.dataset.tone = tone;
    });

    return () => {
      cancelled = true;
      release();
      stage.portrait.setRect(null);
      stage.portrait.target = 0;
      delete root.dataset.tone;
    };
  }, [stage]);

  return null;
}
