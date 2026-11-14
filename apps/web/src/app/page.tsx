import { About } from "@/components/about";
import { Contact } from "@/components/contact";
import { Suspense } from "react";
import { Hero } from "@/components/hero";
import { HomeDirector } from "@/components/home-director";
import { KeyboardNavigation } from "@/components/keyboard-navigation";
import {
  ProjectsLoading,
  ProjectsSection,
} from "@/components/projects/projects-section";
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
        <Hero />
        <About />
        <Suspense fallback={<ProjectsLoading />}>
          <ProjectsSection />
        </Suspense>
        <Contact />
      </main>
      <HomeDirector />
      <KeyboardNavigation />
      <SmoothScroll />
    </>
  );
}
