import { connection } from "next/server";
import { getProjectCatalog } from "@/lib/project-catalog";
import { Projects } from "./projects";

export async function ProjectsSection() {
  await connection();
  const catalog = await getProjectCatalog();
  return <Projects catalog={catalog} />;
}

export function ProjectsLoading() {
  return (
    <section
      id="projets"
      className="work work-loading"
      aria-label="Projets"
      aria-busy="true"
    >
      <p role="status">Chargement des projets…</p>
    </section>
  );
}
