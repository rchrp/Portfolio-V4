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

// Pixels floating at three depths behind the statement, spread evenly by a
// low-discrepancy (R2) sequence: the nearer, the faster they rise (see the
// parallax rules in globals.css).
const motes = Array.from({ length: 21 }, (_, index) => ({
  x: `${(((0.5 + 0.7548776662 * index) % 1) * 100).toFixed(2)}%`,
  y: `${(((0.5 + 0.569840291 * index) % 1) * 100).toFixed(2)}%`,
  depth: (index % 3) + 1,
}));

// Chapter 1: in the dark, the statement lights up word by word.
export function Manifesto() {
  const sectionRef = useRef<HTMLElement>(null);

  useScrollProgress(
    sectionRef,
    ({ progress }) => {
      const style = sectionRef.current?.style;
      if (!style) return;
      style.setProperty("--words", clamp01((progress - 0.3) / 0.45).toFixed(4));
      style.setProperty("--tail", clamp01((progress - 0.74) / 0.14).toFixed(4));
    },
    -1,
  );

  return (
    <section
      ref={sectionRef}
      className="manifesto"
      aria-labelledby="manifesto-heading"
      // Once the statement and its disciplines are lit (progress ≈ 0.9 of
      // the 280svh section).
      data-nav-stops="1.5"
      style={{ "--n": words.length } as CSSProperties}
    >
      <div className="manifesto-sticky">
        <div className="manifesto-motes" aria-hidden="true">
          {motes.map(({ x, y, depth }, index) => (
            <span
              key={index}
              className="manifesto-mote"
              data-depth={depth}
              style={{ left: x, top: y }}
            />
          ))}
        </div>
        <h2 id="manifesto-heading" className="manifesto-text">
          <span className="sr-only">{manifesto.text.replaceAll("*", "")}</span>
          <span aria-hidden="true">
            {words.map(({ word, accent }, index) => (
              <span
                key={`${word}-${index}`}
                className="manifesto-word"
                data-accent={accent || undefined}
                style={{ "--i": index } as CSSProperties}
              >
                {word}{" "}
              </span>
            ))}
          </span>
        </h2>
        <ul className="manifesto-disciplines">
          {manifesto.disciplines.map(({ label, detail }, index) => (
            <li key={label} style={{ "--i": index } as CSSProperties}>
              <span className="big-index" aria-hidden="true">
                0{index + 1}
              </span>
              <strong>{label}</strong>
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
