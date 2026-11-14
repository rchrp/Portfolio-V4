"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { restingPoints } from "@/components/keyboard-navigation";
import { hero } from "@/lib/site-content";
import { scrollPageTo } from "@/lib/smooth-scroll";

const links = [
  { id: "projets", label: "Projets" },
  { id: "contact", label: "Contact" },
];

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

// The page's only fixed chrome: the name, once the hero's own has scrolled
// away, and three destinations.
export function SiteHeader() {
  const [past, setPast] = useState(false);

  useEffect(() => {
    let frame = 0;
    const root = document.documentElement;
    const contact = document.getElementById("contact");
    const measure = () => {
      frame = 0;
      setPast(window.scrollY > window.innerHeight * 0.55);
      // With the stage, its director sets the tone. Without it, the contact
      // section darkens by itself: the header turns light once over it.
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
    <header className="site-header" data-past-hero={past || undefined}>
      <a
        href="#accueil"
        className="site-mark"
        onClick={(event) => jump(event, "accueil")}
        tabIndex={past ? undefined : -1}
        aria-hidden={past ? undefined : true}
      >
        <span className="site-mark-dot" aria-hidden="true" />
        {hero.firstName} {hero.lastName}
      </a>
      <nav className="site-nav" aria-label="Navigation principale">
        <a href="#projets" onClick={(event) => jump(event, links[0].id)}>
          {links[0].label}
        </a>
        <Link href="/parcours">Parcours</Link>
        <a href="#contact" onClick={(event) => jump(event, links[1].id)}>
          {links[1].label}
        </a>
      </nav>
    </header>
  );
}
