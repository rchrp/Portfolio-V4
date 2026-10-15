import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { cookies } from "next/headers";
import * as z from "zod";
import type {
  AdminChallenge,
  AdminChallengePurpose,
  PrismaClient,
} from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { audit } from "./audit";
import {
  ADMIN_USER_ID,
  ADMIN_USER_NAME,
  CHALLENGE_LIFETIME_MS,
  getAdminConfig,
  MAX_PENDING_CHALLENGES,
  type AdminConfig,
} from "./config";
import { CHALLENGE_COOKIE, cookieName } from "./cookies";
import { createSession, type AdminSession } from "./session";
import { hashToken, randomToken, rateLimited, requestInfo } from "./security";

export type Result<T = null> =
  { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });

const NOT_CONFIGURED =
  "Le panneau d’administration n’est pas configuré sur ce serveur.";
const TOO_MANY = "Trop de tentatives. Réessayez dans quelques minutes.";
const BUSY = "Le serveur est occupé. Réessayez dans quelques minutes.";
const EXPIRED = "La demande a expiré. Recommencez.";

const CEREMONY_TIMEOUT_MS = 120_000;

// ─── Untrusted input from the browser ────────────────────────────────────────
// The library checks every signature; these schemas only bound what reaches it.

const base64url = z
  .string()
  .max(16_384)
  .regex(/^[A-Za-z0-9_-]*$/);
const credentialId = base64url.min(16).max(1024);
const extensions = z.record(z.string(), z.unknown()).default({});

const authenticationResponse = z.object({
  id: credentialId,
  rawId: credentialId,
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: base64url,
    authenticatorData: base64url,
    signature: base64url,
    userHandle: base64url.nullish().transform((value) => value ?? undefined),
  }),
  clientExtensionResults: extensions,
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
});

const registrationResponse = z.object({
  id: credentialId,
  rawId: credentialId,
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: base64url,
    attestationObject: base64url,
    authenticatorData: base64url.optional(),
    transports: z.array(z.string().max(32)).max(10).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: base64url.optional(),
  }),
  clientExtensionResults: extensions,
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
});

const passkeyName = z
  .string()
  .trim()
  .max(60)
  .transform((value) => value || "Passkey");

const inviteToken = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);

// ─── Challenges ──────────────────────────────────────────────────────────────
// Kept server side and tied to an HttpOnly cookie, consumed on first answer.

function challengeCookie(config: AdminConfig) {
  return {
    name: cookieName(CHALLENGE_COOKIE, config.secureCookies),
    options: {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "strict" as const,
      path: "/",
    },
  };
}

async function storeChallenge(
  config: AdminConfig,
  database: PrismaClient,
  purpose: AdminChallengePurpose,
  challenge: string,
  grant: { inviteId?: string; sessionId?: string } = {},
): Promise<boolean> {
  const now = new Date();
  const cookie = challengeCookie(config);
  const store = await cookies();
  // A browser has one ceremony at a time: a new one replaces the last.
  const previous = store.get(cookie.name)?.value;
  await database.adminChallenge.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        ...(previous ? [{ id: hashToken(previous) }] : []),
      ],
    },
  });
  if ((await database.adminChallenge.count()) >= MAX_PENDING_CHALLENGES) {
    return false;
  }

  const token = randomToken();
  await database.adminChallenge.create({
    data: {
      id: hashToken(token),
      purpose,
      challenge,
      ...grant,
      expiresAt: new Date(now.getTime() + CHALLENGE_LIFETIME_MS),
    },
  });
  store.set(cookie.name, token, {
    ...cookie.options,
    maxAge: CHALLENGE_LIFETIME_MS / 1000,
  });
  return true;
}

async function consumeChallenge(
  config: AdminConfig,
  database: PrismaClient,
  purpose: AdminChallengePurpose,
): Promise<AdminChallenge | null> {
  const cookie = challengeCookie(config);
  const store = await cookies();
  const token = store.get(cookie.name)?.value;
  store.set(cookie.name, "", { ...cookie.options, maxAge: 0 });
  if (!token || token.length > 128) return null;

  // Deleting is what makes a challenge single use, even under a race.
  const row = await database.adminChallenge
    .delete({ where: { id: hashToken(token) } })
    .catch(() => null);
  if (!row || row.purpose !== purpose || row.expiresAt <= new Date()) {
    return null;
  }
  return row;
}

function context() {
  const config = getAdminConfig();
  const database = getDatabase();
  return config && database ? { config, database } : null;
}

// ─── Sign in ─────────────────────────────────────────────────────────────────

export async function beginLogin(): Promise<
  Result<PublicKeyCredentialRequestOptionsJSON>
> {
  const env = context();
  if (!env) return fail(NOT_CONFIGURED);
  const { ipAddress } = await requestInfo();
  if (rateLimited(`login:${ipAddress}`, 10, 60_000)) return fail(TOO_MANY);

  // No allowCredentials: the passkey manager offers the admin's passkey
  // itself, and the page reveals nothing about which passkeys exist.
  const options = await generateAuthenticationOptions({
    rpID: env.config.rpID,
    userVerification: "required",
    timeout: CEREMONY_TIMEOUT_MS,
  });
  const stored = await storeChallenge(
    env.config,
    env.database,
    "AUTHENTICATION",
    options.challenge,
  );
  return stored ? ok(options) : fail(BUSY);
}

async function loginFailed(reason: string): Promise<Result<never>> {
  await audit("login.failed", reason);
  return fail("Cette passkey n’a pas pu être vérifiée.");
}

