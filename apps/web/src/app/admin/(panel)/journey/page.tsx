import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { listJourney } from "@/lib/admin/journey";
import { requireAdmin } from "@/lib/admin/session";
import { JourneyList } from "../../_components/journey-list";

export const metadata: Metadata = { title: "Parcours" };

export default async function JourneyPage() {
  await requireAdmin();
  const entries = await listJourney();
  const published = entries.filter((entry) => entry.status === "PUBLISHED");

  return (
    <>
      <div className="adm-page-head">
        <div>
          <p className="adm-kicker">Contenu</p>
          <h1>Parcours</h1>
          <p>
            {entries.length} étape{entries.length > 1 ? "s" : ""} ·{" "}
            {published.length} en ligne. Le site les range par date de début.
          </p>
        </div>
        <div className="adm-row">
          <a
            href="/parcours"
            className="adm-button adm-hide-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir la page
          </a>
          <Link
            href="/admin/journey/new"
            className="adm-button adm-button-primary"
          >
            <Plus aria-hidden="true" />
            Nouvelle étape
          </Link>
        </div>
      </div>

      <div className="adm-card">
        {entries.length ? (
          <JourneyList entries={entries} />
        ) : (
          <div className="adm-empty">
            <p>Aucune étape pour l’instant.</p>
            <Link href="/admin/journey/new" className="adm-button">
              <Plus aria-hidden="true" />
              Créer la première
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
