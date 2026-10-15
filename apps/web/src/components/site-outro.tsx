"use client";

import { ArrowUpRight } from "lucide-react";
import { useRef, useState } from "react";
import { PixelMatrix, type FieldRect } from "@/components/pixel-matrix";
import { edgeMapFor } from "@/lib/edge-maps";
import { outro } from "@/lib/site-content";
import { useScrollProgress } from "@/lib/use-scroll-progress";

const portrait = "/portrait_3_white_bg_wider.png";
const portraitField: FieldRect = {
  x: 0.42,
  y: 0.04,
  width: 0.58,
  height: 0.96,
};
const stackedPortraitField: FieldRect = {
  x: 0.08,
  y: 0.02,
  width: 0.84,
  height: 0.6,
};

// Chapter 3: the hero's portrait comes back, redrawn by the matrix from its
// precomputed edge map — the story closes where it started.
export function SiteOutro() {
  const sectionRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [stacked, setStacked] = useState(false);

  useScrollProgress(
    sectionRef,
    ({ progress, viewport }) => {
      if (!revealed && progress > 0.35) setRevealed(true);
      const isStacked =
        window.innerWidth < 832 || window.innerWidth < viewport * 0.8;
      if (isStacked !== stacked) setStacked(isStacked);
      sectionRef.current?.style.setProperty("--reveal", progress.toFixed(4));
    },
    -1,
  );

  return (
    <footer
      ref={sectionRef}
      id="contact"
      className="outro"
      aria-labelledby="outro-heading"
    >
      <div className="outro-matrix" aria-hidden="true">
        <PixelMatrix
          color="#f15a24"
          cellSpacing={stacked ? 9 : 11}
          influenceRadius={220}
          minScale={0.08}
          maxScale={0.7}
          fieldScale={0.96}
          restOpacity={0.12}
          edgeFade={60}
          intro={false}
          fieldFit="contain"
          field={revealed ? edgeMapFor(portrait) : null}
          fieldSource={revealed ? portrait : null}
          fieldRect={stacked ? stackedPortraitField : portraitField}
        />
      </div>
      <div className="outro-content">
        <p className="chapter-label">
          <span className="chapter-marker" aria-hidden="true" />
          {outro.chapter}
        </p>
        <h2 id="outro-heading" className="outro-title">
          <span>{outro.title[0]}</span>
          <span>{outro.title[1]}</span>
        </h2>
        <p className="outro-lead">{outro.lead}</p>
        {outro.email && (
          <a className="outro-cta" href={`mailto:${outro.email}`}>
            {outro.email} <ArrowUpRight size={20} aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="outro-footer">
        <span>© {new Date().getFullYear()} Raphaël Charpentier</span>
        <span>{outro.signature}</span>
      </div>
    </footer>
  );
}
