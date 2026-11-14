"use client";

import { useEffect } from "react";

// The refraction behind liquid-glass surfaces: an SVG displacement map that
// only Chromium can run inside `backdrop-filter`. Elsewhere, `.glass` stays
// frosted. The class on the root element tells the styles which it is.
export function GlassFilter() {
  useEffect(() => {
    if (!/Chrome\//.test(navigator.userAgent)) return;
    const root = document.documentElement;
    root.classList.add("liquid");
    return () => root.classList.remove("liquid");
  }, []);

  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
    >
      <filter
        id="liquid-glass"
        x="0"
        y="0"
        width="100%"
        height="100%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.009 0.014"
          numOctaves="2"
          seed="7"
          result="noise"
        />
        <feGaussianBlur in="noise" stdDeviation="2" result="map" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale="28"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
