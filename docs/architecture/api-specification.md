# REST & Server Action API Specifications

## 1. Authentication & Workspace Endpoints

### `POST /api/auth/register`
- **Request Body:** `{ email, password, name, phone, country: "EG" | "SA", locale: "ar" | "en" }`
- **Response (201):** `{ user: { id, email, name, role }, workspace: { id, slug, currency } }`
- **Behavior:** Automatically provisions a default workspace, allocates 5 free starter credits, and logs initial transaction in `CreditLedger`.

### `POST /api/auth/login`
- **Request Body:** `{ email, password }`
- **Response (200):** `{ user, sessionToken, activeWorkspace }`

---

## 2. Product & Asset Storage Endpoints

### `POST /api/assets/presign-upload`
- **Request Body:** `{ filename, contentType, fileSize, productId }`
- **Response (200):** `{ uploadUrl, assetKey, cdnUrl }`
- **Behavior:** Generates a secure S3/R2 presigned PUT URL with strict 5-minute expiration and size ceiling (max 20MB).

### `POST /api/products/[id]/segment`
- **Request Body:** `{ assetId }`
- **Response (200):** `{ maskedUrl, maskUrl, boundingBox }`
- **Behavior:** Initiates subject segmentation and alpha matte extraction, storing binary mask and transparent PNG.

---

## 3. Photoshoot & AI Generation Engine Endpoints

### `POST /api/photoshoots`
- **Request Body:** `{ productId, title, stylePresetId, aspectRatio: "1:1" | "4:5" | "9:16" | "16:9", customPromptDetails?: string }`
- **Response (201):** `{ photoshoot: { id, title, stylePreset } }`

### `POST /api/photoshoots/[id]/generate`
- **Request Body:** `{ modelTarget?: "imagen-3.0-generate-002" | "gemini-2.5-flash-image", count: number }`
- **Response (202 Accepted):** `{ jobId, status: "QUEUED", estimatedWaitSeconds: 5, creditsReserved: 1 }`
- **Behavior:**
  1. Validates available balance via `CreditLedger`.
  2. Creates atomic `CreditReservation` row.
  3. Enqueues generation task.
  4. Returns immediate 202 without blocking HTTP thread.

### `GET /api/jobs/[id]`
- **Response (200):**
  ```json
  {
    "id": "job-1234",
    "status": "COMPLETED",
    "startedAt": "2026-11-05T12:00:00Z",
    "completedAt": "2026-11-05T12:00:06Z",
    "images": [
      {
        "id": "img-5678",
        "imageUrl": "https://cdn.shotistry.com/renders/job-1234.png",
        "thumbnailUrl": "https://cdn.shotistry.com/renders/thumb-1234.png",
        "aspectRatio": "1:1",
        "resolution": "1024x1024"
      }
    ]
  }
  ```

### `GET /api/jobs/[id]/stream`
- **Response:** `text/event-stream` (Server-Sent Events for real-time progress update without client polling).

---

## 4. Paymob Billing & Subscription Endpoints

### `GET /api/billing/plans`
- **Query:** `?country=EG` or `?country=SA`
- **Response (200):** Returns localized plans (Starter, Pro, Agency) formatted in target currency (EGP or SAR).

### `POST /api/billing/checkout-intent`
- **Request Body:** `{ planTier: "PRO", currency: "EGP" | "SAR", billingCycle: "MONTHLY" }`
- **Response (200):** `{ clientSecret, intentionId, checkoutUrl }`
- **Behavior:** Contacts Paymob Intention API, registers subscription order, returns Unified Checkout client token.

### `POST /api/webhooks/paymob`
- **Headers:** `paymob-hmac: <HMAC-SHA512>`
- **Request Body:** Paymob JSON payload (`trigger_type`, `subscription_data`, etc.).
- **Response:** `200 OK`
- **Behavior:** Verifies cryptographic signature, deduplicates event in `WebhookEvent`, updates `Subscription` status, credits `CreditLedger` inside atomic transaction.
