"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useStage } from "@/components/stage/stage";
import type { ProjectMedia } from "@/lib/projects";
import { clamp, damp, smoothstep } from "@/stage/math";

const pad = (value: number) => String(value).padStart(2, "0");

// The project's screenshots, on a strip wrapped around a cylinder: the one in
// the middle faces the reader, its neighbours turn away and break up into
// matrix cells. The stage draws the pictures where the track sits; the page
// keeps the controls, the caption and, without the stage, the pictures.
export function ProjectGallery({ images }: { images: ProjectMedia[] }) {
  const stage = useStage();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  /** Distance dragged, in pictures. */
  const dragRef = useRef({ active: false, startX: 0, offset: 0, moved: false });

  const go = (to: number) => {
    const next = clamp(to, 0, images.length - 1);
    indexRef.current = next;
    setIndex(next);
  };

  useEffect(() => {
    if (!stage) return;
    const track = trackRef.current;
    if (!track) return;
    let position = indexRef.current;
    for (const image of images) stage.cards.preload(image.url);

    return stage.direct((engine, dt) => {
      const bounds = track.getBoundingClientRect();
      const viewport = window.innerHeight;
      if (bounds.bottom < -80 || bounds.top > viewport + 80) return;

      const drag = dragRef.current;
      const height = bounds.height * 0.94;
      const width = Math.min((height * 16) / 9, bounds.width * 0.74);
      const cardHeight = (width * 9) / 16;
      const gap = width * 1.07;
      const target = indexRef.current - drag.offset;
      position = engine.still ? target : damp(position, target, 8, dt);
      if (Math.abs(position - target) > 0.001) engine.wake();
      else position = target;

      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      track.style.setProperty("--picture-width", `${width}px`);

      images.forEach((image, at) => {
        const offset = at - position;
        const distance = Math.abs(offset);
        if (distance > 2.4) return;
        engine.cards.push({
          src: image.url,
          x: centerX + offset * gap,
          y: centerY,
          width,
          height: cardHeight,
          curveX: 1 / (engine.width * 0.78),
          pivotX: centerX,
          alpha: 1 - smoothstep(1.5, 2.3, distance),
          pixel: 0.85 * smoothstep(0.15, 1, distance),
          dim: 0.4 * smoothstep(0.15, 1.2, distance),
          shadow: 0.8 * (1 - smoothstep(0, 0.7, distance)),
          radius: 10,
        });
      });
    });
  }, [stage, images]);

  // Without the stage, the track scrolls sideways: keep the count in step.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      if (document.documentElement.dataset.stage === "on") return;
      const step = track.scrollWidth / images.length;
      const at = clamp(
        Math.round(track.scrollLeft / step),
        0,
        images.length - 1,
      );
      if (at !== indexRef.current) go(at);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
    // `go` only touches refs and a setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  const show = (to: number) => {
    go(to);
    const track = trackRef.current;
    if (!track || document.documentElement.dataset.stage === "on") return;
    track.scrollTo({
      left:
        (track.scrollWidth / images.length) * clamp(to, 0, images.length - 1),
      behavior: "smooth",
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") show(indexRef.current + 1);
    else if (event.key === "ArrowLeft") show(indexRef.current - 1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const pictureWidth = () => {
    const track = trackRef.current;
    if (!track) return 1;
    const width = parseFloat(track.style.getPropertyValue("--picture-width"));
    return (width || track.clientWidth * 0.7) * 1.07;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (document.documentElement.dataset.stage !== "on") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      offset: 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const travelled = event.clientX - drag.startX;
    if (Math.abs(travelled) > 6) drag.moved = true;
    // Past either end, the strip resists.
    let offset = travelled / pictureWidth();
    const landing = indexRef.current - offset;
    if (landing < 0) offset = indexRef.current + landing * -0.3;
    if (landing > images.length - 1) {
      offset =
        indexRef.current -
        (images.length - 1) -
        (landing - (images.length - 1)) * 0.3;
    }
    drag.offset = offset;
    stage?.wake();
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    drag.active = false;
    const landing = indexRef.current - drag.offset;
    drag.offset = 0;
    if (drag.moved) {
      // A short flick is enough to move on.
      const pushed = indexRef.current - landing;
      const next =
        Math.abs(pushed) > 0.18
          ? indexRef.current -
            Math.sign(pushed) * Math.max(1, Math.round(Math.abs(pushed)))
          : indexRef.current;
      go(next);
      return;
    }
    // A plain click on a neighbour brings it to the middle.
    const bounds = event.currentTarget.getBoundingClientRect();
    const fromCenter =
      (event.clientX - (bounds.left + bounds.width / 2)) / pictureWidth();
    if (Math.abs(fromCenter) > 0.5)
      go(indexRef.current + Math.sign(fromCenter));
  };

  const current = images[index];

  return (
    <section
      className="gallery"
      aria-roledescription="carrousel"
      aria-label="Captures d’écran"
    >
      <div
        ref={trackRef}
        className="gallery-track"
        tabIndex={0}
        aria-label={`Capture ${index + 1} sur ${images.length} : ${current.alt}`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {images.map((image) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={image.url}
            className="gallery-picture"
            src={image.url}
            alt={image.alt}
            loading="lazy"
            draggable={false}
          />
        ))}
      </div>
      <div className="gallery-foot">
        <p className="gallery-caption" key={index} aria-live="polite">
          {current.caption ?? current.alt}
        </p>
        {images.length > 1 && (
          <div className="gallery-controls">
            <button
              type="button"
              aria-label="Capture précédente"
              disabled={index === 0}
              onClick={() => show(index - 1)}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <span aria-hidden="true">
              {pad(index + 1)} / {pad(images.length)}
            </span>
            <button
              type="button"
              aria-label="Capture suivante"
              disabled={index === images.length - 1}
              onClick={() => show(index + 1)}
            >
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
