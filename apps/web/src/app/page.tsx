import { About } from "@/components/about";
import { Contact } from "@/components/contact";
import { Hero } from "@/components/hero";
import { HomeDirector } from "@/components/home-director";
import { KeyboardNavigation } from "@/components/keyboard-navigation";
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
        <section id="projets" style={{ height: "200vh" }} />
        <Contact />
      </main>
      <HomeDirector />
      <KeyboardNavigation />
      <SmoothScroll />
    </>
  );
}
