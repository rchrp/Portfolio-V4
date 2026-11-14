import { connection } from "next/server";
import { getProjectCatalog } from "@/lib/project-catalog";
import { Projects } from "./projects";

export async function ProjectsSection() {
  await connection();
  const catalog = await getProjectCatalog();
  return <Projects catalog={catalog} />;
}
