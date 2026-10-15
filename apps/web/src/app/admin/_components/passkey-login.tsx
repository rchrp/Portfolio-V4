"use client";

import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import { CircleAlert, KeyRound, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { finishLoginAction, startLoginAction } from "../_actions/auth";
import { describePasskeyError } from "./passkey-errors";

const noSubscription = () => () => {};

export function PasskeyLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = useSyncExternalStore(
    noSubscription,
    browserSupportsWebAuthn,
    () => true,
  );

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const start = await startLoginAction();
      if (!start.ok) return setError(start.error);
      let response;
      try {
        response = await startAuthentication({ optionsJSON: start.data });
      } catch (cause) {
        return setError(describePasskeyError(cause));
      }
      const result = await finishLoginAction(response);
      if (!result.ok) return setError(result.error);
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Le serveur ne répond pas. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  const blocked = !configured
    ? "Le panneau n’est pas configuré sur ce serveur (ADMIN_ORIGIN, DATABASE_URL)."
    : !supported
      ? "Ce navigateur ne prend pas en charge les passkeys."
      : null;

  return (
    <>
      <button
        type="button"
        className="adm-button adm-button-accent adm-button-lg adm-button-block"
        onClick={signIn}
        disabled={pending || Boolean(blocked)}
        autoFocus
      >
        {pending ? (
          <LoaderCircle className="adm-spin" aria-hidden="true" />
        ) : (
          <KeyRound aria-hidden="true" />
        )}
        {pending
          ? "En attente de la passkey…"
          : "Se connecter avec une passkey"}
      </button>
      <div aria-live="polite">
        {(error ?? blocked) && (
          <p className="adm-gate-message">
            <CircleAlert aria-hidden="true" />
            {error ?? blocked}
          </p>
        )}
      </div>
    </>
  );
}
