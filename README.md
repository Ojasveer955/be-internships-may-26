# Signals Challenge (Node.js + Fastify)

Build a minimal production-leaning service that can **handle load**, **rate limit**, and **avoid duplicates** via idempotency.

## Setup
```bash
npm install
cp .env.example .env   # adjust API_KEY if needed
npm run dev             # starts on :8080
npm test                # runs all tests
```

## Endpoints (to keep)
- `POST /v1/signals`
  - body: `{ "userId": "string", "type": "string", "payload": "string" }`
  - headers: `X-API-Key`, `Idempotency-Key` (optional)
  - behaviors:
    - **Rate limit** per `userId`: `RATE_LIMIT_PER_MIN` per minute (default 5).
    - **Idempotency**: same `Idempotency-Key` should not create duplicates.
- `GET /v1/signals?userId=...&limit=...`
- `GET /healthz`

## Implementation Notes

### Rate Limiting (`src/rateLimit.js`)
Token bucket algorithm — each user gets `RATE_LIMIT_PER_MIN` tokens that refill continuously over a 60s window. Unlike a fixed-window counter, this handles bursts smoothly and doesn't allow double the rate at window boundaries.

**Multi-instance safety:** Within a single Node.js process, the synchronous `checkAndConsume` call is inherently race-free (no async gaps between check and decrement). For multiple instances behind a load balancer, the in-memory map would need to be replaced with a shared store like Redis using an atomic Lua script. See `SCALE.md` for the full approach.

### Idempotency (`src/signals.js`)
Uses an insert-first strategy relying on the `UNIQUE` constraint on `idempotency_key` in SQLite. If a duplicate key is inserted, the DB throws `SQLITE_CONSTRAINT_UNIQUE` and we fetch the existing record. This avoids the check-then-insert race that occurs under concurrent requests.

### DB Failure Handling (`src/signals.js`)
All DB calls go through a `withRetry` wrapper that catches `SQLITE_BUSY` errors and retries with exponential backoff + random jitter (up to 3 retries). This prevents thundering herd retries and handles transient failures from `DB_FAIL_RATE`.

### App Architecture (`src/server.js`)
The server exports a `buildApp()` factory for programmatic testing via `app.inject()`. It only auto-listens when run directly (`node src/server.js`).

## Your Tasks
1. **Implement a robust rate limiter** in `src/rateLimit.js`.
2. **Make idempotency safe across scale** in `src/signals.js`.
3. **Handle DB failure** gracefully with retry/backoff.
4. **Think for 10k RPS.** Add a `SCALE.md`.
5. **Finish the tests** in `tests/*.test.js`.

## Deliverables
- Working service, passing tests, updated README, SCALE.md.
- Optional deploy link.
---

## Extra Production Constraints (must pass)

- **Atomic Idempotency:** Survive concurrent requests and restarts. Avoid check-then-insert races; use a DB-level unique constraint or atomic upsert pattern. Return the same resource for identical `Idempotency-Key`.
- **Concurrency-Safe Rate Limit:** Must behave correctly under burst and parallel calls. Naive in-memory counters that race will fail hidden checks. Explain how this becomes multi-instance safe.
- **Transient DB Failures:** Implement retry/backoff (with jitter) or circuit breaker when DB errors occur (we simulate via `DB_FAIL_RATE`). No duplicates on retry.
- **Scale Plan (10k RPS):** Fill `SCALE.md` with a clear, concise approach (indexes, pooling, caching, queues, horizontal scale, idempotency store).

> We will run additional **hidden concurrency/multi-instance tests** during evaluation.
