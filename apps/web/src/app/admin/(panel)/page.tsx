import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  projectStatuses,
  statusLabels,
  type ProjectStatusValue,
} from "@/lib/admin/project-form";
import { listProjects } from "@/lib/admin/projects";
import { requireAdmin } from "@/lib/admin/session";
import { ProjectList } from "../_components/project-list";

export const metadata: Metadata = { title: "Projets" };

const isStatus = (value: unknown): value is ProjectStatusValue =>
  projectStatuses.includes(value as ProjectStatusValue);

export default async function ProjectsPage({
  searchParams,
}: PageProps<"/admin">) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter = isStatus(status) ? status : null;
  const projects = await listProjects();
  const count = (value: ProjectStatusValue) =>
    projects.filter((project) => project.status === value).length;
  const visible = filter
    ? projects.filter((project) => project.status === filter)
    : projects;

  return (
    <>
      <div className="adm-page-head">
        <div>
          <p className="adm-kicker">Contenu</p>
          <h1>Projets</h1>
          <p>
            {projects.length} projet{projects.length > 1 ? "s" : ""} ·{" "}
            {count("PUBLISHED")} en ligne. L’ordre ici est celui du site.
          </p>
        </div>
        <Link
          href="/admin/projects/new"
          className="adm-button adm-button-primary"
        >
          <Plus aria-hidden="true" />
          Nouveau projet
        </Link>
      </div>

      <div className="adm-toolbar">
        <nav className="adm-filters" aria-label="Filtrer par statut">
          <Link href="/admin" aria-current={filter ? undefined : "page"}>
            Tous <span>{projects.length}</span>
          </Link>
          {projectStatuses.map((value) => (
            <Link
              key={value}
              href={`/admin?status=${value}`}
              aria-current={filter === value ? "page" : undefined}
            >
              {statusLabels[value]}s <span>{count(value)}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="adm-card">
        {visible.length ? (
          <ProjectList projects={visible} reorderable={!filter} />
        ) : (
          <div className="adm-empty">
            <p>
              {filter
                ? `Aucun projet ${statusLabels[filter].toLowerCase()}.`
                : "Aucun projet pour l’instant."}
            </p>
            {!filter && (
              <Link href="/admin/projects/new" className="adm-button">
                <Plus aria-hidden="true" />
                Créer le premier
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}
