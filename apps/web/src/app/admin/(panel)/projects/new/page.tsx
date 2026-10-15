import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { emptyProject } from "@/lib/admin/project-form";
import { requireAdmin } from "@/lib/admin/session";
import { ProjectEditor } from "../../../_components/project-editor";

export const metadata: Metadata = { title: "Nouveau projet" };

export default async function NewProjectPage() {
  await requireAdmin();
  return (
    <>
      <div className="adm-page-head">
        <div>
          <Link href="/admin" className="adm-back">
            <ArrowLeft aria-hidden="true" />
            Projets
          </Link>
          <h1>Nouveau projet</h1>
          <p>Il reste en brouillon tant que vous ne le publiez pas.</p>
        </div>
      </div>
      <ProjectEditor projectId={null} initial={emptyProject} />
    </>
  );
}
