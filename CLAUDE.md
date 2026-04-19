# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project: HackerManChat

Hackathon submission: a classic web chat server. Scope — user auth, public/private rooms, 1-to-1 DMs, contacts/friends, file & image sharing, basic moderation, persistent history. Target **300 concurrent users**, up to **1000 members per room**. Must boot with a single `docker compose up` from the repo root.

## 5. Tech Stack

**Server**
- .NET 9 / ASP.NET Core / SignalR
- EF Core 9 + PostgreSQL 16
- Redis 7 (SignalR backplane + presence store)
- ASP.NET Core Identity + JWT (access + refresh tokens stored hashed in DB)

**Client**
- React 18 + TypeScript + Vite
- Zustand (UI state)
- Tailwind CSS
- `@microsoft/signalr` client
- `BroadcastChannel` API for cross-tab presence coordination

**Infrastructure (docker compose services)**
- `api` — .NET app, runs EF migrations on startup
- `web` — static build of the React SPA, served by an nginx baked into the image (proxies `/api` + `/hubs` to `api`)
- `postgres` (with healthcheck) — volume `pgdata`
- `redis` (with healthcheck) — volume `redisdata`
- `mailhog` — dev-only password-reset email capture
- Files live on a mounted volume `chatfiles`

## 6. Domain Glossary & Invariants

These are the rules that are easy to get wrong. Violating any of them is a bug.

- **User**: `email` unique, `username` unique AND **immutable after registration**, password hashed. Email verification is NOT required.
- **Session**: one row per browser sign-in. Visible in the active-sessions UI. Sign-out invalidates **only** the current session; other sessions remain valid.
- **Presence**: states are `online` | `afk` | `offline`. AFK = **all** of the user's open tabs idle > 60 s. Offline = **all** tabs closed. Computed from Redis presence record aggregated across a user's SignalR connections.
- **Friendship**: symmetric, requires recipient confirmation. DMs allowed **only if** both are friends AND neither has banned the other.
- **User-to-user ban**: terminates friendship, **freezes** existing DM history (read-only, preserved), blocks all new contact between the two.
- **Room**: `name` unique. Has exactly one **owner** (permanent admin — cannot leave, can only delete the room), 0+ admins, members, banned users. Visibility: `public` (in catalog) or `private` (invite-only, not listed).
- **Room removal by admin == room ban**. Removed user loses access to the room's messages **and** its files/images through the UI. Files remain on disk unless the room itself is deleted.
- **Admin rights**: delete messages in the room, kick/ban/unban members, manage admin list (except the owner). Owner additionally: delete the room, remove any admin.
- **Account deletion**: only rooms the deleting user **owns** are deleted (cascades their messages + files). In other rooms the user is simply removed as a member; their historical messages there remain.
- **Personal chat = 2-participant chat**. Same feature surface as rooms; **no admins**, no moderation actions.
- **Message**: text ≤ 3 KB UTF-8, supports multiline / emoji / attachments / reply-to. Editable by author — show "edited" indicator. Deletable by author or (in rooms only) by admins.
- **Attachment**: image ≤ 3 MB, file ≤ 20 MB. Preserve original filename. Optional comment. Every download re-checks current membership.
- **Unread indicator**: per chat/contact. Cleared when the user opens that chat.

## 7. Architectural Rules

- Single EF Core migration pipeline; migrations run on `api` container startup (no manual migration step).
- SignalR hubs split by concern: `ChatHub` (rooms + DMs), `PresenceHub` (tab heartbeats → Redis).
- **One SignalR connection per user per browser, not per tab.** Tabs elect a leader via `BroadcastChannel`; followers subscribe locally.
- Authorization enforced **server-side on every hub method and REST endpoint** — never trust the client for membership, role, or ban state.
- File downloads go through an authenticated endpoint that re-verifies membership. The uploads volume is never statically exposed.
- Message text size (3 KB) validated on both client and server.
- Message history uses **keyset pagination** by `(createdAt, messageId)`, not offset — required to stay snappy on 10k-message rooms.

## 8. Performance Budget

- Message delivery: p95 ≤ 3 s end-to-end.
- Presence propagation: p95 ≤ 2 s.
- If a proposed change could blow either budget (e.g., N+1 fanout, per-message DB write without batching), call it out **before** implementing.

## 9. Docker & Deploy Rules

- `docker compose up` from the repo root must build and run everything — no manual migrations, no seed step required for registration to work.
- Healthchecks on `postgres` and `redis`; `api` depends on them with `condition: service_healthy`.
- Persistent volumes: `pgdata`, `redisdata`, `chatfiles`.
- Do **not** mount source code in the production compose file. Use a separate `docker-compose.dev.yml` override if hot-reload is wanted.

## 10. Testing

**E2E Tests (Playwright)**
- Location: `tests/e2e/` (auth.spec.ts, rooms.spec.ts, presence.spec.ts, unread.spec.ts)
- Run all: `cd tests/e2e && npx playwright test`
- Run single: `npx playwright test rooms.spec.ts`
- Headed mode: `npx playwright test --headed` (see browser)
- Debug mode: `npx playwright test auth.spec.ts --debug`
- MCP server: `.mcp.json` exposes tools (run_all_tests, run_specific_test, get_test_results, debug_test)
- Docker auto-starts on port 8080; setup runs test user auth before other tests
- Report: `playwright-report/index.html`

## 11. Out of Scope

Do not speculate these into the codebase:
- Email verification flow
- Threaded messages (replies are quoted references, not threads)
- Reactions, typing indicators, read receipts
- End-to-end encryption
- Web push / mobile push notifications
- Mobile apps
- XMPP federation — explicit **stretch goal**, do not begin until the core spec is fully working.

## 12. XMPP/Jabber Stretch (deferred)

Only after all of §1–§11 are green:
- Add `ejabberd` sidecar container; bridge via a server-side XMPP client library.
- Expose admin pages: connection dashboard and federation traffic statistics.
- Include a federation load test harness (50+ clients per server, A↔B messaging).

## 13. Known deviations from task.pdf

- **§2.7.1 Unread indicators are client-only.** `useUnread` Zustand store in the SPA bumps/clears counts from SignalR events; nothing is persisted server-side, so counts reset on page reload. Making them survive reload needs an `UnreadMarker(userId, chatKind, chatId, lastReadMessageId)` table plus `GET /api/unread` and `POST /api/chats/{kind}/{id}/read`. Deferred by owner — acknowledged, not blocking.
- **Refresh-token rotation is not implemented.** `AuthEndpoints` refresh path issues a new JWT pair but does not invalidate the predecessor refresh-token hash; old refresh tokens remain usable until natural expiry. Wording in §5 was softened to match.
- **`api` container has no healthcheck.** `web` waits only on `depends_on: api` (not `service_healthy`), so nginx can 502 briefly during cold boot before the API is ready to serve.
- **Five `[Fact(Skip=...)]` tests in `api.Tests/`** cover important behaviors but are not currently asserted: account-deletion cascade (`AuthTests`), download-after-room-ban 403 (`AttachmentTests`), private-room omission from public catalog (`RoomCrudTests`), cross-user session revoke forbidden (`SessionTests`), edit-another-users-message forbidden (`RoomMessageTests`).
- **Playwright `presence.spec.ts` and `unread.spec.ts`** are placeholders/TODOs; `rooms.spec.ts` has no private-visibility case.
- **Installed-but-unused packages.** `FluentValidation` and `Mapster` are in `api/HackerManChat.Api.csproj` but have zero code references; `@tanstack/react-query` is in `web/package.json` but unused. Safe to drop on the next cleanup pass.
