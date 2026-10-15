"use client";

import { useEffect, useRef } from "react";

const glyphs = "▓▒░█<>/\\#*+=01RC";

/**
 * Text that decodes from random glyphs into its value whenever it changes.
 * Assistive technologies only ever read the final text.
 */
export function ScrambleText({
  text,
  duration = 620,
  className,
}: {
  text: string;
  duration?: number;
  className?: string;
}) {
  const outputRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const output = outputRef.current;
    if (!output) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      output.textContent = text;
      return;
    }

    const startedAt = performance.now();
    let frame = 0;
    const render = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      output.textContent = Array.from(text, (character, index) => {
        if (character === " ") return " ";
        // Characters settle from left to right with a little jitter.
        const settleAt = (index / text.length) * 0.7 + 0.25;
        return progress >= settleAt
          ? character
          : glyphs[Math.floor(Math.random() * glyphs.length)];
      }).join("");
      if (progress < 1) frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [duration, text]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span ref={outputRef} aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
