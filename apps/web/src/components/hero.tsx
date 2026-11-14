import Image from "next/image";
import portrait from "../../public/portrait.webp";
import { HeroActions } from "@/components/hero-actions";
import { hero } from "@/lib/site-content";

// The first screen: who, what, and two ways forward. The portrait is not an
// element of the page: the stage draws it in the matrix, inside the slot
// reserved here. The picture below only shows where the stage cannot run.
export function Hero() {
  return (
    <section
      id="accueil"
      className="hero"
      aria-label={`${hero.firstName} ${hero.lastName}, développeur freelance`}
      data-nav-stops="0"
    >
      <div className="hero-copy" data-calm>
        <p className="hero-role">{hero.role}</p>
        <h1 className="hero-name">
          <span>{hero.firstName}</span> <span>{hero.lastName}</span>
        </h1>
        <p className="hero-lead">{hero.lead}</p>
        <HeroActions />
      </div>
      <div className="hero-portrait" data-portrait-slot aria-hidden="true">
        <Image
          src={portrait}
          alt=""
          className="hero-portrait-fallback"
          sizes="(max-width: 48rem) 90vw, 46vw"
        />
      </div>
    </section>
  );
}
