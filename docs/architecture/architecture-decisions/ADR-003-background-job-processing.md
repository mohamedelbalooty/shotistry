# ADR-003: Asynchronous Job Processing & Queue Architecture for Serverless

## Status: ACCEPTED
**Deciders:** Solutions Architect, Full-Stack Engineer, DevOps Lead  
**Date:** November 2026  

---

## 1. Context & Problem Statement
Image generation via Google GenAI (`gemini-3.1-flash-image` / `gemini-3-pro-image` via `ai.interactions.create`) typically requires 3 to 7 seconds. Under Vercel serverless functions, synchronous HTTP connections:
1. Risk timeout errors on slow connections.
2. Degrade client user experience.
3. Waste serverless execution billable wall-clock time waiting on external I/O.

---

## 2. Decision
1. Generation requests return immediately with an HTTP 202 Accepted and a persistent `GenerationJob` identifier.
2. Background execution is handled via an asynchronous background job pipeline (using Upstash QStash / internal event worker).
3. The frontend studio listens via **Server-Sent Events (SSE)** at `/api/jobs/[id]/stream` with an automatic fallback to exponential client polling (`/api/jobs/[id]`).

---

## 3. Consequences
- **Positive:** Zero client request timeouts; resilient retry capability; real-time progress feedback (e.g. "Segmenting...", "Synthesizing lighting...", "Rendering 4K details...").
- **Negative:** Client requires state management to track active job status across browser reloads (handled cleanly in workspace store).

