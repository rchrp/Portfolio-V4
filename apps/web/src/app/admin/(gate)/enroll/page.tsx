import { Fingerprint } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PasskeyEnroll } from "../../_components/passkey-enroll";

export const metadata: Metadata = { title: "Enregistrer une passkey" };

export default async function EnrollPage() {
  // Rendered per request, so the proxy's CSP nonce reaches its scripts.
  await connection();
  return (
    <section className="adm-gate-card" aria-labelledby="gate-title">
      <span className="adm-gate-icon" aria-hidden="true">
        <Fingerprint />
      </span>
      <div>
        <p className="adm-kicker">Invitation à usage unique</p>
        <h1 id="gate-title">Enregistrer une passkey</h1>
        <p className="adm-gate-lead">
          Votre gestionnaire (Bitwarden, iCloud…) va créer une clé liée à ce
          site. Elle remplacera tout mot de passe pour accéder au panneau.
        </p>
      </div>
      <PasskeyEnroll />
      <footer className="adm-gate-foot">
        <Link href="/admin/login">Déjà une passkey ? Se connecter</Link>
      </footer>
    </section>
  );
}
