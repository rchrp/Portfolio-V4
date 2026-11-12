"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useMonitor } from "@/components/monitor-stage";
import type { ScreenFrame } from "@/components/terminal/monitor-renderer";

export type ScreenControl = {
  /** Region of the card it covers (see screen-cards.ts). */
  id: string;
  /** Accessible name. */
  label: string;
} & ({ href: string; external?: boolean } | { onActivate: () => void });

/**
 * Real links and buttons laid over the regions of a card on the monitor's
 * glass: transparent, they take the clicks and the focus while the glass
 * draws them and lights them up. Present only while the glass shows the
 * card `showing`.
 */
export function ScreenControls({
  showing,
  label,
  controls,
  focus = null,
}: {
  showing: string;
  label: string;
  controls: ScreenControl[];
  /** Control focused as soon as the card is shown. */
  focus?: string | null;
}) {
  const { renderer } = useMonitor();
  const [visible, setVisible] = useState(false);
  const elements = useRef(new Map<string, HTMLElement>());
  const frameRef = useRef<ScreenFrame | null>(null);

  const place = useCallback((frame: ScreenFrame) => {
    for (const [id, element] of elements.current) {
      const rect = frame.regions[id];
      element.style.display = rect ? "" : "none";
      if (!rect) continue;
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
      element.style.width = `${rect.width}px`;
      element.style.height = `${rect.height}px`;
    }
  }, []);

  useEffect(() => {
    if (!renderer) return;
    return renderer.onScreen((frame) => {
      frameRef.current = frame;
      const shown = frame.showing === showing;
      setVisible(shown);
      if (shown) place(frame);
    });
  }, [renderer, showing, place]);

  // Fresh controls take their places at once; leaving, they unlight.
  useLayoutEffect(() => {
    if (!visible) return;
    if (frameRef.current) place(frameRef.current);
    return () => renderer?.setHighlight(null);
  }, [visible, place, renderer]);

  useEffect(() => {
    if (visible && focus)
      elements.current.get(focus)?.focus({ preventScroll: true });
  }, [visible, focus]);

  if (!visible) return null;

  const register = (id: string) => (element: HTMLElement | null) => {
    if (element) elements.current.set(id, element);
    else elements.current.delete(id);
  };
  const light = (id: string | null) => () => renderer?.setHighlight(id);

  return (
    <div
      className="screen-controls"
      role="group"
      aria-label={label}
      data-showing={showing}
    >
      {controls.map((control) => {
        const events = {
          onPointerEnter: light(control.id),
          onPointerLeave: light(null),
          onFocus: light(control.id),
          onBlur: light(null),
        };
        return "href" in control ? (
          <a
            key={control.id}
            ref={register(control.id)}
            className="screen-control"
            href={control.href}
            target={control.external ? "_blank" : undefined}
            rel={control.external ? "noopener noreferrer" : undefined}
            aria-label={control.label}
            {...events}
          />
        ) : (
          <button
            key={control.id}
            ref={register(control.id)}
            type="button"
            className="screen-control"
            aria-label={control.label}
            onClick={control.onActivate}
            {...events}
          />
        );
      })}
    </div>
  );
}
