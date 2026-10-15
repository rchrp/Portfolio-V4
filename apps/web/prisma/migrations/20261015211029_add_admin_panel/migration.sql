-- Admin panel: passkeys, sessions, WebAuthn challenges, one-time enrollment
-- invites and an audit trail. No password is ever stored.

-- CreateEnum
CREATE TYPE "AdminChallengePurpose" AS ENUM ('REGISTRATION', 'AUTHENTICATION');

-- CreateTable
CREATE TABLE "AdminPasskey" (
    "id" VARCHAR(1024) NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deviceType" VARCHAR(16) NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "name" VARCHAR(60) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AdminPasskey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" CHAR(64) NOT NULL,
    "passkeyId" TEXT NOT NULL,
    "userAgent" VARCHAR(255),
    "ipAddress" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminChallenge" (
    "id" CHAR(64) NOT NULL,
    "purpose" "AdminChallengePurpose" NOT NULL,
    "challenge" VARCHAR(128) NOT NULL,
    "inviteId" CHAR(64),
    "sessionId" CHAR(64),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdminChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminInvite" (
    "id" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditEvent" (
    "id" TEXT NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "detail" VARCHAR(240),
    "ipAddress" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminSession_passkeyId_idx" ON "AdminSession"("passkeyId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminChallenge_expiresAt_idx" ON "AdminChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_createdAt_idx" ON "AdminAuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_passkeyId_fkey" FOREIGN KEY ("passkeyId") REFERENCES "AdminPasskey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
