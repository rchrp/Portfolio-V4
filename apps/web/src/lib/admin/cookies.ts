// Cookie names, shared with proxy.ts, which cannot import server-only code.

export const SESSION_COOKIE = "admin_session";
export const CHALLENGE_COOKIE = "admin_challenge";

/**
 * `__Host-` cookies are only accepted over HTTPS, without a domain and on
 * path "/", so a sibling subdomain can neither read nor overwrite them.
 */
export function cookieName(base: string, secure: boolean): string {
  return secure ? `__Host-${base}` : base;
}
