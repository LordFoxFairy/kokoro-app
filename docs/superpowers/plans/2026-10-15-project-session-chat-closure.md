# Project Session and Chat Closure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the desktop rail at the approved 280px width and close the project/session/chat journey with one observable user-flow regression test and a real AG-UI boundary check.

**Architecture:** Projects remain a flat navigation index; direct conversations remain the global “任务” list; project-scoped conversations belong to the project overview and resolve to a canonical project URL with a `conversation` query. The application continues to use `AgUiChatTransport` as its sole live stream transport and maps AG-UI events to the engine/UI message model. No parallel SSE/replay path or browser-to-owner shortcut is introduced.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Playwright, AG-UI, Vercel AI SDK UI-message model.

---

## Scope and acceptance evidence

- The desktop rail defaults to 280px and retains the existing responsive overlay behavior.
- Submitting from a project overview creates a project-scoped conversation, navigates to its canonical URL, preserves the submitted message, and reaches the completed assistant state.
- Returning to the project overview lists the new conversation only in that project context; the rail’s global task feed remains direct-session-only.
- The AG-UI client verifies the complete event lifecycle against the BFF contract in an isolated integration run. A preview-only synthetic reply is never reported as BFF/Agent proof.
- Tests protect only the above observable paths; no pixel, CSS-string, or implementation-order tests are added.

## Execution slices

- [x] **Baseline and reproduction:** At 280px, the isolated preview created a project-scoped conversation, replaced the URL with its canonical `conversation` query, and completed the reply. The real project route reproduced a message-admission failure.
- [x] **User-flow regression:** Added one stable browser-level test for project overview → submit → canonical conversation route → assistant completion → return to overview. It uses accessible controls and visible content only.
- [x] **Root-cause repair:** The real admission endpoint returned documented `503 agent_not_configured`; the engine had discarded its public error code and the UI therefore rendered a misleading generic retry message. Preserve the public code and render the specific, recoverable configuration guidance.
- [x] **AG-UI integration gate:** The real same-origin message request reached the BFF and returned `503 agent_not_configured` with a request id. This is a BFF runtime configuration dependency (`KOKORO_AGENT_ENABLED=1` plus Agent HTTP upstream), not a browser fallback candidate; the app retains an explicit error and no preview success is substituted.
- [x] **Quality and visual closure:** Focused behavior tests (426), contract (278), architecture (50), lint, typecheck, build, and the browser journey (2) passed. The full suite reports 10 system-integration failures in IAM/OIDC proxy fixtures (2 files); they do not exercise this app slice and are recorded before delivery rather than masked.
- [ ] **Delivery:** Commit the app slice, open one PR, inspect CI, and merge only after the required checks and review evidence are present.
