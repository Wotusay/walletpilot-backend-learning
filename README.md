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
4. AI Service Integration — [Issue #4](https://github.com/Wotusay/walletpilot-backend-learning/issues/4) ← **you are here**
5. Testing & Documentation — [Issue #5](https://github.com/Wotusay/walletpilot-backend-learning/issues/5)

## Current step: Topic 4 — Asset Normalization + AI Service Integration

### What's already here

- Topics 1–3 fully wired: real DI, a working wallet-signature auth flow, and real portfolio data — `WalletService` hits Solana devnet for balance/tokens/tx history, `MarketDataService` hits CoinGecko for prices, both cached via `CACHE_MANAGER` with a TTL, refreshed on a schedule by `RefreshService`, and persisted to Postgres as `PortfolioSnapshot` rows.
- `PortfolioService.getSummary()` still returns `holdings: []` — nothing classifies or normalizes what's actually in a wallet yet.
- `AIService`/`AiModule` are still `ping` stubs — no AI call exists yet. That's this topic.

Try it once it's running:
```bash
curl http://localhost:3000/portfolio/abc123/summary
curl http://localhost:3000/ai/ping
```

### Why normalize before calling the AI, and why the AI can't touch the chain itself (read this first)

The original brief is explicit about two things for this part: the AI receives *structured portfolio data* and returns *structured JSON*, and **"the AI must not query blockchain APIs directly."** Both of those are about the same idea — keeping a hard boundary between "fetching/shaping data" and "reasoning about data":

- **Normalization first.** Right now a wallet's holdings are three different shapes: a SOL balance (a number), SPL token accounts (`{ mint, tokenAmount, decimals }`), and eventually tokenized stocks. An LLM prompt is far more reliable when every holding looks the same going in — one `PortfolioAsset` shape (`{ symbol, type, amount, usdValue }`) regardless of where it came from. You already have the real prices (Topic 3) to compute `usdValue` and allocation %.
- **Classification matters for the analysis itself.** "Risk level" and "diversification" are meaningless without knowing *what kind* of asset each holding is — 100% in one memecoin is a very different risk profile than 100% in a stablecoin, even though both are "100% one asset."
- **Why the AI never touches the chain:** if `AIService` could call Solana/CoinGecko itself, you'd lose the guarantee that its output is reproducible and testable (the same normalized input should produce a comparable analysis), you'd be handing an LLM prompt injection surface directly onto live infrastructure, and you couldn't unit-test it without hitting real APIs. Feeding it a plain object keeps the AI a pure function: structured data in, structured JSON out — nothing else.
- **Why the output needs a schema, not just "please return JSON":** LLMs are good at approximately following formatting instructions and bad at *guaranteeing* them — a stray sentence before the JSON, a missing field, a health score returned as a string instead of a number will all break a naive `JSON.parse`. Validating the response against a schema (`zod`) is what turns "usually valid JSON" into "guaranteed-valid JSON or a clear error you can retry on."

### Assignments

Do these in order. Don't move to Topic 5 until you can explain the "Done when" for each.

**1. Install what you need.**
```bash
npm install zod @anthropic-ai/sdk
```
Done when: `npm run start:dev` still boots cleanly with these installed but unused.

**2. Classify assets.**
Define an `AssetType` (`'Crypto' | 'Stablecoin' | 'TokenizedEquity' | 'NFT'`). Write a classifier function: a small lookup table of known stablecoin mint addresses (e.g. devnet/mainnet USDC) → `Stablecoin`, everything else → `Crypto` for now (tokenized equity/NFT can stay unimplemented stubs — the brief marks NFT optional).
Done when: a stablecoin mint classifies as `Stablecoin` and native SOL classifies as `Crypto`.

**3. Normalize into one shape.**
Write a function that takes the raw outputs from `WalletService` (SOL balance, SPL tokens) and `MarketDataService` (prices) and returns `PortfolioAsset[]`: `{ symbol, type, amount, usdValue }` for every holding, using the real prices from Topic 3 to compute `usdValue`.
Done when: calling it for a wallet with SOL + at least one token returns an array where every item has the same shape, regardless of whether it came from the native balance or an SPL account.

**4. Compute portfolio-level metrics.**
From the normalized array: total USD value (sum of `usdValue`), and allocation % per asset and per `AssetType`.
Done when: for a test portfolio, the allocation percentages you compute sum to ~100% (floating point, so "close enough" is fine).

**5. Build `AIService` around the normalized data.**
`AIService.analyze(portfolio: PortfolioAsset[])` builds a prompt describing the normalized portfolio + metrics, and asks Claude for exactly the JSON shape from the brief: executive summary, portfolio health score (0–100), risk level, diversification analysis, observations, potential risks, trading behavior. Use Claude's structured outputs (`output_format`) or tool-use-forced-JSON so the shape is enforced at the API layer, not just prompted for.
Done when: a call with a real normalized portfolio returns a response containing all seven fields.

**6. Validate the response with `zod`.**
Define a `zod` schema matching that exact shape and parse the AI's response through it before returning it from `AIService`. On a parse failure, retry the call once (e.g. with a follow-up message pointing out the schema was violated) before throwing.
Done when: you can simulate a malformed response (temporarily returning bad data) and see the retry/error path actually trigger, not just the happy path.

**7. Explain it in your own words.**
Add your notes below and answer: what's the difference between "the AI decided the risk is high" being wrong because the AI reasoned badly, versus being wrong because the *input data* it received was already wrong — and which one does normalization protect you from?
Done when: you've written that paragraph without looking it up.

## Notes

_(fill this in once you've done the assignments — same as Topics 1–3)_

### Documentation

- [Claude API – Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — the `output_config.format` approach (note: the older `output_format` param is deprecated).
- [Claude API – Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) — closest to Assignment 5's "tool-use-forced-JSON": define a tool with an `input_schema` and set `tool_choice` to force it, so Claude must return exactly that shape.
- [Claude API – Intro](https://platform.claude.com/docs/en/intro)
- [Anthropic TypeScript SDK (`@anthropic-ai/sdk`)](https://github.com/anthropics/anthropic-sdk-typescript) — the client you'll call from `AiService` (Assignment 5).
- [Zod](https://zod.dev/) — schema validation for Assignment 6 (this project uses Zod v4: `import { z } from "zod"`).

### Video resources (watch in this order)

1. [Claude API: Strict Response Types/Schemas (for Dummies)](https://www.youtube.com/watch?v=kiooXcT4E0g) — closest to Assignment 5.
2. [Zod Tutorial: Auto-Generate Schemas & Validate API Responses in TypeScript](https://www.youtube.com/watch?v=siQfpESFOhI) — closest to Assignment 6.

No dedicated video for the asset-classification/normalization step (Assignments 2–4) — it's plain TypeScript, not a specific library or API, so there's nothing to link beyond just writing it directly from the "read this first" explanation above.

### Next

Once all seven assignments are done, move this section into "Completed topics" below, and update "Current step" to Topic 5 — Testing & Documentation (now also covering the full Docker Compose stack + health check).

## Completed topics

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
