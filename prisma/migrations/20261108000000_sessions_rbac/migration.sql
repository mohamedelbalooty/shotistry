-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- AlterTable User
ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "trialGrantedAt" TIMESTAMP(3),
  ADD COLUMN "passwordUpdatedAt" TIMESTAMP(3);

-- AlterTable WorkspaceMember
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "WorkspaceMember"
  ALTER COLUMN "role" TYPE "WorkspaceRole"
  USING (
    CASE
      WHEN "role" IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') THEN "role"::"WorkspaceRole"
      ELSE 'MEMBER'::"WorkspaceRole"
    END
  );
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- CreateTable Session
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeWorkspaceId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeWorkspaceId_fkey" FOREIGN KEY ("activeWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
