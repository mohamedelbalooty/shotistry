# Threat Model & Vulnerability Assessment (STRIDE)

We performed a formal STRIDE threat assessment on the Shotistry platform:

| Threat Category | Potential Attack Vector | Impact | Engineering Countermeasure |
|---|---|---|---|
| **Spoofing** | Attacker spoofs Paymob webhook callbacks to illegally grant credits | Critical | Cryptographic HMAC-SHA512 verification with strict secret key and constant-time string comparison (`timingSafeEqual`). |
| **Tampering** | User manipulates image aspect ratios or injects prompt jailbreaks into generation requests | High | Schema validation via Zod; sanitized prompt synthesis; system-enforced aspect ratio enums. |
| **Repudiation** | User denies purchasing top-up credits or initiating generation jobs | Medium | Immutable `CreditLedger` and `AdminAuditLog` recording IP address, user ID, workspace ID, timestamp, and transaction reference. |
| **Information Disclosure** | Competitor discovers other merchants' unreleased products by guessing sequential asset URLs | Critical | Cryptographically secure UUIDv4 asset identifiers and time-limited presigned private URLs (5-minute TTL). |
| **Denial of Service** | Malicious bot floods generation API with massive uncompressed image uploads | High | Client and server-side file type and size limits (max 20MB); rate limiting (10 requests/minute per IP/user); credit reservation gating. |
| **Elevation of Privilege** | Normal user accesses internal admin metrics or overrides subscription state | Critical | Role-Based Access Control (RBAC) enforced on middleware and server actions (`ADMIN` role required). |

