# Relational Database Schema & Domain Entity Design

## 1. Entity-Relationship Overview

```
User ──1:N── Workspace ──1:N── Brand ──1:N── Product ──1:N── ProductAsset
               │
               ├──1:1── Subscription ──1:N── PaymentTransaction
               │
               ├──1:N── CreditLedger
               ├──1:N── CreditReservation
               │
               └──1:N── Photoshoot ──1:N── GenerationJob ──1:N── GeneratedImage
                                                 │
                                                 └── PromptVersion
```

---

## 2. Core Domain Entities (Prisma Schema Specification)

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
  SUBSCRIPTION_GRANT
  TOP_UP_PURCHASE
  JOB_SETTLEMENT
  JOB_REFUND
  ADMIN_ADJUSTMENT
}

model User {
  id            String      @id @default(uuid())
  email         String      @unique
  name          String?
  phone         String?
  passwordHash  String?
  role          Role        @default(USER)
  country       String      @default("EG") // EG or SA
  locale        String      @default("ar") // ar or en
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  workspaces    WorkspaceMember[]
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

  members       WorkspaceMember[]
  brands        Brand[]
  photoshoots   Photoshoot[]
  subscription  Subscription?
  creditLedgers CreditLedger[]
  reservations  CreditReservation[]
  transactions  PaymentTransaction[]
}

model WorkspaceMember {
  id          String     @id @default(uuid())
  workspaceId String
  userId      String
  role        String     @default("MEMBER") // OWNER, ADMIN, MEMBER
  createdAt   DateTime   @default(now())

  workspace   Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
}

model Brand {
  id          String        @id @default(uuid())
  workspaceId String
  name        String
  description String?
  logoUrl     String?
  primaryColor String?
  accentColor String?
  aesthetic   String?       // Minimalist, Luxury, Boho, etc.
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  products    Product[]
}

model Product {
  id          String        @id @default(uuid())
  brandId     String
  name        String
  category    String        // Fragrances, Apparel, Cosmetics, etc.
  description String?
  dimensions  String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  brand       Brand         @relation(fields: [brandId], references: [id], onDelete: Cascade)
  assets      ProductAsset[]
  photoshoots Photoshoot[]
}

model ProductAsset {
  id          String     @id @default(uuid())
  productId   String
  rawUrl      String     // Raw uploaded photo
  maskedUrl   String?    // Isolated product transparent PNG
  maskUrl     String?    // Binary alpha mask PNG
  width       Int
  height      Int
  fileSize    Int
  createdAt   DateTime   @default(now())

  product     Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model PromptTemplate {
  id          String          @id @default(uuid())
  name        String
  nameAr      String
  category    String
  thumbnailUrl String?
  isRegional  Boolean         @default(false)
  isActive    Boolean         @default(true)
  createdAt   DateTime        @default(now())

  versions    PromptVersion[]
}

model PromptVersion {
  id          String          @id @default(uuid())
  templateId  String
  version     Int             @default(1)
  basePrompt  String          @db.Text
  negPrompt   String?         @db.Text
  modelTarget String          @default("imagen-3.0-generate-002")
  isCurrent   Boolean         @default(true)
  createdAt   DateTime        @default(now())

  template    PromptTemplate  @relation(fields: [templateId], references: [id], onDelete: Cascade)
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
  id              String            @id @default(uuid())
  photoshootId    String
  promptVersionId String?
  status          JobStatus         @default(QUEUED)
  modelUsed       String
  creditCost      Int               @default(1)
  rawPrompt       String            @db.Text
  synthesizedPrompt String          @db.Text
  errorMessage    String?
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime          @default(now())

  photoshoot      Photoshoot        @relation(fields: [photoshootId], references: [id], onDelete: Cascade)
  promptVersion   PromptVersion?    @relation(fields: [promptVersionId], references: [id])
  images          GeneratedImage[]
  reservation     CreditReservation?
}

model GeneratedImage {
  id              String         @id @default(uuid())
  generationJobId String
  imageUrl        String
  thumbnailUrl    String?
  resolution      String         @default("1024x1024")
  aspectRatio     String         @default("1:1")
  seed            BigInt?
  isFavorite      Boolean        @default(false)
  synthIdDetected Boolean        @default(true)
  createdAt       DateTime       @default(now())

  generationJob   GenerationJob  @relation(fields: [generationJobId], references: [id], onDelete: Cascade)
}

model Subscription {
  id                  String             @id @default(uuid())
  workspaceId         String             @unique
  planTier            PlanTier           @default(FREE)
  status              SubscriptionStatus @default(INCOMPLETE)
  currency            Currency           @default(EGP)
  monthlyCredits      Int                @default(5)
  paymobSubscriptionId String?           @unique
  paymobCardToken     String?
  currentPeriodStart  DateTime           @default(now())
  currentPeriodEnd    DateTime
  cancelAtPeriodEnd   Boolean            @default(false)
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  workspace           Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model CreditLedger {
  id              String                @id @default(uuid())
  workspaceId     String
  amount          Int                   // Positive for credits, negative for debits
  balanceAfter    Int
  type            LedgerTransactionType
  referenceId     String?               // Transaction ID or Job ID
  description     String?
  createdAt       DateTime              @default(now())

  workspace       Workspace             @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

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
  id              String         @id @default(uuid())
  workspaceId     String
  amountCents     Int
  currency        Currency
  paymobOrderId   String?        @unique
  paymobTxnId     String?        @unique
  paymentMethod   String?        // Mada, ApplePay, Visa, Meeza, Wallet
  status          String         // SUCCESS, FAILED, PENDING
  errorMessage    String?
  createdAt       DateTime       @default(now())

  workspace       Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model WebhookEvent {
  id              String         @id @default(uuid())
  source          String         @default("PAYMOB")
  eventId         String         @unique
  payloadHash     String
  payload         Json
  processed       Boolean        @default(false)
  processedAt     DateTime?
  errorMessage    String?
  createdAt       DateTime       @default(now())

  @@index([source, eventId])
}

model AdminAuditLog {
  id          String     @id @default(uuid())
  userId      String
  action      String     // CREDIT_OVERRIDE, PLAN_CHANGE, USER_SUSPEND
  targetId    String?
  details     Json?
  ipAddress   String?
  createdAt   DateTime   @default(now())

  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

