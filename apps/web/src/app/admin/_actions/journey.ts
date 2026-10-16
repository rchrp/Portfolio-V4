"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { audit } from "@/lib/admin/audit";
import {
  deleteJourneyEntry,
  JourneyEntryMissing,
  JourneySlugTaken,
  saveJourneyEntry,
  setJourneyStatus,
} from "@/lib/admin/journey";
import { journeyFormSchema } from "@/lib/admin/journey-form";
import {
  fieldErrors,
  projectStatuses,
  statusLabels,
} from "@/lib/admin/project-form";
import { requireAdmin } from "@/lib/admin/session";
import type { SaveResult } from "./projects";

const entryId = z.string().min(1).max(64);

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/parcours");
}

export async function saveJourneyAction(
  id: unknown,
  values: unknown,
): Promise<SaveResult> {
  await requireAdmin();
  const target = id === null ? null : entryId.safeParse(id).data;
  if (target === undefined) return { ok: false, error: "Étape inconnue." };

  const parsed = journeyFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Certains champs sont à corriger.",
      fields: fieldErrors(parsed.error),
    };
  }

  try {
    const savedId = await saveJourneyEntry(target, parsed.data);
    await audit(
      target ? "journey.updated" : "journey.created",
      `${parsed.data.title} · ${parsed.data.organization}`,
    );
    refresh();
    return { ok: true, id: savedId };
  } catch (error) {
    if (error instanceof JourneySlugTaken) {
      return {
        ok: false,
        error: "Ce slug est déjà utilisé.",
        fields: { slug: "Une autre étape utilise déjà ce slug." },
      };
    }
    if (error instanceof JourneyEntryMissing) {
      return { ok: false, error: "Cette étape a été supprimée entre-temps." };
    }
    console.error("[admin] Saving a journey step failed.");
    return { ok: false, error: "L’enregistrement a échoué. Réessayez." };
  }
}

export async function setJourneyStatusAction(id: unknown, status: unknown) {
  await requireAdmin();
  const parsed = z
    .tuple([entryId, z.enum(projectStatuses)])
    .safeParse([id, status]);
  if (!parsed.success) return { ok: false as const };
  const label = await setJourneyStatus(...parsed.data);
  if (label) {
    await audit("journey.status", `${label} → ${statusLabels[parsed.data[1]]}`);
  }
  refresh();
  return { ok: Boolean(label) };
}

export async function deleteJourneyAction(id: unknown) {
  await requireAdmin();
  const parsed = entryId.safeParse(id);
  if (!parsed.success) return { ok: false };
  const label = await deleteJourneyEntry(parsed.data);
  if (label) await audit("journey.deleted", label);
  refresh();
  return { ok: Boolean(label) };
}
