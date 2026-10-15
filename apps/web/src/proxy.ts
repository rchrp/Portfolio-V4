import { NextResponse, type NextRequest } from "next/server";
import { cookieName, SESSION_COOKIE } from "@/lib/admin/cookies";

// Hardens every admin response: a nonce-based Content Security Policy, no
// framing, no caching, no indexing. It also sends visitors without a session
// cookie to the login page early; the real check runs in each page and
// Server Action (requireAdmin), against the database.

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/enroll"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ADMIN_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const hasSession = [true, false].some((secure) =>
    request.cookies.has(cookieName(SESSION_COOKIE, secure)),
  );

  if (!isPublic && !hasSession && request.method === "GET") {
    return secure(NextResponse.redirect(new URL("/admin/login", request.url)));
  }

  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV === "development";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return secure(response);
}

function secure(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
  );
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
