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

1. NestJS Architecture & Modules ← **you are here**
2. Auth & JWT (Wallet Sign-In)
3. Background Jobs & Redis Caching
4. AI Service Integration
5. Testing & Documentation

## Current step: Topic 1 — NestJS Architecture & Modules

### What's already here

- `Auth`, `Wallet`, `Portfolio`, `MarketData`, `AI`, `Alerts` modules, each registered in `AppModule`.
- Every module has a thin controller (handles HTTP, no logic) and a service (does the actual work).
- None of them have real logic yet — every service is just a `ping` stub, on purpose. Nothing is pre-solved.
- `PortfolioService.getSummary()` returns `walletBalance: null` — that's Assignment 3 below.

Try it once it's running:
```bash
curl http://localhost:3000/wallet/ping
curl http://localhost:3000/portfolio/abc123/summary
```

### Assignments

Do these in order. Don't move to Topic 2 until you can explain the "Done when" for each.

**1. Read the code before changing anything.**
Open `src/wallet/wallet.module.ts`, `wallet.controller.ts`, `wallet.service.ts`. Trace the request: `main.ts` → `AppModule` → `WalletModule` → `WalletController` → `WalletService`.
Done when: you can explain, out loud or in a comment, why the controller doesn't call `WalletService`'s logic itself — why does that split exist at all?

**2. Add a new endpoint to an existing module.**
In `MarketDataController` (`src/market-data/`), add a `GET /market-data/price/:symbol` route. In `MarketDataService`, add a `getPrice(symbol: string)` method returning a hardcoded `{ symbol, price: 100 }`. Wire the controller to call it.
Done when: `curl http://localhost:3000/market-data/price/SOL` returns your hardcoded price.

**3. Wire dependency injection between two modules (the core exercise).**
Nothing here is done for you yet. In `src/wallet/`:
1. Implement `WalletService.getBalance(address: string)` — return a hardcoded `{ address, balance }` object (pick any number).
2. Add a `GET :address/balance` route to `WalletController` that calls it.

Then, in `src/portfolio/`:
3. Import `WalletModule` into `PortfolioModule` (`imports: [WalletModule]`).
4. Inject `WalletService` into `PortfolioService`'s constructor.
5. Call `walletService.getBalance(address)` inside `getSummary()` and use the real value instead of `null`.

Done when: `curl http://localhost:3000/portfolio/abc123/summary` returns a real `walletBalance`, not `null` — and you can explain why this only works because `WalletModule` **exports** `WalletService`, and why it would fail without the `exports` array or the `imports` array.

**4. Explain it in your own words.**
Add a `## Notes` section below and answer: why does NestJS make you go through modules/DI instead of just writing `new WalletService()` inside `PortfolioService`? What do you gain, what does it cost?
Done when: you've written that paragraph without looking it up — checking it against the docs afterward is fine.

### Documentation

- [NestJS — First Steps](https://docs.nestjs.com/first-steps)
- [NestJS — Controllers](https://docs.nestjs.com/controllers)
- [NestJS — Providers](https://docs.nestjs.com/providers)
- [NestJS — Modules](https://docs.nestjs.com/modules)
- [NestJS — Dependency Injection (fundamentals)](https://docs.nestjs.com/fundamentals/custom-providers)

### Video resources (watch in this order)

1. [Nest.js Crash Course #1 — Introduction & Setup](https://www.youtube.com/watch?v=pcX97ZrTE6M) — quick orientation to the CLI and project structure.
2. [Nest.js Crash Course — Comprehensive Step-by-Step Tutorial](https://www.youtube.com/watch?v=Hv70fn8xTL4) — modules, controllers, and services together.
3. [NestJS Full Course #4 — Dependency Injection](https://www.youtube.com/watch?v=JLHnJoWLjXI) — watch right before Assignment 3, it's the exact concept you'll apply.

### Next

Once all four assignments are done, update the "Current step" section above to Topic 2 and keep building in the same `src/` — same app, same modules, next layer on top.
