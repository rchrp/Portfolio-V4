import { WebAuthnError } from "@simplewebauthn/browser";

/** A sentence for what the browser or the passkey manager refused. */
export function describePasskeyError(error: unknown): string {
  const code = error instanceof WebAuthnError ? error.code : null;
  const name = error instanceof Error ? error.name : null;
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return "Cette passkey est déjà enregistrée.";
  }
  if (name === "NotAllowedError") {
    return "Opération annulée ou délai dépassé. Réessayez.";
  }
  if (name === "SecurityError" || code === "ERROR_INVALID_DOMAIN") {
    return "Ce domaine ne correspond pas à la configuration du serveur (ADMIN_ORIGIN).";
  }
  return "Votre navigateur n’a pas pu utiliser de passkey.";
}
