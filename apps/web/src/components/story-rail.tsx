"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { restingPoints } from "@/components/keyboard-navigation";
import { chapters } from "@/lib/site-content";
import { scrollPageTo } from "@/lib/smooth-scroll";

const pad = (value: number) => String(value).padStart(2, "0");
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

type Position = { index: number; progress: number };

// The last chapter whose top has passed the middle of the screen, and how far
// it has been read: 0 as it takes over, 1 once its last screen is in view.
function readPosition(): Position {
  const middle = window.innerHeight / 2;
  let position: Position = { index: 0, progress: 0 };
  chapters.forEach(({ id }, index) => {
    const element = document.getElementById(id);
    if (!element) return;
    const { top, height } = element.getBoundingClientRect();
    if (top > middle) return;
    position = {
      index,
      progress: clamp01((middle - top) / Math.max(1, height - middle)),
    };
  });
  return position;
}

// Straight to where the chapter is settled, rather than to its first pixel.
function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  event.preventDefault();
  const [rest = element.getBoundingClientRect().top + window.scrollY] =
    restingPoints(element);
  scrollPageTo(rest);
}

// On the right edge from the first night chapter on: where the story stands,
// and a way to jump to any chapter. Entering one flashes its number and name
// in the corner, like the on-screen display of an old television.
export function StoryRail() {
  const railRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  // Counts the chapter changes: each one replays the display.
  const [flashes, setFlashes] = useState(0);

  useEffect(() => {
    let frame = 0;
    let current: number | null = null;

    const measure = () => {
      frame = 0;
      const { index, progress } = readPosition();
      railRef.current?.style.setProperty(
        "--chapter-progress",
        progress.toFixed(4),
      );
      if (index === current) return;
      // The first reading only places the rail.
      if (current !== null) setFlashes((count) => count + 1);
      current = index;
      setActive(index);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <nav
        ref={railRef}
        className="story-rail"
        aria-label="Chapitres"
        data-visible={active > 0 || undefined}
      >
        <ol>
          {chapters.map(({ id, label }, index) => (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={index === active ? "true" : undefined}
                onClick={(event) => jumpTo(event, id)}
              >
                <span className="story-rail-label">{label}</span>
                <span className="story-rail-index">{pad(index)}</span>
                <span className="story-rail-progress" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {flashes > 0 && active > 0 && (
        <p key={flashes} className="story-osd" aria-hidden="true">
          <span className="story-osd-index">{pad(active)}</span>
          <span className="story-osd-label">{chapters[active].label}</span>
        </p>
      )}
    </>
  );
}
