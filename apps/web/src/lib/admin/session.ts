import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDatabase } from "@/lib/db";
import { getAdminConfig, SESSION_IDLE_MS, SESSION_LIFETIME_MS } from "./config";
import { cookieName, SESSION_COOKIE } from "./cookies";
import { hashToken, randomToken, requestInfo } from "./security";

export type AdminSession = {
  id: string;
  passkeyId: string;
  createdAt: Date;
  expiresAt: Date;
};

function sessionCookie() {
  const config = getAdminConfig();
  if (!config) return null;
  return {
    name: cookieName(SESSION_COOKIE, config.secureCookies),
    secure: config.secureCookies,
  };
}

/** Signs this browser in. Call only once a passkey has been verified. */
export async function createSession(passkeyId: string): Promise<void> {
  const cookie = sessionCookie();
  const database = getDatabase();
  if (!cookie || !database) throw new Error("Admin panel not configured.");

  const token = randomToken();
  const { ipAddress, userAgent } = await requestInfo();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_LIFETIME_MS);

  await database.adminSession.deleteMany({
    where: { expiresAt: { lt: new Date(now) } },
  });
  await database.adminSession.create({
    data: { id: hashToken(token), passkeyId, ipAddress, userAgent, expiresAt },
  });
  (await cookies()).set(cookie.name, token, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

/** The signed-in session, or null. Checked against the database each time. */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  // Read the cookies first: it also keeps every caller dynamically rendered.
  const store = await cookies();
  const cookie = sessionCookie();
  const database = getDatabase();
  if (!cookie || !database) return null;

  const token = store.get(cookie.name)?.value;
  if (!token || token.length > 128) return null;

  try {
    const session = await database.adminSession.findUnique({
      where: { id: hashToken(token) },
      select: {
        id: true,
        passkeyId: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
    const now = Date.now();
    if (
      !session ||
      session.expiresAt.getTime() <= now ||
      now - session.lastSeenAt.getTime() > SESSION_IDLE_MS
    ) {
      return null;
    }
    if (now - session.lastSeenAt.getTime() > 60_000) {
      await database.adminSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }
    return {
      id: session.id,
      passkeyId: session.passkeyId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  } catch {
    console.error("[admin] Session lookup failed.");
    return null;
  }
});

/**
 * Every admin page and every admin Server Action starts with this. The proxy
 * only redirects early; it is not what keeps the panel closed.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** Signs this browser out, server side first. */
export async function destroySession(): Promise<void> {
  const cookie = sessionCookie();
  if (!cookie) return;
  const store = await cookies();
  const token = store.get(cookie.name)?.value;
  if (token) {
    await getDatabase()
      ?.adminSession.deleteMany({ where: { id: hashToken(token) } })
      .catch(() => undefined);
  }
  // A `__Host-` cookie is only replaced by one that is also Secure.
  store.set(cookie.name, "", {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
