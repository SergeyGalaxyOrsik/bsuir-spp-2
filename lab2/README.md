# Prompt Library

A library of AI prompts: Next.js SPA + Fastify/oRPC REST API + PostgreSQL, run with Docker.

## Run

    cp .env.example .env
    docker compose up --build

- App: http://localhost:3000
- API: http://localhost:3001 (all routes under `/api`, also proxied at `http://localhost:3000/api`)
- Mail catcher (password reset emails): http://localhost:8025
- Seeded admin: credentials from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`

Host ports can be changed with `WEB_PORT`, `API_PORT`, `DB_PORT` and `MAILPIT_PORT` in `.env`. When `WEB_PORT` changes, set `WEB_URL` to match: password reset links are built from it.

## Develop

    bun install
    docker compose up -d db mailpit
    bun run dev

## Checks

    bun run lint
    bun run typecheck
    bun run test
    bun run build

Tests need PostgreSQL on `localhost:5432` (`docker compose up -d db`); the test database `prompts_test` is created automatically.

## Roles

| role | can |
|---|---|
| user | read all prompts, create prompts, edit and delete own prompts |
| moderator | everything a user can, plus edit and delete any prompt |
| admin | everything a moderator can, plus manage users, roles, blocking and sessions |

## Security

- Access token: JWT, 15 minutes. Refresh token: opaque, 7 days, httpOnly cookie, rotated on every use with reuse detection.
- 5 failed logins lock the account for 15 minutes; auth endpoints are rate limited per IP.
- Up to 5 active sessions per user; users see and terminate their own, admins anyone's.
- Password reset by one-time emailed link (30 minutes).
