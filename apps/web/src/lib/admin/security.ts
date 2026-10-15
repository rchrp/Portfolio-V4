import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";

/** 256 random bits, URL-safe. */
export const randomToken = () => randomBytes(32).toString("base64url");

/** Tokens are stored hashed: a database leak must not hand out live ones. */
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export type RequestInfo = {
  ipAddress: string | null;
  userAgent: string | null;
};

/**
 * The client address, as reported by the reverse proxy in front of the app.
 * Only used for rate limiting and the audit trail, never to grant access.
 */
export async function requestInfo(): Promise<RequestInfo> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipAddress = (forwarded || list.get("x-real-ip") || "").slice(0, 64);
  const userAgent = (list.get("user-agent") ?? "").slice(0, 255);
  return { ipAddress: ipAddress || null, userAgent: userAgent || null };
}

// Sliding-window rate limiter, kept in memory: enough for a single server,
// and it fails closed per address rather than per account (there is one).
const globalLimits = globalThis as typeof globalThis & {
  adminRateLimits?: Map<string, number[]>;
};
const hits = (globalLimits.adminRateLimits ??= new Map<string, number[]>());

export function rateLimited(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [entry, times] of hits) {
      if (times.every((at) => now - at >= windowMs)) hits.delete(entry);
    }
  }
  return recent.length > limit;
}
