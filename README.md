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
3. ✅ Background Jobs & Redis Caching — [Issue #3](https://github.com/Wotusay/walletpilot-backend-learning/issues/3)
4. ✅ AI Service Integration — [Issue #4](https://github.com/Wotusay/walletpilot-backend-learning/issues/4)
5. Testing & Documentation — [Issue #5](https://github.com/Wotusay/walletpilot-backend-learning/issues/5) ← **you are here**

## Current step: Topic 5 — Testing & Documentation

### What's already here

- Topics 1–4 fully wired: real auth, real portfolio data, caching/scheduling/persistence, asset normalization, and `AiService` calling Claude with a strict tool-use schema, validated with `zod`.
- One real test already exists — `src/normalization/normalization.service.spec.ts` — a `NormalizationService` unit test using `Test.createTestingModule` with `WalletService`/`MarketDataService` mocked via provider overrides. That's the exact pattern to reuse for `AuthService` and `AiService` below.
- No OpenAPI spec, no Scalar reference, no global exception filter, and no `docker-compose.yml` app service or health check yet. That's this topic — and per the earlier re-check against the original PDF, it now also covers running the *whole* stack (app + Redis + Postgres) with one command, not just Redis/Postgres.

Try it once it's running:
```bash
npm run test
curl http://localhost:3000/portfolio/abc123/summary
```

### Why testing + docs + a health check close the loop (read this first)

Every other topic added a *capability*. This one adds the *proof* that the capabilities work, and makes them usable by someone who isn't you:

- **Why unit tests matter now specifically.** `WalletService`, `MarketDataService`, and `AiService` all call real external things — Solana RPC, CoinGecko, Claude. A test suite that hits those for real is slow, flaky, sometimes costs money, and breaks in CI with no network. NestJS's DI is exactly what makes this solvable: `Test.createTestingModule({ providers: [...] })` lets you swap the real `JwtService`/Anthropic client for a `jest.fn()` stand-in, same as your normalization spec already does for `WalletService`/`MarketDataService`.
- **Why OpenAPI + Scalar, not just "read the code."** A generated, browsable API reference is the contract of what your backend does, without anyone (a reviewer, a future frontend, your boss) having to open `auth.controller.ts` to find out what `/auth/verify` expects. `@nestjs/swagger`'s `DocumentBuilder` generates the spec from your existing decorators; Scalar just renders it nicer than the default Swagger UI.
- **Why a *global* exception filter, not per-service try/catch.** Right now error handling is ad hoc — `AiService` throws `InternalServerErrorException` directly, other services throw whatever NestJS defaults to. A global filter gives every uncaught error the same shape on the way out (so API consumers can rely on it) and the same structured log on the way in (so *you* can find it later) — one place instead of re-implementing it per service.
- **Why Docker Compose + `/health` is the actual finish line.** `docker-compose.yml` currently only has `redis` and `postgres` — the app itself isn't in it yet, so "clone and run" still requires knowing to run `npm install` and set env vars by hand. Adding the app service (with a `Dockerfile`) plus a `/health` route that actually checks Redis/Postgres connectivity is what turns "trust me it works" into something a stranger can verify by running one command — which is exactly what makes this credible as a portfolio piece.

### Assignments

Do these in order.

**1. Install what you need.**
```bash
npm install @nestjs/swagger @scalar/nestjs-api-reference @nestjs/terminus
```
Done when: `npm run start:dev` still boots cleanly with these installed but unused.

**2. Unit test `AuthService`.**
Following the same pattern as `normalization.service.spec.ts`: mock `JwtService` via a provider override, test `generateNonce` (two calls for the same key return different nonces) and `verifySignature` (a valid signature returns a token, an invalid one throws `UnauthorizedException`, a re-used nonce fails).
Done when: `npm run test` shows these passing without ever hitting a real network call.

**3. Unit test `AiService`.**
Worth noting first: `AiService` currently does `new Anthropic({ apiKey: ... })` inline in a property initializer rather than injecting the client — that makes it hard to substitute a mock. Consider making the `Anthropic` client an injectable provider (e.g. a custom provider token) first, *then* write the test: mock `client.messages.create` to return a canned `tool_use` block, assert `analyze()` returns it, and assert that a response failing `AnalysisSchema` throws instead of silently returning bad data.
Done when: the test exercises both the valid-response and invalid-response paths without calling the real Claude API.

**4. Generate the OpenAPI spec and render it with Scalar.**
Use `DocumentBuilder` + `SwaggerModule.createDocument()` in `main.ts` to build the spec (decorate at least the `/auth` routes with `@ApiTags`/`@ApiOperation` etc.), then pass that document to `apiReference()` from `@scalar/nestjs-api-reference` mounted at `/reference`, instead of `SwaggerModule.setup()`.
Done when: `/reference` in a browser shows the documented auth endpoints, generated from your real decorators.

**5. Add a global exception filter with structured logging.**
Implement an `AllExceptionsFilter` (`@Catch()`) registered via `app.useGlobalFilters(...)` in `main.ts`. It should log a structured object (status, path, message, stack in dev) via NestJS's `Logger`, and return a consistent JSON error shape to the client regardless of which service threw.
Done when: hitting a route that throws (e.g. an invalid Solana address) returns the same error shape as hitting a route that doesn't exist, and both produce one structured log line.

**6. Bring the whole stack up with Docker Compose.**
Add a `Dockerfile` for the NestJS app and an `app` service to `docker-compose.yml` alongside the existing `redis`/`postgres`, wired to the same env vars `ConfigService` already reads.
Done when: `docker compose up` on a clean checkout gets you a working app talking to its own Redis and Postgres, with nothing installed on your machine except Docker.

**7. Add a real health check.**
Register `TerminusModule`, add a `HealthController` with `GET /health` using `HealthCheckService` plus indicators for Redis and the Postgres `TypeOrmHealthIndicator` (or a raw `SELECT 1`).
Done when: `GET /health` returns healthy when the stack is up, and correctly reports unhealthy if you stop the `postgres` container while the app keeps running.

**8. Explain it in your own words.**
Add your notes below and answer: why does mocking `WalletService`/`MarketDataService` (like your normalization test already does) matter more here than it did in earlier topics — what would testing `AiService` against the *real* Claude API cost you that a mock doesn't?
Done when: you've written that paragraph without looking it up.

## Notes

_(fill this in once you've done the assignments — same as Topics 1–4)_

### Documentation

- [NestJS – Testing](https://docs.nestjs.com/fundamentals/testing)
- [NestJS – OpenAPI introduction](https://docs.nestjs.com/openapi/introduction) (spec generation only, via `@nestjs/swagger`)
- [Scalar – NestJS integration](https://scalar.com/products/api-references/integrations/nestjs) (`@scalar/nestjs-api-reference`)
- [NestJS – Exception Filters](https://docs.nestjs.com/exception-filters)
- [NestJS – Logger](https://docs.nestjs.com/techniques/logger)
- [NestJS – Terminus (health checks)](https://docs.nestjs.com/recipes/terminus)

### Video resources (watch in this order)

1. [Unit Testing in Nest.js with Jest #1 — All About Mock, Testing Service Files](https://www.youtube.com/watch?v=aBjmdLmE2zI) — closest to Assignments 2–3, same mocking approach as your existing normalization spec.

No solid dedicated video for Scalar+OpenAPI wiring, global exception filters, or Terminus health checks specifically — all three are short, focused docs pages (linked above) rather than topics with good video coverage; reading them directly is faster than searching for a mediocre video on any of the three.

### Next

Once all eight assignments are done, this is the last topic — update the Roadmap above to mark it ✅ and move this section into "Completed topics."

## Completed topics

### Topic 4 — Asset Normalization + AI Service Integration ✅

[Issue #4](https://github.com/Wotusay/walletpilot-backend-learning/issues/4) · `NormalizationService` classifies SPL mints (known stablecoins vs. everything-else-Crypto) and normalizes SOL + SPL holdings into one `PortfolioAsset` shape with computed allocation metrics; `AiService` calls Claude with a strict, forced tool-use schema (`additionalProperties: false`) and double-checks the response with a `zod` `AnalysisSchema`; `AiController` chains normalize → metrics → analyze behind `POST /ai/analyze/:address`.

**Notes:**

- Bad reasoning — input was correct, but the model drew the wrong conclusion from it. Fault is in the prompt/model/analysis logic.

- Bad input — the model reasoned correctly, but on distorted data (mixed currencies, weights not summing to 100%, wrong ticker mapping). The answer is right given what it was told — but what it was told never matched reality.

The AI can't tell these apart; a wrong number and a right number look identical to it.

Normalization protects you from the second one — it guarantees the input is consistent and comparable (same currency, correct weights, canonical IDs) before the AI sees it. It does nothing for bad reasoning.

Its real value: by removing input quality as a variable, it makes a wrong output diagnosable — you can tell whether the model reasoned badly or was just fed garbage.

Other notes: Still have a feeling that some part of the backend are not coming together. I have to check the code and see if the services are wired correctly. I also need to check if the AIService is actually calling the Claude API and getting a response. If not, I need to debug that part and see if there are any errors or misconfigurations. I also need to check if the zod schema is defined correctly and matches the expected output shape. If not, I need to fix that as well.

Documentation and videos used: [Claude API — Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) (the `output_config.format` approach — the older `output_format` param is deprecated), [Claude API — Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview), [Claude API — Intro](https://platform.claude.com/docs/en/intro), [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript), [Zod](https://zod.dev/) (v4: `import { z } from "zod"`); [Claude API: Strict Response Types/Schemas (for Dummies)](https://www.youtube.com/watch?v=kiooXcT4E0g), [Zod Tutorial: Auto-Generate Schemas & Validate API Responses](https://www.youtube.com/watch?v=siQfpESFOhI).

### Topic 3 — Background Jobs & Redis Caching ✅

[Issue #3](https://github.com/Wotusay/walletpilot-backend-learning/issues/3) · real Solana devnet calls (`getBalance`, `getParsedTokenAccountsByOwner`, `getSignaturesForAddress`), a real CoinGecko price call, both behind `CACHE_MANAGER` with a 45s TTL and hit/miss logging, a `RefreshService` (`@Cron(CronExpression.EVERY_MINUTE)`) writing `PortfolioSnapshot` rows via TypeORM, and `docker-compose.yml` running Redis + Postgres.

**Notes:**

If the scheduled job already refreshes the cache every minute, why do you still need the cache-aside check-first logic in the service at all — what breaks if you remove it and only rely on the schedule?

The scheduled job is an optimization (keeps latency low and data warm), while cache-aside is the correctness guarantee (every request can still get data even on a miss). Remove the check-first logic and you've made request-serving a hard dependency on the scheduler being perfectly reliable and complete — the first request after boot, any evicted or expired key, any un-scheduled key, and any scheduler downtime would all break.

Things i found out when doing this topic:
- The `@nestjs/schedule` module is a wrapper around the `node-cron` library, which allows you to schedule tasks using cron expressions. It provides decorators like `@Cron`, `@Interval`, and `@Timeout` to define scheduled tasks in your services.
- The `@nestjs/cache-manager` module is a wrapper around the `cache-manager` library, which provides a consistent API for caching data in memory or in external stores like Redis. It allows you to easily set up caching in your NestJS application and provides decorators like `@Cacheable` and `@CacheEvict` to manage cache entries.
- You had to run the Redis and PostgreSQL services in Docker Compose to have a working environment for caching and persistence. The `docker-compose.yml` file defines the services, their images, ports, and environment variables needed for the application to connect to them. You could run them locally without installing them directly on your machine, which is convenient for development and testing.
- Some topics where to vaguely described in the assignment PDF, but the official docs and the Solana Cookbook provided clear guidance on how to implement them. For example, the Solana Cookbook has a section on how to get account balances and token accounts by authority, which was helpful for implementing the `WalletService` methods.

Documentation and videos used: [NestJS — Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling), [Caching](https://docs.nestjs.com/techniques/caching), [SQL (TypeORM) recipe](https://docs.nestjs.com/recipes/sql-typeorm), [Redis — EXPIRE / TTL](https://redis.io/docs/latest/commands/expire/), [Solana Cookbook — Get Account Balance](https://solana.com/developers/cookbook/accounts/get-account-balance), [Get All Token Accounts by Authority](https://solana.com/developers/cookbook/tokens/get-all-token-accounts), [getSignaturesForAddress](https://solana.com/docs/rpc/http/getsignaturesforaddress); [Nest.js Caching Tutorial in 15 Minutes](https://www.youtube.com/watch?v=KXnkhWRCj40), [NestJS + PostgreSQL + TypeORM](https://youtu.be/W1gvIw0GNl8).

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
