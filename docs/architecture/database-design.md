# Relational Database Schema & Domain Entity Design

- **Schema Source of Truth:** [`prisma/schema.prisma`](file:///Users/tasawk/StudioProjects/shotistry/prisma/schema.prisma)
- **PostgreSQL Migrations:**
  - Initial 17-table / 7-enum schema: [`prisma/migrations/20261105000000_init/migration.sql`](file:///Users/tasawk/StudioProjects/shotistry/prisma/migrations/20261105000000_init/migration.sql)
  - Option A Session & Workspace RBAC evolution: [`prisma/migrations/20261108000000_sessions_rbac/migration.sql`](file:///Users/tasawk/StudioProjects/shotistry/prisma/migrations/20261108000000_sessions_rbac/migration.sql)
  - Auth Security Hardening (Tokens, Invites, Rate Limit Buckets): [`prisma/migrations/20261109000000_auth_security_hardening/migration.sql`](file:///Users/tasawk/StudioProjects/shotistry/prisma/migrations/20261109000000_auth_security_hardening/migration.sql)
- **Totals:** **21 Models** and **9 Enums** (synchronized with the local `node:sqlite` DDL in [`src/lib/db/prisma.ts`](file:///Users/tasawk/StudioProjects/shotistry/src/lib/db/prisma.ts) and [`PostgresCreditLedgerService`](file:///Users/tasawk/StudioProjects/shotistry/src/lib/ledger/postgres-ledger-service.ts)).

---

## 1. Entity-Relationship Overview

```
User ──1:N── Session ──N:1 (optional activeWorkspace)── Workspace
  │                                                         │
  ├──1:N── AdminAuditLog                                    ├──1:N── WorkspaceMember (role: WorkspaceRole)
  │                                                         ├──1:N── Brand ──1:N── Product ──1:N── ProductAsset
  └──1:N── WorkspaceMember ─────────────────────────────────┤
                                                            ├──1:1── Subscription
                                                            ├──1:N── PaymentTransaction
                                                            ├──1:N── CreditLedger (idempotencyKey @unique)
                                                            ├──1:N── CreditReservation
                                                            └──1:N── Photoshoot ──1:N── GenerationJob ──1:N── GeneratedImage
                                                                                          │
                                                                                          └── PromptVersion ──N:1── PromptTemplate

WebhookEvent (standalone idempotency & audit log keyed on eventId)
```

---

## 2. Core Domain Entities (Exact Prisma Schema Specification)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  USER
  ADMIN
  SUPPORT
}

enum WorkspaceRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}

enum PlanTier {
  FREE
  STARTER
  PRO
  AGENCY
}

enum SubscriptionStatus {
  INCOMPLETE
  ACTIVE
  PAST_DUE
  SUSPENDED
  CANCELED
}

enum Currency {
  EGP
  SAR
  USD
}

enum JobStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
  CANCELED
}

enum ReservationStatus {
  PENDING
  SETTLED
  RELEASED
}

enum LedgerTransactionType {
  TRIAL_GRANT
  SUBSCRIPTION_GRANT
  TOP_UP_PURCHASE
  JOB_SETTLEMENT
  JOB_REFUND
  ADMIN_ADJUSTMENT
}

model User {
  id                String      @id @default(uuid())
  email             String      @unique
  name              String?
  phone             String?
  passwordHash      String?
  role              Role        @default(USER)
  country           String      @default("EG") // EG or SA
  locale            String      @default("ar") // ar or en
  emailVerifiedAt   DateTime?
  trialGrantedAt    DateTime?
  passwordUpdatedAt DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  workspaces    WorkspaceMember[]
  sessions      Session[]
  auditLogs     AdminAuditLog[]
}

model Workspace {
  id            String            @id @default(uuid())
  name          String
  slug          String            @unique
  ownerId       String
  country       String            @default("EG")
  currency      Currency          @default(EGP)
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  members        WorkspaceMember[]
  activeSessions Session[]
  brands         Brand[]
  photoshoots    Photoshoot[]
  subscription   Subscription?
  creditLedgers  CreditLedger[]
  reservations   CreditReservation[]
  transactions   PaymentTransaction[]
}

model WorkspaceMember {
  id          String        @id @default(uuid())
  workspaceId String
  userId      String
  role        WorkspaceRole @default(MEMBER)
  createdAt   DateTime      @default(now())

  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
}

model Session {
  id                String     @id @default(uuid())
  userId            String
  activeWorkspaceId String?
  tokenHash         String     @unique
  csrfToken         String
  userAgent         String?
  ipAddress         String?
  createdAt         DateTime   @default(now())
  lastActivityAt    DateTime   @default(now())
  idleExpiresAt     DateTime
  expiresAt         DateTime
  revokedAt         DateTime?
  revokedReason     String?

  user              User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  activeWorkspace   Workspace? @relation(fields: [activeWorkspaceId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([expiresAt])
}

model Brand {
  id           String        @id @default(uuid())
  workspaceId  String
  name         String
  description  String?
  logoUrl      String?
  primaryColor String?
  accentColor  String?
  aesthetic    String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  workspace    Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  products     Product[]
}

model Product {
  id          String         @id @default(uuid())
  brandId     String
  name        String
  category    String
  description String?
  dimensions  String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  brand       Brand          @relation(fields: [brandId], references: [id], onDelete: Cascade)
  assets      ProductAsset[]
  photoshoots Photoshoot[]
}

model ProductAsset {
  id          String     @id @default(uuid())
  productId   String
  rawUrl      String
  maskedUrl   String?
  maskUrl     String?
  width       Int
  height      Int
  fileSize    Int
  createdAt   DateTime   @default(now())

  product     Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model PromptTemplate {
  id           String          @id @default(uuid())
  name         String
  nameAr       String
  category     String
  thumbnailUrl String?
  isRegional   Boolean         @default(false)
  isActive     Boolean         @default(true)
  createdAt    DateTime        @default(now())

  versions     PromptVersion[]
}

model PromptVersion {
  id          String         @id @default(uuid())
  templateId  String
  version     Int            @default(1)
  basePrompt  String         @db.Text
  negPrompt   String?        @db.Text
  modelTarget String         @default("gemini-3.1-flash-image")
  isCurrent   Boolean        @default(true)
  createdAt   DateTime       @default(now())

  template    PromptTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  jobs        GenerationJob[]
}

model Photoshoot {
  id          String          @id @default(uuid())
  workspaceId String
  productId   String
  title       String
  stylePreset String
  aspectRatio String          @default("1:1") // 1:1, 4:5, 9:16, 16:9
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  workspace   Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  product     Product         @relation(fields: [productId], references: [id], onDelete: Cascade)
  jobs        GenerationJob[]
}

model GenerationJob {
  id                String             @id @default(uuid())
  photoshootId      String
  promptVersionId   String?
  status            JobStatus          @default(QUEUED)
  modelUsed         String
  creditCost        Int                @default(1)
  rawPrompt         String             @db.Text
  synthesizedPrompt String             @db.Text
  errorMessage      String?
  startedAt         DateTime?
  completedAt       DateTime?
  createdAt         DateTime           @default(now())

  photoshoot        Photoshoot         @relation(fields: [photoshootId], references: [id], onDelete: Cascade)
  promptVersion     PromptVersion?     @relation(fields: [promptVersionId], references: [id])
  images            GeneratedImage[]
  reservation       CreditReservation?
}

model GeneratedImage {
  id              String        @id @default(uuid())
  generationJobId String
  imageUrl        String
  thumbnailUrl    String?
  resolution      String        @default("1024x1024")
  aspectRatio     String        @default("1:1")
  seed            BigInt?
  isFavorite      Boolean       @default(false)
  synthIdDetected Boolean       @default(false)
  fidelityScore   Float         @default(1.0)
  executionMode   String        @default("LIVE_GEMINI_API")
  createdAt       DateTime      @default(now())

  generationJob   GenerationJob @relation(fields: [generationJobId], references: [id], onDelete: Cascade)
}

model Subscription {
  id                   String             @id @default(uuid())
  workspaceId          String             @unique
  planTier             PlanTier           @default(FREE)
  status               SubscriptionStatus @default(INCOMPLETE)
  currency             Currency           @default(EGP)
  monthlyCredits       Int                @default(5)
  paymobSubscriptionId String?            @unique
  paymobCardToken      String?
  currentPeriodStart   DateTime           @default(now())
  currentPeriodEnd     DateTime
  cancelAtPeriodEnd    Boolean            @default(false)
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  workspace            Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model CreditLedger {
  id             String                @id @default(uuid())
  workspaceId    String
  amount         Int
  balanceAfter   Int
  type           LedgerTransactionType
  referenceId    String?
  idempotencyKey String?               @unique
  description    String?
  createdAt      DateTime              @default(now())

  workspace    Workspace             @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, createdAt])
}

model CreditReservation {
  id              String            @id @default(uuid())
  workspaceId     String
  generationJobId String            @unique
  amount          Int
  status          ReservationStatus @default(PENDING)
  createdAt       DateTime          @default(now())
  settledAt       DateTime?

  workspace       Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  generationJob   GenerationJob     @relation(fields: [generationJobId], references: [id], onDelete: Cascade)
}

model PaymentTransaction {
  id            String    @id @default(uuid())
  workspaceId   String
  amountCents   Int
  currency      Currency
  paymobOrderId String?   @unique
  paymobTxnId   String?   @unique
  paymentMethod String?
  status        String
  errorMessage  String?
  createdAt     DateTime  @default(now())

  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model WebhookEvent {
  id           String    @id @default(uuid())
  source       String    @default("PAYMOB")
  eventId      String    @unique
  payloadHash  String
  payload      Json
  processed    Boolean   @default(false)
  processedAt  DateTime?
  errorMessage String?
  createdAt    DateTime  @default(now())

  @@index([source, eventId])
}

model AdminAuditLog {
  id        String   @id @default(uuid())
  userId    String
  action    String
  targetId  String?
  details   Json?
  ipAddress String?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum AuthActionTokenType {
  EMAIL_VERIFY
  PASSWORD_RESET
  EMAIL_CHANGE
}

model AuthActionToken {
  id          String              @id @default(uuid())
  userId      String
  type        AuthActionTokenType
  tokenHash   String              @unique
  targetEmail String?
  expiresAt   DateTime
  consumedAt  DateTime?
  revokedAt   DateTime?
  createdIp   String?
  createdAt   DateTime            @default(now())

  user        User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, type])
  @@index([expiresAt])
}

model RateLimitBucket {
  key         String   @id
  count       Int
  windowStart DateTime
  expiresAt   DateTime
  updatedAt   DateTime

  @@index([expiresAt])
}

model WorkspaceInvite {
  id               String        @id @default(uuid())
  workspaceId      String
  invitedEmail     String
  role             WorkspaceRole
  invitedByUserId  String
  tokenHash        String        @unique
  expiresAt        DateTime
  acceptedAt       DateTime?
  acceptedByUserId String?
  revokedAt        DateTime?
  createdAt        DateTime      @default(now())

  workspace        Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  invitedBy        User          @relation("InviteSender", fields: [invitedByUserId], references: [id], onDelete: Cascade)
  acceptedBy       User?         @relation("InviteAccepter", fields: [acceptedByUserId], references: [id], onDelete: SetNull)

  @@index([workspaceId, invitedEmail])
  @@index([expiresAt])
}
```
