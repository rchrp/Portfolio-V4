import {
  History,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { SESSION_IDLE_MS } from "@/lib/admin/config";
import { requireAdmin } from "@/lib/admin/session";
import { getDatabase } from "@/lib/db";
import { describeDevice, formatRelative } from "../../_components/format";
import { LocalDate } from "../../_components/local-date";
import {
  AddPasskeyButton,
  PasskeyActions,
  RevokeSessionButton,
} from "../../_components/security-controls";

export const metadata: Metadata = { title: "Sécurité" };

const actionLabels: Record<string, string> = {
  login: "Connexion",
  "login.failed": "Connexion refusée",
  logout: "Déconnexion",
  "passkey.added": "Passkey ajoutée",
  "passkey.renamed": "Passkey renommée",
  "passkey.removed": "Passkey retirée",
  "session.revoked": "Session révoquée",
  "project.created": "Projet créé",
  "project.updated": "Projet modifié",
  "project.status": "Statut changé",
  "project.reordered": "Ordre modifié",
  "project.deleted": "Projet supprimé",
};

export default async function SecurityPage() {
  const session = await requireAdmin();
  const database = getDatabase()!;
  const now = new Date();
  const [passkeys, sessions, events] = await Promise.all([
    database.adminPasskey.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true,
      },
    }),
    database.adminSession.findMany({
      where: {
        expiresAt: { gt: now },
        lastSeenAt: { gt: new Date(now.getTime() - SESSION_IDLE_MS) },
      },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastSeenAt: true,
        passkey: { select: { name: true } },
      },
    }),
    database.adminAuditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  return (
    <>
      <div className="adm-page-head">
        <div>
          <p className="adm-kicker">Accès</p>
          <h1>Sécurité</h1>
          <p>
            Passkeys autorisées, navigateurs connectés et journal d’activité.
          </p>
        </div>
      </div>

      <div className="adm-security">
        <section className="adm-card" aria-labelledby="passkeys-title">
          <header className="adm-card-head">
            <div>
              <h2 id="passkeys-title">Passkeys</h2>
              <p>Gardez-en au moins deux, par exemple une clé de secours.</p>
            </div>
            <AddPasskeyButton />
          </header>
          <ul className="adm-list">
            {passkeys.map((passkey) => {
              const current = passkey.id === session.passkeyId;
              return (
                <li key={passkey.id} className="adm-list-item">
                  <span
                    className={`adm-list-icon${current ? " is-accent" : ""}`}
                  >
                    <KeyRound aria-hidden="true" />
                  </span>
                  <div>
                    <div className="adm-list-title">
                      {passkey.name}
                      {current && (
                        <span className="adm-badge is-accent is-plain">
                          Cette session
                        </span>
                      )}
                      {passkey.deviceType === "multiDevice" && (
                        <span className="adm-badge is-plain">Synchronisée</span>
                      )}
                    </div>
                    <p className="adm-list-meta">
                      Ajoutée le <LocalDate value={passkey.createdAt} /> ·{" "}
                      {passkey.lastUsedAt
                        ? `utilisée ${formatRelative(passkey.lastUsedAt)}`
                        : "jamais utilisée"}
                    </p>
                  </div>
                  <PasskeyActions
                    id={passkey.id}
                    name={passkey.name}
                    current={current}
                  />
                </li>
              );
            })}
          </ul>
        </section>

        <section className="adm-card" aria-labelledby="sessions-title">
          <header className="adm-card-head">
            <div>
              <h2 id="sessions-title">Sessions actives</h2>
              <p>Fermées après 2 h d’inactivité, 12 h au plus.</p>
            </div>
          </header>
          <ul className="adm-list">
            {sessions.map((item) => {
              const current = item.id === session.id;
              return (
                <li key={item.id} className="adm-list-item">
                  <span
                    className={`adm-list-icon${current ? " is-accent" : ""}`}
                  >
                    <MonitorSmartphone aria-hidden="true" />
                  </span>
                  <div>
                    <div className="adm-list-title">
                      {describeDevice(item.userAgent)}
                      {current && (
                        <span className="adm-badge is-accent is-plain">
                          Cet appareil
                        </span>
                      )}
                    </div>
                    <p className="adm-list-meta">
                      {item.passkey.name}
                      {item.ipAddress && <> · {item.ipAddress}</>} · active{" "}
                      {formatRelative(item.lastSeenAt)}
                    </p>
                  </div>
                  <RevokeSessionButton id={item.id} current={current} />
                </li>
              );
            })}
          </ul>
        </section>

        <section className="adm-card is-wide" aria-labelledby="log-title">
          <header className="adm-card-head">
            <div>
              <h2 id="log-title">
                <History className="adm-title-icon" aria-hidden="true" />
                Journal
              </h2>
              <p>Les 40 derniers évènements.</p>
            </div>
          </header>
          {events.length ? (
            <div className="adm-table-scroll">
              <table className="adm-log">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Évènement</th>
                    <th scope="col">Détail</th>
                    <th scope="col">Adresse</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <LocalDate value={event.createdAt} withTime />
                      </td>
                      <td
                        className={
                          event.action === "login.failed"
                            ? "is-failure"
                            : undefined
                        }
                      >
                        {actionLabels[event.action] ?? event.action}
                      </td>
                      <td className="adm-muted">{event.detail ?? "—"}</td>
                      <td className="adm-mono adm-muted">
                        {event.ipAddress ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="adm-empty">Aucun évènement pour l’instant.</p>
          )}
        </section>

        <section
          className="adm-banner is-info is-wide"
          aria-labelledby="recovery-title"
        >
          <ShieldCheck aria-hidden="true" />
          <div>
            <h2 id="recovery-title" className="adm-list-title">
              Récupération
            </h2>
            <p>
              Toutes vos passkeys perdues ? Sur le serveur, lancez{" "}
              <code className="adm-mono">pnpm admin:invite</code> : il affiche
              un lien à usage unique, valable 15 minutes, pour en enregistrer
              une nouvelle. Aucun mot de passe n’existe, donc rien à deviner ni
              à voler.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
