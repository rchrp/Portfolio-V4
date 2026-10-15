import { LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminConfig } from "@/lib/admin/config";
import { getAdminSession } from "@/lib/admin/session";
import { getDatabase } from "@/lib/db";
import { PasskeyLogin } from "../../_components/passkey-login";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await getAdminSession()) redirect("/admin");
  const configured = getAdminConfig() !== null && getDatabase() !== null;

  return (
    <section className="adm-gate-card" aria-labelledby="gate-title">
      <span className="adm-gate-icon" aria-hidden="true">
        <LockKeyhole />
      </span>
      <div>
        <p className="adm-kicker">Portfolio · Administration</p>
        <h1 id="gate-title">Accès restreint</h1>
        <p className="adm-gate-lead">
          Connectez-vous avec votre passkey : Bitwarden, trousseau iCloud,
          Windows Hello ou clé de sécurité.
        </p>
      </div>
      <PasskeyLogin configured={configured} />
      <footer className="adm-gate-foot">
        <Link href="/">← Retour au site</Link>
        <span>Aucun mot de passe</span>
      </footer>
    </section>
  );
}
