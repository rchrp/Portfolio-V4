"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { CircleAlert, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  finishAddPasskeyAction,
  removePasskeyAction,
  renamePasskeyAction,
  revokeSessionAction,
  startAddPasskeyAction,
} from "../_actions/auth";
import { ConfirmButton } from "./confirm-dialog";
import { describePasskeyError } from "./passkey-errors";

export function AddPasskeyButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setError(null);
    try {
      const start = await startAddPasskeyAction();
      if (!start.ok) return setError(start.error);
      let response;
      try {
        response = await startRegistration({ optionsJSON: start.data });
      } catch (cause) {
        return setError(describePasskeyError(cause));
      }
      const result = await finishAddPasskeyAction(response, "Nouvelle passkey");
      if (!result.ok) return setError(result.error);
      router.refresh();
    } catch {
      setError("Le serveur ne répond pas. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="adm-stack">
      <button
        type="button"
        className="adm-button"
        onClick={add}
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle className="adm-spin" aria-hidden="true" />
        ) : (
          <Plus aria-hidden="true" />
        )}
        Ajouter une passkey
      </button>
      {error && (
        <span className="adm-error" role="alert">
          <CircleAlert size={12} aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
}

export function PasskeyActions({
  id,
  name,
  current,
}: {
  id: string;
  name: string;
  current: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        className="adm-rename"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await renamePasskeyAction(id, value);
            if (result.ok) setEditing(false);
            else setError(result.error);
          });
        }}
      >
        <input
          className="adm-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={60}
          aria-label="Nom de la passkey"
          aria-invalid={Boolean(error)}
          onFocus={(event) => event.target.select()}
          autoFocus
          required
        />
        <button type="submit" className="adm-button" disabled={pending}>
          OK
        </button>
      </form>
    );
  }

  return (
    <div className="adm-project-actions">
      <button
        type="button"
        className="adm-icon-button"
        onClick={() => setEditing(true)}
        aria-label={`Renommer ${name}`}
      >
        <Pencil aria-hidden="true" />
      </button>
      {!current && (
        <ConfirmButton
          className="adm-icon-button is-danger"
          ariaLabel={`Retirer ${name}`}
          title={`Retirer « ${name} » ?`}
          description="Cette passkey ne pourra plus ouvrir le panneau, et les sessions ouvertes avec elle seront fermées. Pensez à la supprimer aussi de votre gestionnaire."
          confirmLabel="Retirer"
          onConfirm={async () => {
            const result = await removePasskeyAction(id);
            if (!result.ok) setError(result.error);
          }}
        >
          <Trash2 aria-hidden="true" />
        </ConfirmButton>
      )}
      {error && (
        <span className="adm-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function RevokeSessionButton({
  id,
  current,
}: {
  id: string;
  current: boolean;
}) {
  return (
    <ConfirmButton
      className="adm-button adm-button-ghost"
      title={current ? "Fermer cette session ?" : "Révoquer cette session ?"}
      description={
        current
          ? "Vous serez déconnecté de ce navigateur."
          : "Ce navigateur sera déconnecté immédiatement."
      }
      confirmLabel={current ? "Se déconnecter" : "Révoquer"}
      onConfirm={async () => {
        await revokeSessionAction(id);
      }}
    >
      {current ? "Se déconnecter" : "Révoquer"}
    </ConfirmButton>
  );
}
