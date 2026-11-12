"use client";

import { useEffect } from "react";
import { smoothPageScroll } from "@/lib/smooth-scroll";

/** Smooths the page's wheel scrolling while mounted. */
export function SmoothScroll() {
  useEffect(() => smoothPageScroll(), []);
  return null;
}
