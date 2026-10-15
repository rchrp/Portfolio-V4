import { connection } from "next/server";
import { getProjectCatalog } from "@/lib/project-catalog";
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
      <p role="status">Mise sous tension…</p>
    </section>
  );
}