export async function finishLogin(input: unknown): Promise<Result> {
  const env = context();
  if (!env) return fail(NOT_CONFIGURED);
  const { config, database } = env;
  const { ipAddress } = await requestInfo();
  if (rateLimited(`login-verify:${ipAddress}`, 10, 15 * 60_000)) {
    await audit("login.failed", "rate limited");
    return fail(TOO_MANY);
  }

  const challenge = await consumeChallenge(config, database, "AUTHENTICATION");
  if (!challenge) return fail(EXPIRED);
  const parsed = authenticationResponse.safeParse(input);
  if (!parsed.success) return loginFailed("malformed response");
  const response = parsed.data as AuthenticationResponseJSON;

  const passkey = await database.adminPasskey.findUnique({
    where: { id: response.id },
  });
  if (!passkey) return loginFailed("unknown passkey");

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: passkey.publicKey,
        counter: Number(passkey.counter),
        transports: passkey.transports,
      },
    });
  } catch {
    return loginFailed(`invalid assertion for ${passkey.name}`);
  }
  if (!verification.verified) {
    return loginFailed(`invalid assertion for ${passkey.name}`);
  }

  // Conditional on the counter we checked, so a replay racing this request
  // cannot also succeed.
  const { newCounter, credentialBackedUp } = verification.authenticationInfo;
  const claimed = await database.adminPasskey.updateMany({
    where: { id: passkey.id, counter: passkey.counter },
    data: {
      counter: BigInt(newCounter),
      backedUp: credentialBackedUp,
      lastUsedAt: new Date(),
    },
  });
  if (claimed.count !== 1) return loginFailed("concurrent assertion");

  await createSession(passkey.id);
  await audit("login", passkey.name);
  return ok(null);
}

// ─── Passkey registration ────────────────────────────────────────────────────

async function registrationOptions(
  config: AdminConfig,
  database: PrismaClient,
) {
  const existing = await database.adminPasskey.findMany({
    select: { id: true, transports: true },
  });
  return generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: ADMIN_USER_NAME,
    userDisplayName: "Administrateur du portfolio",
    userID: ADMIN_USER_ID,
    attestationType: "none",
    excludeCredentials: existing,
    // A discoverable credential with user verification: the passkey alone
    // signs in, and only after its owner unlocked it.
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
    timeout: CEREMONY_TIMEOUT_MS,
  });
}

/** First passkey, or a lost one: allowed by a link from `pnpm admin:invite`. */
export async function beginEnrollment(
  token: unknown,
): Promise<Result<PublicKeyCredentialCreationOptionsJSON>> {
  const env = context();
  if (!env) return fail(NOT_CONFIGURED);
  const { ipAddress } = await requestInfo();
  if (rateLimited(`enroll:${ipAddress}`, 10, 15 * 60_000)) {
    return fail(TOO_MANY);
  }

  const invalid = fail("Ce lien d’invitation est invalide ou a expiré.");
  const parsed = inviteToken.safeParse(token);
  if (!parsed.success) return invalid;
  const invite = await env.database.adminInvite.findUnique({
    where: { id: hashToken(parsed.data) },
  });
  if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
    return invalid;
  }

  const options = await registrationOptions(env.config, env.database);
  const stored = await storeChallenge(
    env.config,
    env.database,
    "REGISTRATION",
    options.challenge,
    { inviteId: invite.id },
  );
  return stored ? ok(options) : fail(BUSY);
}

/** Another passkey, from a signed-in session (e.g. a backup key). */
export async function beginAddPasskey(
  session: AdminSession,
): Promise<Result<PublicKeyCredentialCreationOptionsJSON>> {
  const env = context();
  if (!env) return fail(NOT_CONFIGURED);
  const options = await registrationOptions(env.config, env.database);
  const stored = await storeChallenge(
    env.config,
    env.database,
    "REGISTRATION",
    options.challenge,
    { sessionId: session.id },
  );
  return stored ? ok(options) : fail(BUSY);
}

class InviteSpent extends Error {}

export async function finishRegistration(
  input: unknown,
  name: unknown,
  session: AdminSession | null,
): Promise<Result> {
  const env = context();
  if (!env) return fail(NOT_CONFIGURED);
  const { config, database } = env;

  const challenge = await consumeChallenge(config, database, "REGISTRATION");
  if (!challenge) return fail(EXPIRED);
  // Whatever allowed the ceremony must still allow it now.
  const allowed = challenge.sessionId
    ? session?.id === challenge.sessionId
    : Boolean(challenge.inviteId);
  if (!allowed) return fail(EXPIRED);

  const parsed = registrationResponse.safeParse(input);
  const label = passkeyName.safeParse(name ?? "");
  if (!parsed.success || !label.success) {
    return fail("La réponse de l’authentificateur est invalide.");
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: parsed.data as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
  } catch {
    return fail("Cette passkey n’a pas pu être vérifiée.");
  }
  if (!verification.verified) {
    return fail("Cette passkey n’a pas pu être vérifiée.");
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;
  const now = new Date();
  try {
    await database.$transaction(async (transaction) => {
      if (challenge.inviteId) {
        const claimed = await transaction.adminInvite.updateMany({
          where: {
            id: challenge.inviteId,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw new InviteSpent();
      }
      await transaction.adminPasskey.create({
        data: {
          id: credential.id,
          publicKey: credential.publicKey,
          counter: BigInt(credential.counter),
          transports: credential.transports ?? [],
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          name: label.data,
        },
      });
    });
  } catch (error) {
    if (error instanceof InviteSpent) {
      return fail("Ce lien d’invitation a déjà servi ou a expiré.");
    }
    return fail("Cette passkey est déjà enregistrée.");
  }

  await audit("passkey.added", label.data);
  if (challenge.inviteId) {
    await createSession(credential.id);
    await audit("login", `${label.data}, via une invitation`);
  }
  return ok(null);
}
