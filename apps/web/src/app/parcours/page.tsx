import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { JourneyTimeline } from "@/components/journey/journey-timeline";
import { KeyboardNavigation } from "@/components/keyboard-navigation";
import { SiteOutro } from "@/components/site-outro";
import { getJourney } from "@/lib/journey-catalog";
import { lampCredit } from "@/lib/journey-content";

export const metadata: Metadata = {
  title: "Parcours — Raphaël Charpentier",
  description:
    "Le parcours de Raphaël Charpentier : formation à Epitech, expériences en entreprise, missions freelance et projets.",
};

export default async function JourneyPage() {
  await connection();
  const entries = (await getJourney()) ?? [];

  return (
    <main className="journey-page">
      <header className="journey-topline">
        <Link href="/" className="journey-home">
          <span aria-hidden="true">←</span> Raphaël Charpentier
        </Link>
        <p>Portfolio / Parcours</p>
      </header>
      <JourneyTimeline entries={entries} />
      <p className="journey-credit">
        Lampe 3D «&nbsp;
        <a href={lampCredit.url} target="_blank" rel="noopener noreferrer">
          {lampCredit.title}
        </a>
        &nbsp;» par {lampCredit.author},{" "}
        <a
          href={lampCredit.licenseUrl}
          target="_blank"
          rel="noopener noreferrer license"
        >
          {lampCredit.license}
        </a>
      </p>
      <SiteOutro />
      <KeyboardNavigation />
    </main>
  );
}
