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
5. ✅ Testing & Documentation — [Issue #5](https://github.com/Wotusay/walletpilot-backend-learning/issues/5)
6. Bonus Features — [Issue #6](https://github.com/Wotusay/walletpilot-backend-learning/issues/6) ← **you are here** (optional — pick 2–3, not all seven)

## Current step: Bonus Features — pick your own depth

### What's already here

- Topics 1–5 are fully done: real auth, real portfolio data, caching/scheduling/persistence, asset normalization, AI analysis, unit tests, `/reference` API docs, a global exception filter, and a real `/health` check.
- This topic is different from the previous five: it's **optional, and not meant to be done in full.** Same philosophy as picking the original 5 topics out of the whole assignment brief — read through the seven options below and pick 2–3 you actually want to go deep on.
- A few things already half-exist and are worth knowing about before you pick:
  - `src/alerts/` (`AlertsModule`/`AlertsService`/`AlertsController`) is a real stub from Topic 1 — `GET /alerts/ping` only. It's the natural place to build option 2 (watchlists & alerts) instead of a new module.
  - `RefreshService` (`@Cron(CronExpression.EVERY_MINUTE)`) already writes a `PortfolioSnapshot` row every minute — that's real historical data sitting unused, and it's the entire prerequisite for option 4 (performance over time).
  - `WalletService.getTransactionsHistory()` only calls `getSignaturesForAddress` — it returns signatures, not what a transaction actually did. Option 3 (AI transaction explanations) needs the fuller `getParsedTransaction` call, not what's there now.
  - `classifyAsset()` in `src/normalization/types/asset-type.ts` only checks a hardcoded stablecoin allowlist — option 7 (scam detection) is a natural extension of that same function, not a separate system.

### The options

Each is independent — you don't need to do them in order, and doing one doesn't require any of the others.

**1. Real-time WebSocket updates.**

*Concepts:* right now the client has to poll `GET /portfolio/:address/summary` to see anything change. A WebSocket gateway lets the server push an update the moment `RefreshService`'s cron job refreshes that wallet's data — the same pattern real trading apps use instead of hammering an endpoint every few seconds.

*Build:* add `@nestjs/websockets` + `@nestjs/platform-socket.io`, a `PortfolioGateway` with `@WebSocketGateway()`, and have `RefreshService` emit an event on that gateway after each snapshot write (scoped to clients subscribed to that address — don't broadcast every wallet's data to everyone).

*Done when:* two browser tabs connected to the same address both see a balance change within a minute of it happening on devnet, with no polling involved.

*Docs:* [NestJS — Gateways](https://docs.nestjs.com/websockets/gateways), [NestJS — Adapter](https://docs.nestjs.com/websockets/adapter)
*Video:* [NestJS Websockets Tutorial #1 — Creating a Websocket Gateway Server](https://www.youtube.com/watch?v=iObzX8-Y5xg)

**2. Wallet watchlists & alerts.**

*Concepts:* turning `AlertsService` from a ping stub into something real — a user watches a set of addresses/mints, defines a threshold (e.g. "alert me if SOL balance drops below X" or "alert me if a new token appears in this wallet"), and something checks that threshold and fires. This is the most "product-shaped" of the seven options.

*Build:* a `Watchlist` entity (owner JWT `sub`, address, rule type, threshold — TypeORM, next to `PortfolioSnapshot`), and hook the check into the existing `RefreshService` cron tick (it already runs every minute and already has the fresh data — don't add a second scheduler). For delivery, a logged/stored alert record is a legitimate "done" — wiring it to email/Discord/etc. is a further stretch, not the baseline.

*Done when:* you can register a watchlist rule via an endpoint, trigger it for real on devnet (e.g. send yourself some SOL to cross a threshold), and see the alert recorded.

*Docs:* [NestJS — Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling) (you already used this in Topic 3), [NestJS — SQL (TypeORM) recipe](https://docs.nestjs.com/recipes/sql-typeorm)
*Video:* none specifically for "alerts" as a concept — it's a combination of things you already used in Topics 3 and 1, so there isn't a single good tutorial that maps onto this exact shape.

**3. AI transaction explanations.**

*Concepts:* `AiService` already explains a portfolio *snapshot*. This is the same idea applied to one transaction — "what actually happened here" in plain English, instead of a raw list of instructions. The hard part isn't the AI call (you've done that in Topic 4), it's getting real instruction data to feed it — `getSignaturesForAddress` only gives you signatures, not contents.

*Build:* `connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })` to get the actual parsed instructions, then a new tool-use schema (same strict + `zod` pattern as `AiService.analyze`) asking Claude to summarize what the transaction did (transfer, swap, token approval, etc.) in 1-2 sentences, grounded only in the parsed instruction data — same "don't invent numbers" system prompt discipline as Topic 4.

*Done when:* given a real devnet transaction signature, the endpoint returns a plain-English explanation that matches what actually happened (verify a couple by hand against a Solana explorer).

*Docs:* [Solana — getTransaction](https://solana.com/docs/rpc/http/gettransaction), [QuickNode — getParsedTransaction](https://www.quicknode.com/docs/solana/getParsedTransaction)
*Video:* none solid for this specific combination — the parsing side and the AI side are each well covered individually (Topic 3's Solana Cookbook links, Topic 4's Claude tool-use video), but nobody's made a video connecting them for this exact use case.

**4. Portfolio performance over time.**

*Concepts:* the lowest-effort, highest-payoff option — `PortfolioSnapshot` rows already exist every minute since Topic 3, unused. This is a real "how did my portfolio do" chart, not a mock.

*Build:* a `GET /portfolio/:address/history` endpoint that queries `PortfolioSnapshot` for a date range, and computes % change between the first and last snapshot in that range (day/week/month). Plain Postgres is genuinely fine at this scale — a specialized time-series DB (TimescaleDB) is only worth mentioning as a "if you had millions of snapshots" stretch, not something to reach for here.

*Done when:* the endpoint returns a real series of `{ timestamp, totalValue }` points from actual stored snapshots, and a computed % change that you've verified by hand against two of the raw rows.

*Docs:* [NestJS — SQL (TypeORM) recipe](https://docs.nestjs.com/recipes/sql-typeorm) (you already used this), [TypeORM — QueryBuilder](https://typeorm.io/select-query-builder) (for the date-range + ordering query)
*Video:* none needed — this is a straight TypeORM query against a table you've already built; if `Topic 3`'s TypeORM video made sense to you, this will too.

**5. Multi-wallet support.**

*Concepts:* right now identity *is* one wallet address — the JWT `sub` is the public key, and every route takes one `:address`. Real portfolio apps track several wallets under one identity. The interesting design question: what's the identity now, if not "the wallet"?

*Build:* the smallest real version is a `WatchedWallet`-style table linking a JWT `sub` (still the wallet you signed in with) to N *additional* addresses, plus an aggregate endpoint (e.g. `GET /portfolio/me/summary`) that runs the existing `NormalizationService`/`computeMetrics` across all linked addresses and merges the result. You don't need multi-wallet *login* — that's a much bigger auth redesign and not the point here.

*Done when:* you can link a second address to your session and get back one combined portfolio view (correct combined USD total, not just two separate summaries concatenated).

*Docs:* [NestJS — SQL (TypeORM) recipe](https://docs.nestjs.com/recipes/sql-typeorm)
*Video:* none specific — this is a data-modeling exercise on top of code you've already written, not new framework surface area.

**6. Multi-chain support.**

*Concepts:* the biggest option on this list. Everything in this app is Solana-shaped (`Connection`, `PublicKey`, lamports). Adding a second chain — realistically an EVM chain (Ethereum/Polygon/etc.) via `ethers.js` or `viem` — means designing a common interface (a "chain adapter") that `WalletService` and `NormalizationService` can call without knowing which chain they're talking to.

*Build:* define a small interface (e.g. `ChainAdapter { getBalance(address), getTokenBalances(address) }`), keep the existing Solana logic as one implementation, add a second EVM implementation (viem's public client `getBalance`/`readContract` for ERC-20s), and have `WalletService` pick the adapter based on address format or an explicit chain param. This is a genuine architecture exercise, not a small addition — go in expecting it to take longer than the others.

*Done when:* the same portfolio endpoint returns real balances for both a Solana devnet address and an EVM testnet address, through the same code path.

*Docs:* [viem — Getting Started](https://viem.sh/docs/getting-started), [ethers.js — Getting Started](https://docs.ethers.org/v6/getting-started/)
*Video:* [Tutorial on using viem — an EVM library better than ethers!](https://www.youtube.com/watch?v=2dPVKiDvjHc)

**7. Scam token detection.**

*Concepts:* `classifyAsset()` currently only checks a hardcoded stablecoin list — everything else is just "Crypto". Real scam/rug-pull detection on Solana checks a small set of on-chain facts about the mint itself: does the creator still hold *mint authority* (can print unlimited supply), does it hold *freeze authority* (can lock your tokens so you can't sell), and is holder concentration dangerously high (one wallet holding a huge share of supply).

*Build:* `getMint()` from `@solana/spl-token` for `mintAuthority`/`freezeAuthority` (non-null = red flag), and `getTokenLargestAccounts()` to compute what % of supply the top holder(s) control. Fold the result into `classifyAsset()` or a parallel `assessRisk(mint)` function — a boolean/enum flag, not a full scoring model.

*Done when:* run against a few real devnet/mainnet mints, the check correctly flags at least one token with active mint or freeze authority, and correctly clears a well-known token (e.g. real USDC) that has neither.

*Docs:* [Solana — Mint Tokens](https://solana.com/docs/tokens/basics/mint-tokens), [Helius — getTokenLargestAccounts guide](https://www.helius.dev/docs/rpc/guides/gettokenlargestaccounts)
*Video:* none solid — this is a narrow, Solana-specific check better learned from the docs above than a general video.

## Notes

_(fill this in once you've picked your options and built them — same as Topics 1–5)_

### Next

This is the last topic in the repo (bonus, optional). Once you've built the options you picked, update the Roadmap above to mark it ✅, list which options you actually did, and move this section into "Completed topics."

## Completed topics

### Topic 5 — Testing & Documentation ✅

[Issue #5](https://github.com/Wotusay/walletpilot-backend-learning/issues/5) · unit tests for `AuthService` (nonce/signature/replay) and `AiService` (valid response, schema-failure, missing tool_use — with `Anthropic` pulled out into an injectable `ANTHROPIC_CLIENT` provider so it can be mocked), OpenAPI spec generated via `DocumentBuilder` and rendered at `/reference` with `@scalar/nestjs-api-reference`, a global `AllExceptionsFilter` giving every uncaught error one consistent JSON shape and one structured log line, and a real `GET /health` via `@nestjs/terminus` (Postgres `TypeOrmHealthIndicator` + a hand-built Redis indicator doing an actual cache round-trip). Docker Compose app service was left as a known gap — `docker-compose.yml` still only has `redis`/`postgres`, no `Dockerfile` or `app` service yet.

**Notes:**

In earlier topics mocking was mostly about speed — skipping a slow RPC or HTTP call. With AiService the dependency is also non-deterministic and not free: every test run against the real Claude API costs money, takes seconds, needs a live network and an API key in CI, and can fail for reasons unrelated to my code (rate limits, transient 5xx). And because the model can return a valid-but-differently-worded response each time, I'd have to weaken my assertions until they check almost nothing. The decisive part is that the real API can't give me the case I care about most: I can't ask Claude to reliably return output that fails AnalysisSchema, but with client.messages.create mocked I just hand it a bad response and assert it throws. The mock turns a probabilistic service into a fixed input, so the test exercises my code — the prompt, the validation, the error mapping — instead of Anthropic's uptime.

Documentation and videos used: [NestJS – Testing](https://docs.nestjs.com/fundamentals/testing), [NestJS – OpenAPI introduction](https://docs.nestjs.com/openapi/introduction), [Scalar – NestJS integration](https://scalar.com/products/api-references/integrations/nestjs), [NestJS – Exception Filters](https://docs.nestjs.com/exception-filters), [NestJS – Logger](https://docs.nestjs.com/techniques/logger), [NestJS – Terminus (health checks)](https://docs.nestjs.com/recipes/terminus); [Unit Testing in Nest.js with Jest #1 — All About Mock, Testing Service Files](https://www.youtube.com/watch?v=aBjmdLmE2zI).

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