"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { goToStop } from "./keyboard-navigation";

// Bottom of the hero: invites to scroll, and shows that the arrow keys move
// from one chapter to the next. The keys are hidden on touch screens.
export function ScrollHint() {
  return (
    <button
      type="button"
      className="scroll-hint"
      aria-label="Passer à la suite"
      onClick={() => goToStop(1)}
    >
      <span className="scroll-hint-label">Défiler</span>
      <span className="scroll-hint-track" aria-hidden="true" />
      <span className="scroll-hint-keys" aria-hidden="true">
        <kbd>
          <ArrowUp size={11} strokeWidth={2.25} />
        </kbd>
        <kbd data-pulse>
          <ArrowDown size={11} strokeWidth={2.25} />
        </kbd>
      </span>
    </button>
  );
}
