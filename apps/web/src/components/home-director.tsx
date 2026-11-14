"use client";

import { useEffect } from "react";
import { useStage } from "@/components/stage/stage";
import { direction } from "@/stage/direction";
import { smoothstep } from "@/stage/math";
import { nightMood, quietMood, sunsetMood } from "@/stage/moods";
import { duskScene } from "@/stage/scenes";

const PORTRAIT = "/portrait.webp";

// Translates where the page is into what the stage shows: the hero filling
// the screen at the top, then drawing back into a card of the carousel; a
// quiet matrix behind the projects; a project's own world while one is open;
// sunset, then the meadow by night, at the contact section.
export function HomeDirector() {
  const stage = useStage();

  useEffect(() => {
    if (!stage) return;
    const hero = document.querySelector<HTMLElement>(".story-hero");
    const portraitSlot = document.querySelector<HTMLElement>(
      "[data-portrait-slot]",
    );
    const nameSlot = document.querySelector<HTMLElement>("[data-name-slot]");
    const contact = document.getElementById("contact");
    const root = document.documentElement;
    let cancelled = false;

    const image = new Image();
    image.decoding = "async";
    image.src = PORTRAIT;
    image
      .decode()
      .then(() => {
        if (cancelled) return;
        stage.hero.portrait.setImage(image);
        stage.invalidate();
      })
      .catch(() => {});

    const release = stage.direct((engine) => {
      const viewport = window.innerHeight;
      const project = direction.project;
      const { position, opened } = direction.story;

      // The hero's slots, measured in the hero's own frame: it stays at the
      // top of the screen for as long as the story is held there.
      const frame = hero?.getBoundingClientRect();
      const originX = frame?.left ?? 0;
      const originY = frame?.top ?? 0;
      if (portraitSlot) {
        const bounds = portraitSlot.getBoundingClientRect();
        engine.hero.portrait.setRect({
          x: Math.round(bounds.left - originX),
          y: Math.round(bounds.top - originY),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        });
      }
      if (nameSlot) {
        const bounds = nameSlot.getBoundingClientRect();
        const previous = engine.hero.nameRect;
        const x = Math.round(bounds.left - originX);
        const y = Math.round(bounds.top - originY);
        const width = Math.round(bounds.width);
        const height = Math.round(bounds.height);
        if (
          !previous ||
          previous.x !== x ||
          previous.y !== y ||
          previous.width !== width ||
          previous.height !== height
        ) {
          engine.hero.nameRect = { x, y, width, height };
        }
      }

      // The hero fills the screen at the top, is a card while it is near
      // the middle of the carousel, and is left alone otherwise.
      const onScreen = frame ? frame.bottom > 0 : false;
      engine.heroMode =
        !onScreen || (project && opened > 0.6)
          ? "hidden"
          : position <= 0 && opened === 0
            ? "full"
            : position < 2.4
              ? "card"
              : "hidden";

      // Contact: night falls as the section rises into view.
      const contactTop = contact
        ? contact.getBoundingClientRect().top
        : Infinity;
      const night = 1 - smoothstep(viewport * 0.1, viewport * 0.6, contactTop);

      if (project) {
        engine.setMood(project.mood);
        engine.setScene(project.scene);
      } else if (night > 0) {
        // The page does not simply darken: the sky turns to sunset first.
        if (night < 0.45) {
          engine.setMoodMix(quietMood, sunsetMood, night / 0.45);
        } else {
          engine.setMoodMix(sunsetMood, nightMood, (night - 0.45) / 0.55);
        }
        engine.setScene(night > 0.3 ? duskScene : null);
      } else {
        engine.setMood(quietMood);
        engine.setScene(null);
      }

      // Fixed chrome reads the tone of what lies behind it.
      const tone = !project && night > 0.55 ? "dark" : "light";
      if (root.dataset.tone !== tone) root.dataset.tone = tone;
    });

    return () => {
      cancelled = true;
      release();
      stage.hero.portrait.setRect(null);
      delete root.dataset.tone;
    };
  }, [stage]);

  return null;
}
