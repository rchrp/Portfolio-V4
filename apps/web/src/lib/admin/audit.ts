import "server-only";
import { getDatabase } from "@/lib/db";
import { requestInfo } from "./security";

export type AuditAction =
  | "login"
  | "login.failed"
  | "logout"
  | "passkey.added"
  | "passkey.renamed"
  | "passkey.removed"
  | "session.revoked"
  | "project.created"
  | "project.updated"
  | "project.status"
  | "project.reordered"
  | "project.deleted"
  | "project.image.uploaded";

/** Records an event. Never throws: auditing must not break the action. */
export async function audit(action: AuditAction, detail?: string) {
  try {
    const { ipAddress } = await requestInfo();
    await getDatabase()?.adminAuditEvent.create({
      data: { action, detail: detail?.slice(0, 240) ?? null, ipAddress },
    });
  } catch {
    console.error(`[admin] Could not record the "${action}" audit event.`);
  }
}
