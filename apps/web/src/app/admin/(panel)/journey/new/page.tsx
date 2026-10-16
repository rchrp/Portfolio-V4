import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { listProjectChoices } from "@/lib/admin/journey";
import { emptyJourneyEntry } from "@/lib/admin/journey-form";
import { requireAdmin } from "@/lib/admin/session";
import { JourneyEditor } from "../../../_components/journey-editor";

export const metadata: Metadata = { title: "Nouvelle étape" };

export default async function NewJourneyEntryPage() {
  await requireAdmin();
  const projects = await listProjectChoices();
  return (
    <>
      <div className="adm-page-head">
        <div>
          <Link href="/admin/journey" className="adm-back">
            <ArrowLeft aria-hidden="true" />
            Parcours
          </Link>
          <h1>Nouvelle étape</h1>
          <p>Elle reste en brouillon tant que vous ne la publiez pas.</p>
        </div>
      </div>
      <JourneyEditor
        entryId={null}
        initial={emptyJourneyEntry}
        projects={projects}
      />
    </>
  );
}
