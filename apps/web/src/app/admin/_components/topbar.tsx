"use client";

import { ArrowUpRight, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "../_actions/auth";

const links = [
  {
    href: "/admin",
    label: "Projets",
    match: (path: string) =>
      path === "/admin" || path.startsWith("/admin/projects"),
  },
  {
    href: "/admin/security",
    label: "Sécurité",
    match: (path: string) => path.startsWith("/admin/security"),
  },
] as const;

export function AdminTopbar() {
  const pathname = usePathname();
  return (
    <header className="adm-topbar">
      <div className="adm-topbar-inner">
        <Link
          href="/admin"
          className="adm-brand"
          aria-label="Administration du portfolio"
        >
          <BrandMark />
          <span className="adm-brand-name">
            Portfolio<small>Admin</small>
          </span>
        </Link>
        <nav className="adm-nav" aria-label="Administration">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.match(pathname) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="adm-topbar-end">
          <a
            className="adm-button adm-button-ghost adm-hide-sm"
            href="/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir le site
            <ArrowUpRight aria-hidden="true" />
          </a>
          <form action={logoutAction}>
            <button
              type="submit"
              className="adm-button adm-button-ghost"
              title="Se déconnecter"
            >
              <LogOut aria-hidden="true" />
              <span className="adm-hide-sm">Déconnexion</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function BrandMark() {
  return (
    <span className="adm-brand-mark" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}
