# Backend Learning Plan — WalletPilot Assignment

Goal: use the WalletPilot assignment as a vehicle to evaluate backend dev / full-stack path. Not building the whole app — going deep on five chosen topics, each with a small hands-on build tied to the assignment.

Order: architecture first (you need the skeleton before anything else fits into it), then auth, then jobs/caching, then AI integration, then testing/docs last (applied to what you've already built).

## 1. NestJS Architecture & Modules

**Concepts:** modules, controllers vs. services, dependency injection, providers, decorators, request lifecycle.

**Build:** scaffold the WalletPilot skeleton — `Auth`, `Wallet`, `Portfolio`, `MarketData`, `AI`, `Alerts` modules, each with a thin controller and an empty service. Wire dependency injection between two of them (e.g. `Portfolio` calling `Wallet`).

**Resources:**
- NestJS docs: First Steps → Controllers → Providers → Modules (docs.nestjs.com)
- NestJS docs: Custom providers (for later external-API isolation)

**Done when:** you can explain, in your own words, why controllers stay thin and why DI matters here (vs. just `new`-ing a service).

## 2. Auth & JWT (Wallet Sign-In)

**Concepts:** challenge/nonce-based auth, signature verification (Solana/Phantom), Passport strategies, JWT issuing & guards, protecting routes.

**Build:** `POST /auth/nonce` (generate + store a nonce per wallet address), `POST /auth/verify` (verify the signed nonce, issue JWT), a `JwtAuthGuard` protecting one dummy route.

**Resources:**
- NestJS docs: Authentication (Passport + JWT)
- `@solana/web3.js` `nacl.sign.detached.verify` for signature verification
- Phantom docs: Sign-In with Solana (SIWS) / signMessage

**Done when:** you can hit `/auth/nonce`, sign it with a test keypair, verify it, and get back a working JWT that a guard accepts.

**Expanded (added):** the keypair test proves the crypto works, not that the flow works with a real wallet. Added assignment: build a minimal static test page that connects to the actual Phantom browser extension (`window.phantom.solana.connect()`), signs the nonce for real (`provider.signMessage()`), and completes the whole `nonce → sign → verify → JWT` loop end-to-end. See [Issue #2](https://github.com/Wotusay/walletpilot-backend-learning/issues/2) and the README for the full walkthrough.

## 3. Background Jobs & Redis Caching

**Concepts:** `@nestjs/schedule` cron jobs, `@nestjs/cache-manager` + Redis, cache-aside pattern, avoiding redundant external calls.

**Build:** a scheduled job that "refreshes" a mock wallet balance every N minutes, cached in Redis with a TTL; a service method that checks cache before hitting the (mock) external API.

**Resources:**
- NestJS docs: Task Scheduling, Caching
- Redis docs: TTL / EXPIRE basics
- Docker Compose: add a `redis` service

**Done when:** you can show a cache hit vs. miss in logs, and explain why background refresh + caching matters for rate-limited blockchain/price APIs.

**Expanded (added, re-checked against the original assignment brief):** the original PDF's "Portfolio Retrieval" (real SOL/SPL balances, token metadata, tx history) and "Market Data Integration" (live prices) sections weren't covered by any of the five topics — the wallet/market-data services were still mock stubs. Added to this topic, before the caching work: real balance retrieval via `@solana/web3.js` (`connection.getBalance`, `getParsedTokenAccountsByOwner`, `getSignaturesForAddress`), a real price API call in `MarketDataService`, and PostgreSQL persistence of portfolio snapshots (also a named technical requirement in the brief that wasn't assigned anywhere) — plus a `postgres` service in Docker Compose alongside `redis`. See [Issue #3](https://github.com/Wotusay/walletpilot-backend-learning/issues/3).

## 4. AI Service Integration

**Concepts:** isolating an external AI provider behind a service, prompting for structured JSON output, schema validation of LLM responses, keeping the AI boundary (data in, JSON out — no direct API access for the AI).

**Build:** `AIService` that takes a small hardcoded portfolio object, sends it to Claude/OpenAI with a prompt requesting the exact JSON shape from the assignment (health score, risk level, diversification, observations), and validates the response with a DTO/schema (e.g. `class-validator` or `zod`).

**Resources:**
- Anthropic docs: Claude API, structured outputs / tool use for reliable JSON
- `zod` or `class-validator` for response validation

**Done when:** the service reliably returns valid, schema-conformant JSON (handle and retry on malformed output).

**Expanded (added, re-checked against the original assignment brief):** the brief's "Asset Normalization" section (classify assets as Crypto/Stablecoin/Tokenized Equity/NFT, unify into one portfolio model) wasn't covered anywhere either, and the AI step needs that normalized data as real input instead of a hardcoded object. Added as a prerequisite: an `AssetType` classifier, a shared `PortfolioAsset` shape, and portfolio-level metrics (total USD value, allocation %) computed from the real prices in Topic 3. See [Issue #4](https://github.com/Wotusay/walletpilot-backend-learning/issues/4).

## 5. Testing & Documentation

**Concepts:** unit tests with Jest (mocking providers/DI), OpenAPI spec generation, API reference docs via Scalar, structured logging, consistent error handling (exception filters).

**Build:** unit tests for the `AuthService` (nonce/verify logic) and `AIService` (mocked provider); an OpenAPI spec generated with `@nestjs/swagger`'s `DocumentBuilder`, rendered as an API reference for the `/auth` routes using `@scalar/nestjs-api-reference` (instead of the default Swagger UI); a global exception filter with structured log output.

**Resources:**
- NestJS docs: Testing, Exception Filters, Logger
- NestJS docs: OpenAPI introduction (spec generation only, via `@nestjs/swagger`)
- Scalar docs: NestJS integration (`@scalar/nestjs-api-reference`)

**Done when:** `npm run test` passes for both services, and `/reference` (Scalar API reference) shows the documented auth endpoints, generated from the OpenAPI spec.

**Expanded (added):** a `docker-compose.yml` bringing up the app, Redis, and PostgreSQL together, plus a `GET /health` route (or `@nestjs/terminus`) confirming all three are up — the "run this whole real app with one command" check. See [Issue #5](https://github.com/Wotusay/walletpilot-backend-learning/issues/5).

---

## Suggested pacing

Treat each topic as its own session — don't block on perfection before moving on. If a topic clicks and you want to go deeper (e.g. multi-wallet support, WebSockets), that's a sign to extend that phase rather than rush to the next.

## Tracking

Each topic is tracked as a GitHub issue in this repo, with its own checklist and "done when" criterion.
