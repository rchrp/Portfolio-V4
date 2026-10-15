import Image from "next/image";
import { Suspense } from "react";
import portrait from "../../public/portrait_3_white_bg_wider.png";
import { Manifesto } from "@/components/manifesto";
import { PixelMatrix } from "@/components/pixel-matrix";
import {
  ProjectsLoading,
  ProjectsSection,
} from "@/components/projects-section";
import { SiteOutro } from "@/components/site-outro";

export default function Home() {
  return (
    <main>
      <section
        className="portfolio-hero"
        aria-label="Raphaël Charpentier, développeur freelance"
      >
        <PixelMatrix
          className="hero-matrix"
          color="#f15a24"
          cellSpacing={22}
          influenceRadius={340}
          minScale={0.17}
          maxScale={0.76}
          edgeFade={120}
        />

        <div className="hero-portrait" aria-hidden="true">
          <Image
            src={portrait}
            alt=""
            className="hero-portrait-image"
            sizes="(max-width: 672px) 112vw, 64vw"
            preload
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

        <h1 className="hero-title">
          <span className="hero-first-name">Raphaël</span>
          <span className="hero-last-name">Charpentier</span>
        </h1>

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
    </main>
  );
}
