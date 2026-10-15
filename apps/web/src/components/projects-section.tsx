import { connection } from "next/server";
import { getProjectCatalog } from "@/lib/project-catalog";
import { projectsChapter } from "@/lib/site-content";
import { ProjectTheater } from "./terminal/project-theater";

export async function ProjectsSection() {
  await connection();
  const catalog = await getProjectCatalog();
  return <ProjectTheater catalog={catalog} />;
}

export function ProjectsLoading() {
  return (
    <section
      className="theater theater-loading"
      aria-label="Projets"
      aria-busy="true"
    >
      <p className="chapter-label">
        <span className="chapter-marker" aria-hidden="true" />
        {projectsChapter.chapter}
      </p>
      <p role="status">Mise sous tension…</p>
    </section>
  );
}
