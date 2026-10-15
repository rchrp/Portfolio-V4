import type { Metadata } from "next";
import { connection } from "next/server";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Administration", template: "%s · Administration" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Never prerendered: every admin page checks the session and needs the
  // proxy's per-request CSP nonce, whatever the build-time environment.
  await connection();
  return <div className="adm">{children}</div>;
}
