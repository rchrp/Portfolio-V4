"use client";

import { LoaderCircle } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

/** A button that asks before running an irreversible action. */
export function ConfirmButton({
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
  className = "adm-button adm-button-danger",
  ariaLabel,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      dialog.current?.close();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => dialog.current?.showModal()}
        aria-label={ariaLabel}
      >
        {children}
      </button>
      <dialog ref={dialog} className="adm-dialog" aria-labelledby={titleId}>
        <div className="adm-dialog-body">
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="adm-dialog-actions">
          <button
            type="button"
            className="adm-button"
            onClick={() => dialog.current?.close()}
            disabled={pending}
            autoFocus
          >
            Annuler
          </button>
          <button
            type="button"
            className="adm-button adm-button-danger adm-button-solid"
            onClick={confirm}
            disabled={pending}
          >
            {pending && (
              <LoaderCircle className="adm-spin" aria-hidden="true" />
            )}
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
