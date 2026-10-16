import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getJourneyForm, listProjectChoices } from "@/lib/admin/journey";
import { statusLabels } from "@/lib/admin/project-form";
import { requireAdmin } from "@/lib/admin/session";
import { JourneyEditor } from "../../../_components/journey-editor";
import { LocalDate } from "../../../_components/local-date";

export const metadata: Metadata = { title: "Modifier une étape" };

const badge = {
  PUBLISHED: "is-published",
  DRAFT: "is-draft",
  ARCHIVED: "is-archived",
} as const;

export default async function EditJourneyEntryPage({
  params,
}: PageProps<"/admin/journey/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const [entry, projects] = await Promise.all([
    id.length <= 64 ? getJourneyForm(id) : null,
    listProjectChoices(),
  ]);
  if (!entry) notFound();
  const { values, updatedAt } = entry;

  return (
    <>
      <div className="adm-page-head">
        <div>
          <Link href="/admin/journey" className="adm-back">
            <ArrowLeft aria-hidden="true" />
            Parcours
          </Link>
          <h1>{values.title}</h1>
          <p>
            <span className={`adm-badge ${badge[values.status]}`}>
              {statusLabels[values.status]}
            </span>{" "}
            {values.organization} · Modifié le{" "}
            <LocalDate value={updatedAt} withTime />
          </p>
        </div>
      </div>
      <JourneyEditor entryId={id} initial={values} projects={projects} />
    </>
  );
}
