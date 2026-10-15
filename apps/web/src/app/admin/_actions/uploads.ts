"use server";

import * as z from "zod";
import { audit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/session";
import { processImage, storeImage, UploadRejected } from "@/lib/admin/uploads";
import { MAX_UPLOAD_BYTES, SLUG_PATTERN } from "@/lib/uploaded-images";

export type UploadResult =
  | { ok: true; url: string; width: number; height: number }
  | { ok: false; error: string };

const uploadSchema = z.object({
  slug: z.string().max(100).regex(SLUG_PATTERN),
  purpose: z.enum(["cover", "media"]),
  file: z.instanceof(File),
});

/**
 * Takes one image for a project's cover or gallery and returns its URL, for
 * the form to save. Covers also get their pixel-matrix edge map.
 */
export async function uploadProjectImageAction(
  formData: FormData,
): Promise<UploadResult> {
  await requireAdmin();
  const parsed = uploadSchema.safeParse({
    slug: formData.get("slug"),
    purpose: formData.get("purpose"),
    file: formData.get("file"),
  });
  if (!parsed.success) {
    return parsed.error.issues.some((issue) => issue.path[0] === "slug")
      ? { ok: false, error: "Renseignez un slug valide avant d’importer." }
      : { ok: false, error: "Aucune image reçue." };
  }

  const { slug, purpose, file } = parsed.data;
  if (file.size === 0) return { ok: false, error: "Le fichier est vide." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "8 Mo au maximum par image." };
  }

  try {
    const image = await processImage(
      Buffer.from(await file.arrayBuffer()),
      purpose === "cover",
    );
    const url = await storeImage(slug, image);
    await audit("project.image.uploaded", url);
    return { ok: true, url, width: image.width, height: image.height };
  } catch (error) {
    if (error instanceof UploadRejected) {
      return { ok: false, error: error.message };
    }
    console.error("[admin] Image upload failed.");
    return { ok: false, error: "L’import a échoué. Réessayez." };
  }
}
