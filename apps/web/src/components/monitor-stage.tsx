"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { StoryScroll } from "@/components/terminal/monitor-path";
import type { MonitorRenderer } from "@/components/terminal/monitor-renderer";
import { monitorScreens } from "@/components/terminal/monitor-screens";
import { theaterProgress } from "@/components/terminal/theater-timeline";

type MonitorState = {
  renderer: MonitorRenderer | null;
  /** "slow" once loading has taken long enough to show the HTML meanwhile. */
  status: "pending" | "slow" | "ready" | "failed";
};

const MonitorContext = createContext<MonitorState>({
  renderer: null,
  status: "pending",
});

/** The monitor of the page, once loaded, for the chapters that drive it. */
export const useMonitor = () => useContext(MonitorContext);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const stackedQuery = "(max-width: 52rem), (max-aspect-ratio: 4/5)";

// Past this delay, the chapters' HTML shows while the monitor keeps loading.
const slowAfter = 6000;

// Where the story stands, read from its chapters: the manifesto, the
// projects (`data-count` of them) and the contact.
function readStory(): StoryScroll {
  const viewport = window.innerHeight;
  const scrolled = window.scrollY;
  const bounds = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return null;
    const { top, height } = element.getBoundingClientRect();
    return { element, top: top + scrolled, height };
  };
  const manifesto = bounds("manifeste");
  const theater = bounds("projets");
  const contact = bounds("contact");

  const pinned = manifesto?.top ?? viewport;
  const count = Number(theater?.element.dataset.count ?? 0);
  return {
    dusk: clamp01(scrolled / Math.max(1, pinned)),
    manifesto: manifesto
      ? clamp01(
          (scrolled - manifesto.top) / Math.max(1, manifesto.height - viewport),
        )
      : 0,
    ...(theater && count > 0
      ? theaterProgress((scrolled - theater.top) / viewport, count)
      : { intro: 0, project: -1, outro: 0 }),
    ending: contact
      ? clamp01((scrolled + viewport - contact.top) / viewport)
      : 0,
  };
}

/**
 * The monitor that follows the visitor down the page, drawn on a canvas
 * fixed over the chapters (it lets clicks through). Loaded on demand once
 * the page is interactive; the projects chapter drives it through
 * `useMonitor`.
 */
export function MonitorStage({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<MonitorState>({
    renderer: null,
    status: "pending",
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let renderer: MonitorRenderer | null = null;
    const detach: (() => void)[] = [];

    const attach = (stage: MonitorRenderer) => {
      const layout = window.matchMedia(stackedQuery);
      const updateLayout = () =>
        stage.setLayout(layout.matches ? "stacked" : "side");
      updateLayout();
      layout.addEventListener("change", updateLayout);

      const resizeObserver = new ResizeObserver(([entry]) =>
        stage.resize(entry.contentRect.width, entry.contentRect.height),
      );
      resizeObserver.observe(canvas);

      let frame = 0;
      const measure = () => {
        frame = 0;
        stage.setStory(readStory());
      };
      const schedule = () => {
        if (!frame) frame = window.requestAnimationFrame(measure);
      };
      measure();
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule, { passive: true });

      const onPointerMove = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        stage.setPointer(
          (event.clientX / window.innerWidth) * 2 - 1,
          (event.clientY / window.innerHeight) * 2 - 1,
        );
      };
      window.addEventListener("pointermove", onPointerMove, { passive: true });

      detach.push(() => {
        layout.removeEventListener("change", updateLayout);
        resizeObserver.disconnect();
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        window.removeEventListener("pointermove", onPointerMove);
        if (frame) window.cancelAnimationFrame(frame);
      });
    };

    const start = async () => {
      try {
        const [{ MonitorRenderer }] = await Promise.all([
          import("@/components/terminal/monitor-renderer"),
          document.fonts?.ready,
        ]);
        if (disposed) return;
        const styles = getComputedStyle(document.body);
        renderer = new MonitorRenderer(canvas, {
          sans: styles.getPropertyValue("--font-geist-sans") || "sans-serif",
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
          screens: monitorScreens,
        });
        attach(renderer);
        await renderer.load("/models/monitor.glb");
        if (disposed) return;
        setState({ renderer, status: "ready" });
      } catch {
        for (const stop of detach.splice(0)) stop();
        renderer?.dispose();
        renderer = null;
        if (!disposed) setState({ renderer: null, status: "failed" });
      }
    };
    void start();
    const slow = window.setTimeout(
      () =>
        setState((current) =>
          current.status === "pending"
            ? { ...current, status: "slow" }
            : current,
        ),
      slowAfter,
    );

    return () => {
      disposed = true;
      window.clearTimeout(slow);
      for (const stop of detach.splice(0)) stop();
      renderer?.dispose();
    };
  }, []);

  return (
    <MonitorContext.Provider value={state}>
      {/* The monitor's glass carries the name, the statement and the
          invitation: their HTML stays for assistive technologies, and shows
          if WebGL fails or the monitor is slow to load. */}
      <div className="monitor-page" data-monitor={state.status}>
        {children}
      </div>
      <canvas
        ref={canvasRef}
        className="monitor-stage"
        data-status={state.status}
        aria-hidden="true"
      />
      <div className="monitor-grain" aria-hidden="true" />
    </MonitorContext.Provider>
  );
}
