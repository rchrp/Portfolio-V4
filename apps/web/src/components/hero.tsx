import Image from "next/image";
import portrait from "../../public/portrait.webp";
import { HeroActions } from "@/components/hero-actions";
import { hero } from "@/lib/site-content";

// The first screen. Two things on it are not elements of the page: the stage
// draws the first name, in relief in the matrix, and the portrait, inside
// the slots reserved here. The heading and the picture below only show where
// the stage cannot run.
export function Hero() {
  return (
    <div className="hero">
      <div className="hero-main">
        <h1 className="hero-name">
          {hero.firstName} <span>{hero.lastName}</span>
        </h1>
        <div className="hero-name-slot" data-name-slot aria-hidden="true" />
        <div className="hero-copy" data-calm>
          <p className="hero-lead">{hero.description}</p>
          <HeroActions />
        </div>
      </div>
      <div className="hero-portrait" data-portrait-slot aria-hidden="true">
        <Image
          src={portrait}
          alt=""
          className="hero-portrait-fallback"
          sizes="(max-width: 52rem) 120vw, 70vw"
        />
      </div>
    </div>
  );
}
