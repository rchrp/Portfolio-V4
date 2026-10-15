import Image from "next/image";
import { Suspense } from "react";
import { preload } from "react-dom";
import portrait from "../../public/portrait_3_white_bg_wider.png";
import { HeroContact } from "@/components/hero-contact";
import { KeyboardNavigation } from "@/components/keyboard-navigation";
import { Manifesto } from "@/components/manifesto";
import { PixelMatrix } from "@/components/pixel-matrix";
import { PortraitReveal } from "@/components/portrait-reveal";
import { ScrollHint } from "@/components/scroll-hint";
import {
  ProjectsLoading,
  ProjectsSection,
} from "@/components/projects-section";
import { SiteOutro } from "@/components/site-outro";
import { edgeMapFor } from "@/lib/edge-maps";

const HERO_CELL_SPACING = 14;
const PORTRAIT_EDGES = edgeMapFor("/portrait_3_white_bg_wider.png")!;
const PORTRAIT_COLOR = "/matrix/portrait-3-white-bg-wider-color.webp";

export default function Home() {
  // Fetched with the HTML so the intro rarely has to wait for its textures.
  preload(PORTRAIT_EDGES, { as: "image", fetchPriority: "high" });
  preload(PORTRAIT_COLOR, { as: "image", fetchPriority: "high" });

  return (
    <main>
      <section
        className="portfolio-hero"
        aria-label="Raphaël Charpentier, développeur freelance"
        data-nav-stops="0"
      >
        <PixelMatrix
          className="hero-matrix"
          color="#f15a24"
          cellSpacing={HERO_CELL_SPACING}
          influenceRadius={320}
          minScale={0.15}
          maxScale={0.74}
          edgeFade={110}
          intro={false}
        />

        <div className="hero-portrait" aria-hidden="true" data-intro="pending">
          <Image
            src={portrait}
            alt=""
            className="hero-portrait-image"
            sizes="(max-width: 672px) 112vw, 64vw"
            preload
          />
          <PortraitReveal
            edgeSrc={PORTRAIT_EDGES}
            colorSrc={PORTRAIT_COLOR}
            cellSpacing={HERO_CELL_SPACING}
          />
        </div>

        <header className="hero-topline">
          <p className="hero-role">
            <span>Software engineer</span>
            <span className="hero-role-divider" aria-hidden="true">
              ·
            </span>
            <span>Freelance</span>
          </p>
          <p className="hero-edition">Portfolio / 2026</p>
        </header>

        <div className="hero-heading">
          <h1 className="hero-title">
            <span className="hero-first-name">Raphaël</span>
            <span className="hero-last-name">Charpentier</span>
          </h1>
          <HeroContact />
        </div>

        <ScrollHint />

        <div className="hero-bottom-blur" aria-hidden="true" />
      </section>
      <div className="hero-night-transition" aria-hidden="true">
        <div className="hero-night-glow" />
      </div>
      <Manifesto />
      <Suspense fallback={<ProjectsLoading />}>
        <ProjectsSection />
      </Suspense>
      <SiteOutro />
      <KeyboardNavigation />
    </main>
  );
}
