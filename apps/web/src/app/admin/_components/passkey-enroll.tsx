"use client";

import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import { CircleAlert, Fingerprint, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  finishEnrollmentAction,
  startEnrollmentAction,
} from "../_actions/auth";
import { describePasskeyError } from "./passkey-errors";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** The invite token travels in the fragment, which never reaches a server. */
const readToken = () => window.location.hash.slice(1);

export function PasskeyEnroll() {
  const router = useRouter();
  const token = useSyncExternalStore(subscribe, readToken, () => null);
  const supported = useSyncExternalStore(
    () => () => {},
    browserSupportsWebAuthn,
    () => true,
  );
  const [name, setName] = useState("Bitwarden");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enroll(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    try {
      const start = await startEnrollmentAction(token);
      if (!start.ok) return setError(start.error);
      let response;
      try {
        response = await startRegistration({ optionsJSON: start.data });
      } catch (cause) {
        return setError(describePasskeyError(cause));
      }
      const result = await finishEnrollmentAction(response, name);
      if (!result.ok) return setError(result.error);
      // Replacing the entry also drops the spent token from the history.
      router.replace("/admin/security");
      router.refresh();
    } catch {
      setError("Le serveur ne répond pas. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  if (token === "") {
    return (
      <p className="adm-gate-message">
        <CircleAlert aria-hidden="true" />
        Ce lien est incomplet. Générez-en un nouveau sur le serveur avec « pnpm
        admin:invite ».
      </p>
    );
  }

  return (
    <form onSubmit={enroll} className="adm-gate-form">
      <label className="adm-field">
        <span className="adm-label">Nom de la passkey</span>
        <input
          className="adm-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          required
          autoComplete="off"
        />
        <span className="adm-hint">
          Pour la reconnaître plus tard, ex. « Bitwarden » ou « YubiKey ».
        </span>
      </label>
      <button
        type="submit"
        className="adm-button adm-button-accent adm-button-lg adm-button-block"
        disabled={pending || !supported || token === null}
      >
        {pending ? (
          <LoaderCircle className="adm-spin" aria-hidden="true" />
        ) : (
          <Fingerprint aria-hidden="true" />
        )}
        {pending ? "En attente de la passkey…" : "Créer la passkey"}
      </button>
      <div aria-live="polite">
        {(error || !supported) && (
          <p className="adm-gate-message">
            <CircleAlert aria-hidden="true" />
            {error ?? "Ce navigateur ne prend pas en charge les passkeys."}
          </p>
        )}
      </div>
    </form>
  );
}
