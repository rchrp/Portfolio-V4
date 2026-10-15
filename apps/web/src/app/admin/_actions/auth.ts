"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { getDatabase } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import {
  destroySession,
  getAdminSession,
  requireAdmin,
} from "@/lib/admin/session";
import {
  beginAddPasskey,
  beginEnrollment,
  beginLogin,
  finishLogin,
  finishRegistration,
  type Result,
} from "@/lib/admin/webauthn";

// Every action re-checks who is calling: a Server Action is a public POST
// endpoint, whatever page renders it.

export async function startLoginAction() {
  return beginLogin();
}

export async function finishLoginAction(response: unknown) {
  return finishLogin(response);
}

export async function startEnrollmentAction(token: unknown) {
  return beginEnrollment(token);
}

export async function finishEnrollmentAction(response: unknown, name: unknown) {
  return finishRegistration(response, name, await getAdminSession());
}

export async function startAddPasskeyAction() {
  return beginAddPasskey(await requireAdmin());
}

export async function finishAddPasskeyAction(response: unknown, name: unknown) {
  const result = await finishRegistration(response, name, await requireAdmin());
  revalidatePath("/admin/security");
  return result;
}

export async function logoutAction() {
  await requireAdmin();
  await audit("logout");
  await destroySession();
  redirect("/admin/login");
}

const id = z.string().min(1).max(1024);
const name = z.string().trim().min(1).max(60);

function db() {
  const database = getDatabase();
  if (!database) throw new Error("DATABASE_URL is not set.");
  return database;
}

export async function renamePasskeyAction(
  passkeyId: unknown,
  value: unknown,
): Promise<Result> {
  await requireAdmin();
  const parsed = z.tuple([id, name]).safeParse([passkeyId, value]);
  if (!parsed.success)
    return { ok: false, error: "Nom invalide (1 à 60 caractères)." };
  const [target, label] = parsed.data;
  const { count } = await db().adminPasskey.updateMany({
    where: { id: target },
    data: { name: label },
  });
  if (count) await audit("passkey.renamed", label);
  revalidatePath("/admin/security");
  return { ok: true, data: null };
}

export async function removePasskeyAction(passkeyId: unknown): Promise<Result> {
  const session = await requireAdmin();
  const parsed = id.safeParse(passkeyId);
  if (!parsed.success) return { ok: false, error: "Passkey inconnue." };
  if (parsed.data === session.passkeyId) {
    return {
      ok: false,
      error:
        "Vous êtes connecté avec cette passkey. Connectez-vous avec une autre pour la retirer.",
    };
  }
  const database = db();
  const removed = await database.$transaction(async (transaction) => {
    if ((await transaction.adminPasskey.count()) <= 1) return null;
    return transaction.adminPasskey
      .delete({ where: { id: parsed.data }, select: { name: true } })
      .catch(() => null);
  });
  if (!removed) {
    return { ok: false, error: "Impossible de retirer la dernière passkey." };
  }
  // Its sessions went with it (ON DELETE CASCADE).
  await audit("passkey.removed", removed.name);
  revalidatePath("/admin/security");
  return { ok: true, data: null };
}

export async function revokeSessionAction(sessionId: unknown): Promise<Result> {
  const session = await requireAdmin();
  const parsed = z.string().length(64).safeParse(sessionId);
  if (!parsed.success) return { ok: false, error: "Session inconnue." };
  if (parsed.data === session.id) await logoutAction();
  const { count } = await db().adminSession.deleteMany({
    where: { id: parsed.data },
  });
  if (count) await audit("session.revoked");
  revalidatePath("/admin/security");
  return { ok: true, data: null };
}
