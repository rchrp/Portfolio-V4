"use client";

import type { MouseEvent } from "react";
import { useEffect } from "react";
import { restingPoints } from "@/components/keyboard-navigation";
import { hero } from "@/lib/site-content";
import { scrollPageTo } from "@/lib/smooth-scroll";

/** Glides to where a section rests, rather than to its first pixel. */
export function scrollToSection(id: string) {
  const element = document.getElementById(id);
  if (!element) return false;
  const [rest = element.getBoundingClientRect().top + window.scrollY] =
    restingPoints(element);
  scrollPageTo(rest);
  return true;
}

function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (scrollToSection(id)) event.preventDefault();
}

// The page's only fixed chrome: the name, and three destinations on a pane
// of glass.
export function SiteHeader() {
  // Without the stage, the contact section darkens by itself: the header
  // turns light once over it. With it, the stage's director sets the tone.
  useEffect(() => {
    const root = document.documentElement;
    const contact = document.getElementById("contact");
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (root.dataset.stage === "on" || !contact) return;
      const { top } = contact.getBoundingClientRect();
      root.dataset.tone =
        top + window.innerHeight * 0.3 < 40 ? "dark" : "light";
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header className="site-header">
      <a
        href="#accueil"
        className="site-mark"
        onClick={(event) => jump(event, "accueil")}
      >
        <span className="site-mark-dot" aria-hidden="true" />
        {hero.firstName.charAt(0)}. {hero.lastName}
      </a>
      <nav className="site-nav glass" aria-label="Navigation principale">
        <a href="#projets" onClick={(event) => jump(event, "projets")}>
          Projets
        </a>
        <a href="#parcours" onClick={(event) => jump(event, "parcours")}>
          Parcours
        </a>
        <a href="#contact" onClick={(event) => jump(event, "contact")}>
          Contact
        </a>
      </nav>
    </header>
  );
}
