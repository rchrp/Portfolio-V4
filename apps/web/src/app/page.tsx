import { Suspense } from "react";
import { Contact } from "@/components/contact";
import { GlassFilter } from "@/components/glass-filter";
import { Hero } from "@/components/hero";
import { HomeDirector } from "@/components/home-director";
import { KeyboardNavigation } from "@/components/keyboard-navigation";
import { ProjectsSection } from "@/components/projects/projects-section";
import { SiteHeader } from "@/components/site-header";
import { SmoothScroll } from "@/components/smooth-scroll";
import { Stage } from "@/components/stage/stage";
import "./site.css";

export default function Home() {
  return (
    <>
      <Stage />
      <GlassFilter />
      <SiteHeader />
      <main className="site">
        {/* One story, held on screen while the page scrolls: the hero, which
            draws back into a card, then the projects it joins. */}
        <section
          id="accueil"
          className="story"
          aria-label="Raphaël Charpentier, software engineer freelance"
        >
          <div className="story-hero">
            <Hero />
          </div>
          <Suspense fallback={null}>
            <ProjectsSection />
          </Suspense>
        </section>
        <Contact />
      </main>
      <HomeDirector />
      <KeyboardNavigation />
      <SmoothScroll />
    </>
  );
}
