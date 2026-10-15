import "server-only";

// Everything the admin panel's security depends on, in one place.
//
// ADMIN_ORIGIN is the exact origin the panel is served from, e.g.
// "https://raphaelcharpentier.fr". Passkeys are bound to its host name, so it
// must never be derived from request headers, which a client controls.

const DEV_ORIGIN = "http://localhost:3000";

export type AdminConfig = {
  origin: string;
  rpID: string;
  rpName: string;
  secureCookies: boolean;
};

function readOrigin(): string | null {
  const value =
    process.env.ADMIN_ORIGIN ||
    (process.env.NODE_ENV === "production" ? undefined : DEV_ORIGIN);
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    // WebAuthn only runs on HTTPS, or on localhost during development.
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Null when the panel is not configured: every admin route then refuses. */
export function getAdminConfig(): AdminConfig | null {
  const origin = readOrigin();
  if (!origin) return null;
  return {
    origin,
    rpID: new URL(origin).hostname,
    rpName: "Portfolio — Administration",
    secureCookies: origin.startsWith("https:"),
  };
}

export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
export const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
export const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
export const INVITE_LIFETIME_MS = 15 * 60 * 1000;
/** Refuse new ceremonies past this many pending ones, whoever asks. */
export const MAX_PENDING_CHALLENGES = 200;

/** The single administrator's WebAuthn user handle. Holds no personal data. */
export const ADMIN_USER_ID = new TextEncoder().encode("portfolio-admin");
export const ADMIN_USER_NAME = "admin";
