```
██╗  ██╗ █████╗  ██████╗██╗  ██╗███████╗██████╗     ███╗   ███╗ █████╗ ███╗   ██╗
██║  ██║██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗    ████╗ ████║██╔══██╗████╗  ██║
███████║███████║██║     █████╔╝ █████╗  ██████╔╝    ██╔████╔██║███████║██╔██╗ ██║
██╔══██║██╔══██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗    ██║╚██╔╝██║██╔══██║██║╚██╗██║
██║  ██║██║  ██║╚██████╗██║  ██╗███████╗██║  ██║    ██║ ╚═╝ ██║██║  ██║██║ ╚████║
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝    ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝
```

> *"In the neon-drenched sprawl of the net, every message is a ghost in the machine."*

---

## ▓▓ SYSTEM OVERVIEW ░░

**HACKER_MAN** is a real-time chat platform built for the **DataArt Shepherd Hackathon 2026** — designed to handle the chaos of 300 concurrent operatives across public channels, encrypted private rooms, and direct one-to-one transmissions. The interface draws from the aesthetic of late-night terminal sessions and CRT monitors still glowing in the dark.

No fluff. No bloat. Just signal.

---

## ▓▓ FEATURE MATRIX ░░

| Module | Status |
|---|---|
| User authentication (JWT + refresh tokens) | ✅ ONLINE |
| Public & private rooms | ✅ ONLINE |
| Direct messages (friends only) | ✅ ONLINE |
| Real-time presence (online / afk / offline) | ✅ ONLINE |
| File & image attachments | ✅ ONLINE |
| Message history with pagination | ✅ ONLINE |
| Session management (multi-device) | ✅ ONLINE |
| Contact / friend system | ✅ ONLINE |
| User-to-user bans | ✅ ONLINE |
| Room moderation (kick / ban / admin) | ✅ ONLINE |
| Unread message indicators | ✅ ONLINE |
| CRT terminal UI with accent themes | ✅ ONLINE |

---

## ▓▓ TECH STACK ░░

```
┌─────────────────────────────────────────────────────────────┐
│  SERVER                        CLIENT                        │
│  ──────────────────────        ──────────────────────────    │
│  .NET 9 / ASP.NET Core         React 18 + TypeScript         │
│  SignalR (WebSockets)          Vite + Tailwind CSS           │
│  EF Core 9 + PostgreSQL 16     Zustand (state)               │
│  Redis 7 (backplane)           @microsoft/signalr            │
│  ASP.NET Core Identity         BroadcastChannel API          │
│  JWT access + refresh tokens   Space Grotesk / JetBrains     │
└─────────────────────────────────────────────────────────────┘
```

---

## ▓▓ BOOT SEQUENCE ░░

One command. Everything spins up. No manual steps.

```bash
docker compose up
```

```
[  OK  ] postgres .......... healthy
[  OK  ] redis ............. healthy
[  OK  ] api ............... running migrations → serving
[  OK  ] web ............... nginx proxying /api + /hubs
[  OK  ] mailhog ........... catching dev emails on :8025
──────────────────────────────────────────────────────
ACCESS TERMINAL →  http://localhost:8080
```

---

## ▓▓ ARCHITECTURE ░░

```
  Browser Tab A ──┐
                  ├── BroadcastChannel leader election
  Browser Tab B ──┘        │
                            ▼
                    Single SignalR conn
                            │
              ┌─────────────┴─────────────┐
              │                           │
          ChatHub                   PresenceHub
      (rooms + DMs)            (heartbeats → Redis)
              │                           │
         PostgreSQL               Redis backplane
        (messages,              (presence state,
        history,                 SignalR scale-out)
        relations)
```

- **One SignalR connection per browser** — tabs elect a leader via `BroadcastChannel`, followers subscribe locally.
- **Keyset pagination** on message history — stays fast on 10 000-message rooms.
- **Every file download** re-verifies current membership server-side. The upload volume is never statically exposed.

---

## ▓▓ PERFORMANCE TARGETS ░░

```
  Message delivery    p95 ≤ 3 s end-to-end
  Presence update     p95 ≤ 2 s
  Concurrent users    300 target
  Room capacity       1 000 members
```

---

## ▓▓ E2E TESTS ░░

```bash
cd tests/e2e

npx playwright test              # run all
npx playwright test rooms.spec   # single suite
npx playwright test --headed     # watch mode
npx playwright test --debug      # step debugger
```

Report → `playwright-report/index.html`

---

## ▓▓ PROJECT STRUCTURE ░░

```
HackerManChat/
├── api/                  .NET 9 backend
│   ├── Auth/             JWT auth endpoints
│   ├── Hubs/             SignalR ChatHub + PresenceHub
│   ├── Rooms/            Room CRUD + moderation
│   ├── Messages/         Message history + attachments
│   └── Migrations/       EF Core migration pipeline
├── web/                  React + Vite SPA
│   └── src/
│       ├── views/        Auth.tsx · ChatApp.tsx
│       ├── store/        Zustand slices
│       └── lib/          API client · SignalR hubs
├── tests/e2e/            Playwright test suites
└── docker-compose.yml    Single-command boot
```

---

## ▓▓ OPERATIVES ░░

Built in the dark, shipped at dawn — **DataArt Shepherd Hackathon 2026**.

---

*// END OF LINE*
