# ADR-001: Selection of Core Technology Stack, Database & Object Storage

## Status: ACCEPTED
**Deciders:** Full-Stack Architect, AI Engineer, DevOps Lead  
**Date:** November 2026  

---

## 1. Context & Problem Statement
Shotistry requires an enterprise-ready, high-performance web architecture supporting bilingual RTL/LTR experiences, rapid asset rendering, secure payment processing, and scalable background image generation. We need to decide on:
1. Application framework and runtime.
2. Relational persistence engine.
3. Object storage provider for high-resolution commercial images.

---

## 2. Decision Drivers
- Serverless compatibility with Vercel deployment targets.
- Zero egress fee storage costs for gigabytes of high-resolution e-commerce images.
- ACID guarantees for financial transactions and credit accounting.
- Native bilingual i18n support with fast First Contentful Paint (FCP).

---

## 3. Considered Alternatives

### Framework & Backend
- **Option A:** Next.js 15 (App Router, React 19, TypeScript) [SELECTED]
- **Option B:** Separate NestJS API + Vite React Single-Page Application (Rejected: Unnecessary operational complexity; requires managing separate hosting, CORS, dual deployments).

### Database Engine
- **Option A:** PostgreSQL with Prisma ORM [SELECTED] (Robust relational integrity, ACID transactions, row-level locking support, excellent TypeScript DX).
- **Option B:** MongoDB / DocumentDB (Rejected: Lack of multi-document transactions and rigid schema guarantees for financial ledger).

### Object Storage
- **Option A:** Cloudflare R2 [SELECTED] (S3 API compatible, **$0 egress fees**, global edge CDN, low storage cost).
- **Option B:** AWS S3 (Rejected: High data transfer/egress fees would degrade gross margins by 5–10% at scale).

---

## 4. Consequences
- **Positive:** Maximum operational simplicity; Next.js 15 handles frontend, API route handlers, and server actions within one unified repository; Cloudflare R2 preserves 75%+ gross margins.
- **Negative:** Serverless execution time bounds require asynchronous job handling for AI tasks (addressed in ADR-003).
