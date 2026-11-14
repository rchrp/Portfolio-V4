"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { hero } from "@/lib/site-content";
import { StageEngine } from "@/stage/engine";

// The engine lives outside React: it is created after mount, in the browser
// only, and components subscribe to its arrival.
let current: StageEngine | null = null;
const listeners = new Set<() => void>();

function publish(engine: StageEngine | null) {
  current = engine;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The stage's engine, or null before it starts and where WebGL is missing. */
export const useStage = () =>
  useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );

/**
 * The canvas fixed behind the page, and the engine that draws the matrix into
 * it. `data-stage` on the root element tells the styles whether it runs:
 * "on" lets sections go transparent over it, "off" (no WebGL2) brings back
 * plain backgrounds and pictures.
 */
export function Stage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = document.documentElement;
    // A canvas of its own for each engine: a context, once released, cannot
    // be handed out again by the same canvas.
    const canvas = document.createElement("canvas");
    host.append(canvas);

    let stage: StageEngine;
    try {
      stage = new StageEngine(canvas, hero.firstName);
    } catch (error) {
      // No WebGL2, or a shader the driver refuses: the page falls back to
      // its plain version. Said once, for whoever is debugging.
      console.warn(
        "[stage] unavailable:",
        error instanceof Error ? error.message : error,
      );
      canvas.remove();
      root.dataset.stage = "off";
      return () => {
        delete root.dataset.stage;
      };
    }
    root.dataset.stage = "on";
    publish(stage);
    if (process.env.NODE_ENV !== "production") {
      // Handy from the console while tuning scenes.
      (window as unknown as { __stage?: StageEngine }).__stage = stage;
    }

    const onLost = (event: Event) => {
      event.preventDefault();
      root.dataset.stage = "off";
      publish(null);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      publish(null);
      stage.dispose();
      canvas.remove();
      delete root.dataset.stage;
    };
  }, []);

  return <div ref={hostRef} className="stage" aria-hidden="true" />;
}
