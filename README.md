# walletpilot-backend-learning

Backend upskilling project based on the WalletPilot: AI Investment Copilot assignment — going deep on NestJS architecture, wallet auth, background jobs, AI integration, and testing.

This is **one app that grows step by step**, not separate demo folders per topic. Each topic in `backend_learning_plan.md` builds directly on top of the code from the previous one, inside `src/`.

## Setup

```bash
npm install
npm run start:dev
```

Server runs on `http://localhost:3000`.

## Roadmap

Full plan: [`backend_learning_plan.md`](./backend_learning_plan.md). Matching GitHub issues: [`github_issues.md`](./github_issues.md).

1. ✅ NestJS Architecture & Modules — [Issue #1](https://github.com/Wotusay/walletpilot-backend-learning/issues/1)
2. ✅ Auth & JWT (Wallet Sign-In) — [Issue #2](https://github.com/Wotusay/walletpilot-backend-learning/issues/2)
3. Background Jobs & Redis Caching — [Issue #3](https://github.com/Wotusay/walletpilot-backend-learning/issues/3) ← **you are here**
4. AI Service Integration — [Issue #4](https://github.com/Wotusay/walletpilot-backend-learning/issues/4)
5. Testing & Documentation — [Issue #5](https://github.com/Wotusay/walletpilot-backend-learning/issues/5)

## Current step: Topic 3 — Background Jobs & Redis Caching

### What's already here

- Topics 1 & 2 fully wired: real DI between `Wallet`/`Portfolio`, and a working wallet-signature auth flow (`/auth/nonce`, `/auth/verify`, `JwtGuard`, plus a real Phantom test page at `public/index.html`).
- `WalletService.getBalance()` still returns `Math.floor(Math.random() * 1000)` — a fake balance.
- `MarketDataService.getPrice()` still returns a hardcoded `{ symbol, price: 100 }`.
- Nothing is scheduled, cached, or persisted yet. That's this topic — and per a re-check against the original assignment PDF, it now also covers the "Portfolio Retrieval" and "Market Data Integration" sections that weren't assigned to any topic before.

Try it once it's running:
```bash
curl http://localhost:3000/wallet/abc123/balance
curl http://localhost:3000/market-data/price/SOL
```

### How real data + caching + persistence fit together (read this first)

Right now every call to `getBalance()` or `getPrice()` is instant because it's fake. A real version calls a Solana RPC endpoint or a price API — both of which are rate-limited, sometimes slow, and in the RPC's case sometimes literally billed per call. You can't just call them on every single request. Three different mechanisms solve three different parts of that problem, and it's worth being clear on why you need all three rather than just one:

1. **The real call itself** (Assignments 1–4 below): actually fetching the data from Solana / a price API. This is the ground truth, but it's the slow, rate-limited, occasionally-expensive path — you want to hit it as rarely as possible.
2. **Redis cache (cache-aside pattern):** before calling the real API, check Redis. If the value's there and not expired (TTL), return it — no external call at all. If it's missing or expired, call the real API, store the result in Redis with a TTL, then return it. This is what makes repeated requests for the same wallet/token cheap.
3. **Scheduled background job (`@nestjs/schedule`):** instead of only refreshing data reactively (when a user happens to ask), a cron job proactively refreshes the cache every N minutes. This means users usually hit a *warm* cache instead of being the unlucky first request after expiry that has to wait on the real API call.
4. **PostgreSQL (durable, not a cache):** Redis is fast but disposable — once a value expires or Redis restarts, the old value is just gone, there's no history. A `portfolio_snapshots` table is different: every time the scheduled job runs, it writes a *new row*, so you build up a real history over time. That's what would power a "portfolio value over time" chart, and it's what Topic 4's AI service will eventually want for spotting trends — a cache literally cannot give you that, by design (it only ever holds "now").

In short: **cache = fast answer to "what is it right now," DB = durable answer to "what was it at each point in time."** Different jobs, different tools, both real requirements from the original brief.

### Assignments

Do these in order. Don't move to Topic 4 until you can explain the "Done when" for each.

**1. Install what you need.**
```bash
npm install @solana/web3.js @nestjs/schedule @nestjs/cache-manager cache-manager @keyv/redis @nestjs/typeorm typeorm pg
```
Done when: `npm run start:dev` still boots cleanly with these installed but unused.

**2. Fetch a real SOL balance.**
In `WalletService`, replace the hardcoded random balance: open a `Connection` (devnet, or a public mainnet-beta RPC) and call `connection.getBalance(new PublicKey(address))`. Note the result is in **lamports** — divide by `LAMPORTS_PER_SOL` to get SOL.
Done when: calling it with a real devnet address (e.g. one you airdrop devnet SOL to) returns the actual balance, and an invalid address throws a clear error instead of crashing.

**3. Fetch real SPL token balances and transaction history.**
Still in `WalletService`: use `connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID })` to list SPL token holdings (`{ mint, amount, decimals }`), and `connection.getSignaturesForAddress(publicKey, { limit: 10 })` for recent transaction signatures.
Done when: a wallet holding at least one SPL token (e.g. a devnet USDC-like test token) shows up in the token list, and the signatures list is non-empty for an address with any transaction history.

**4. Fetch a real market price.**
In `MarketDataService`, replace the hardcoded `{ symbol, price: 100 }` with a real call to a public price API (Jupiter Price API or CoinGecko both work without an API key for basic use).
Done when: `curl .../market-data/price/SOL` returns a price that actually moves over time, not a constant.

**5. Add the scheduled refresh job.**
Import `ScheduleModule.forRoot()` in `AppModule`. Add a method decorated with `@Cron(CronExpression.EVERY_MINUTE)` (or `@Interval(60000)`) somewhere sensible (e.g. a new `RefreshService`) that calls your real `getBalance`/`getPrice` methods for a fixed test address, just to prove the schedule fires.
Done when: your logs show the job actually running on its own, without you calling any endpoint.

**6. Wire in Redis caching (cache-aside).**
Register `CacheModule.registerAsync(...)` with the Redis `@keyv/redis` store. In `WalletService`/`MarketDataService`, check the cache first; on a miss, call the real source, then `cache.set(key, value, ttl)`.
Done when: you can see (via logs) a cache **miss** on the first call for an address/symbol and a cache **hit** on the second call within the TTL window — and you can explain why the *scheduled job* from step 5 makes cold-cache misses rarer in practice.

**7. Persist portfolio snapshots to PostgreSQL.**
Add `TypeOrmModule.forRoot(...)` (or `forRootAsync` with `ConfigService`, matching how you already did `JwtModule`). Define a `PortfolioSnapshot` entity: `id`, `address`, `totalValue`, `holdings` (jsonb), `createdAt`. Have the scheduled job from step 5 save one row each time it runs.
Done when: after the job has run at least twice, a `SELECT * FROM portfolio_snapshot` shows more than one row for the same address, each with a different `createdAt`.

**8. Add Redis and Postgres to Docker Compose.**
Write (or extend) a `docker-compose.yml` with `redis` and `postgres` services, matching the connection details your app expects via env vars.
Done when: `docker compose up` gives you a working Redis + Postgres your app can connect to, without installing either locally.

**9. Explain it in your own words.**
Add your notes below and answer: if the scheduled job already refreshes the cache every minute, why do you still need the cache-aside check-first logic in the service at all — what breaks if you remove it and only rely on the schedule?
Done when: you've written that paragraph without looking it up.

## Notes

_(fill this in once you've done the assignments — same as Topics 1 & 2)_

### Documentation

- [NestJS — Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)
- [NestJS — Caching](https://docs.nestjs.com/techniques/caching)
- [NestJS — SQL (TypeORM) recipe](https://docs.nestjs.com/recipes/sql-typeorm)
- [Redis — EXPIRE / TTL](https://redis.io/docs/latest/commands/expire/)
- [Solana Cookbook — How to Get Account Balance](https://solana.com/developers/cookbook/accounts/get-account-balance)
- [Solana Cookbook — How to Get All Token Accounts by Authority](https://solana.com/developers/cookbook/tokens/get-all-token-accounts)
- [Solana Docs — getSignaturesForAddress](https://solana.com/docs/rpc/http/getsignaturesforaddress)

### Video resources (watch in this order)

1. [Nest.js Caching Tutorial in 15 Minutes (Redis + Unit Testing)](https://www.youtube.com/watch?v=KXnkhWRCj40) — closest to Assignment 6.
2. [NestJS + PostgreSQL + TypeORM](https://www.youtube.com/watch?v=2HfGdpr4PPg) — closest to Assignment 7.

There isn't a strong dedicated video for `@nestjs/schedule` cron jobs or for the Solana `web3.js` balance/token calls specifically — both are simple enough that the official docs (linked above) and the QuickNode/Solana Cookbook guides cover it better than the video content that's out there. Worth reading those directly for Assignments 2, 3, and 5 rather than hunting for a mediocre video.

### Next

Once all nine assignments are done, move this section into "Completed topics" below, and update "Current step" to Topic 4 — Asset Normalization (added) + AI Service Integration.

## Completed topics

### Topic 2 — Auth & JWT (Wallet Sign-In) ✅

[Issue #2](https://github.com/Wotusay/walletpilot-backend-learning/issues/2) · nonce-based challenge/response, Ed25519 signature verification with `tweetnacl`/`bs58`, JWT issuing via `@nestjs/jwt`, a `JwtStrategy`/`JwtGuard` protecting `GET /auth/me`, and a real Phantom wallet test page (`public/index.html`) closing the loop end-to-end — not just a scripted keypair.

**Notes:**

What actually stops someone from replaying an *old* signature against `/auth/verify` is the nonce. Each time a user wants to log in, the server generates a new, unique nonce and sends it to the client. The client must sign this specific nonce with their private key. When the server receives the signed message, it checks if the nonce matches the one it generated for that public key. If someone tries to replay an old signature, the nonce will not match because it has already been used and removed from the server's memory. This ensures that each login attempt requires a fresh signature, preventing replay attacks.

What was hard for me was using the `nacl` library to verify the signature. I had to make sure that I was encoding the message correctly and decoding the public key and signature from base58. It took some trial and error to get it right, but once I understood how to use the library, it became much easier.

A new term i learned was the using strategy pattern in nestjs. The strategy pattern is a behavioral design pattern that allows you to define a family of algorithms, encapsulate each one, and make them interchangeable. In the context of nestjs, the strategy pattern is used to implement authentication strategies. Each strategy defines how to authenticate a user, and you can switch between different strategies without changing the code that uses them. This makes it easy to add new authentication methods or change existing ones without affecting the rest of the application.

Other things where familiar to me because i have used angular before. The decorators and dependency injection are very similar to angular. The main difference is that nestjs is a backend framework, while angular is a frontend framework. But the concepts are very similar.

Documentation and videos used: [NestJS — Authentication](https://docs.nestjs.com/security/authentication), [Passport recipe](https://docs.nestjs.com/recipes/passport), [Phantom — Sign In With Solana](https://phantom.com/learn/developers/sign-in-with-solana), [Signing a Message](https://docs.phantom.com/solana/signing-a-message), [Detecting the Provider](https://docs.phantom.com/solana/detecting-the-provider), [Establishing a Connection](https://docs.phantom.com/solana/establishing-a-connection), [Solana Cookbook — Sign & Verify a Message](https://solana.com/developers/cookbook/wallets/sign-message); [What Is JWT and Why Should You Use JWT](https://www.youtube.com/watch?v=7Q17ubqLfaM), [NestJS JWT Authentication Tutorial](https://www.youtube.com/watch?v=EFDUvzJT_wI).

### Topic 1 — NestJS Architecture & Modules ✅

[Issue #1](https://github.com/Wotusay/walletpilot-backend-learning/issues/1) · modules, controllers/services, and dependency injection between `WalletModule` and `PortfolioModule`.

**Notes:**

When creating new api calls from in nestjs. It feels allot like creating new modules in like it is in angular. You create a new controller and service and then you wire them together in the module. The controller is responsible for handling the request and the service is responsible for the business logic. The service can be injected into the controller using dependency injection. This allows for better separation of concerns and makes it easier to test the code.

So i already had a basic understanding of how to creating new api calls. The new things are the properties of the decorators. The @Get decorator is used to define a route for a GET request. The @Param decorator is used to extract parameters from the route. But the @Injectable decorator also exists in the angular framework. So thats not new to me.

The youtube videos are very helpful in understanding the concepts of nestjs. The first video is a crash course that gives a quick orientation to the CLI and project structure. The second video is a comprehensive step-by-step tutorial that covers modules, controllers, and services together. The third video is about dependency injection and is very helpful in understanding how to use it in nestjs.

Documentation and videos used: [NestJS — First Steps](https://docs.nestjs.com/first-steps), [Controllers](https://docs.nestjs.com/controllers), [Providers](https://docs.nestjs.com/providers), [Modules](https://docs.nestjs.com/modules), [Dependency Injection](https://docs.nestjs.com/fundamentals/custom-providers); [Nest.js Crash Course #1](https://www.youtube.com/watch?v=pcX97ZrTE6M), [Nest.js Crash Course — Comprehensive Tutorial](https://www.youtube.com/watch?v=Hv70fn8xTL4), [NestJS Full Course #4 — Dependency Injection](https://www.youtube.com/watch?v=JLHnJoWLjXI).
