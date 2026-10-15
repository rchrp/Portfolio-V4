"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { audit } from "@/lib/admin/audit";
import {
  fieldErrors,
  projectFormSchema,
  projectStatuses,
  statusLabels,
  type FieldErrors,
} from "@/lib/admin/project-form";
import {
  deleteProject,
  moveProject,
  ProjectMissing,
  saveProject,
  setProjectStatus,
  SlugTaken,
} from "@/lib/admin/projects";
import { requireAdmin } from "@/lib/admin/session";

export type SaveResult =
  { ok: true; id: string } | { ok: false; error: string; fields?: FieldErrors };

const projectId = z.string().min(1).max(64);

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/");
}

export async function saveProjectAction(
  id: unknown,
  values: unknown,
): Promise<SaveResult> {
  await requireAdmin();
  const target = id === null ? null : projectId.safeParse(id).data;
  if (target === undefined) return { ok: false, error: "Projet inconnu." };

  const parsed = projectFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Certains champs sont à corriger.",
      fields: fieldErrors(parsed.error),
    };
  }

  try {
    const savedId = await saveProject(target, parsed.data);
    await audit(
      target ? "project.updated" : "project.created",
      parsed.data.title,
    );
    refresh();
    return { ok: true, id: savedId };
  } catch (error) {
    if (error instanceof SlugTaken) {
      return {
        ok: false,
        error: "Ce slug est déjà utilisé.",
        fields: { slug: "Un autre projet utilise déjà ce slug." },
      };
    }
    if (error instanceof ProjectMissing) {
      return { ok: false, error: "Ce projet a été supprimé entre-temps." };
    }
    console.error("[admin] Saving a project failed.");
    return { ok: false, error: "L’enregistrement a échoué. Réessayez." };
  }
}

export async function setProjectStatusAction(id: unknown, status: unknown) {
  await requireAdmin();
  const parsed = z
    .tuple([projectId, z.enum(projectStatuses)])
    .safeParse([id, status]);
  if (!parsed.success) return { ok: false as const };
  const title = await setProjectStatus(...parsed.data);
  if (title) {
    await audit("project.status", `${title} → ${statusLabels[parsed.data[1]]}`);
  }
  refresh();
  return { ok: Boolean(title) };
}

export async function moveProjectAction(id: unknown, direction: unknown) {
  await requireAdmin();
  const parsed = z
    .tuple([projectId, z.union([z.literal(-1), z.literal(1)])])
    .safeParse([id, direction]);
  if (!parsed.success) return { ok: false };
  const moved = await moveProject(...parsed.data);
  if (moved) await audit("project.reordered");
  refresh();
  return { ok: moved };
}

export async function deleteProjectAction(id: unknown) {
  await requireAdmin();
  const parsed = projectId.safeParse(id);
  if (!parsed.success) return { ok: false };
  const title = await deleteProject(parsed.data);
  if (title) await audit("project.deleted", title);
  refresh();
  return { ok: Boolean(title) };
}
