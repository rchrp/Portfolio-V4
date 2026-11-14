"use client";

import { useRef, type CSSProperties } from "react";
import { manifesto } from "@/lib/site-content";
import { useScrollProgress } from "@/lib/use-scroll-progress";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const words = manifesto.text.split(/(\*[^*]+\*)/).flatMap((part) =>
  part.startsWith("*")
    ? part
        .slice(1, -1)
        .split(/\s+/)
        .map((word) => ({ word, accent: true }))
    : part
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => ({ word, accent: false })),
);

// The statement, inked in word by word as it scrolls into the middle of the
// screen, then what I do, in three plain lines.
export function About() {
  const sectionRef = useRef<HTMLElement>(null);

  useScrollProgress(
    sectionRef,
    ({ offset, viewport }) => {
      // 0 as the section's top passes the bottom third of the screen, 1 once
      // it has risen to the top third.
      const progress = clamp01(offset / (viewport * 0.5) - 0.3);
      sectionRef.current?.style.setProperty("--read", progress.toFixed(4));
    },
    -1,
  );

  return (
    <section
      ref={sectionRef}
      id="a-propos"
      className="about"
      aria-labelledby="about-heading"
      data-nav-stops="0"
      style={{ "--n": words.length } as CSSProperties}
    >
      <h2 id="about-heading" className="about-statement">
        <span className="sr-only">{manifesto.text.replaceAll("*", "")}</span>
        <span aria-hidden="true">
          {words.map(({ word, accent }, index) => (
            <span
              key={`${word}-${index}`}
              className="about-word"
              data-accent={accent || undefined}
              style={{ "--i": index } as CSSProperties}
            >
              {word}{" "}
            </span>
          ))}
        </span>
      </h2>
      <ul className="about-disciplines">
        {manifesto.disciplines.map(({ label, detail }) => (
          <li key={label}>
            <strong>{label}</strong>
            <span>{detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
