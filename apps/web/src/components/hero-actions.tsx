"use client";

import type { MouseEvent } from "react";
import { scrollToSection } from "@/components/site-header";

function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (scrollToSection(id)) event.preventDefault();
}

export function HeroActions() {
  return (
    <div className="hero-actions">
      <a
        className="button button-solid"
        href="#contact"
        onClick={(event) => jump(event, "contact")}
      >
        Me contacter
      </a>
      <a
        className="button glass"
        href="#projets"
        onClick={(event) => jump(event, "projets")}
      >
        Voir les projets
        <span className="button-arrow" aria-hidden="true" />
      </a>
    </div>
  );
}
