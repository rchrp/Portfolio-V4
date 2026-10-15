import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { statusLabels } from "@/lib/admin/project-form";
import { getProjectForm } from "@/lib/admin/projects";
import { requireAdmin } from "@/lib/admin/session";
import { LocalDate } from "../../../_components/local-date";
import { ProjectEditor } from "../../../_components/project-editor";

export const metadata: Metadata = { title: "Modifier un projet" };

const badge = {
  PUBLISHED: "is-published",
  DRAFT: "is-draft",
  ARCHIVED: "is-archived",
} as const;

export default async function EditProjectPage({
  params,
}: PageProps<"/admin/projects/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const project = id.length <= 64 ? await getProjectForm(id) : null;
  if (!project) notFound();
  const { values, updatedAt } = project;

  return (
    <>
      <div className="adm-page-head">
        <div>
          <Link href="/admin" className="adm-back">
            <ArrowLeft aria-hidden="true" />
            Projets
          </Link>
          <h1>{values.title}</h1>
          <p>
            <span className={`adm-badge ${badge[values.status]}`}>
              {statusLabels[values.status]}
            </span>{" "}
            Modifié le <LocalDate value={updatedAt} withTime />
          </p>
        </div>
      </div>
      <ProjectEditor projectId={id} initial={values} />
    </>
  );
}
