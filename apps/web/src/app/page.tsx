import { Suspense } from "react";
import { Contact } from "@/components/contact";
import { Hero } from "@/components/hero";
import { HomeDirector } from "@/components/home-director";
import { JourneySection } from "@/components/journey/journey-section";
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
      <SiteHeader />
      <main className="site">
        {/* One story, held on screen while the page scrolls: the hero, then
            the projects that cover it. */}
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
        <Suspense fallback={null}>
          <JourneySection />
        </Suspense>
        <Contact />
      </main>
      <HomeDirector />
      <KeyboardNavigation />
      <SmoothScroll />
    </>
  );
}
