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
2. Auth & JWT (Wallet Sign-In) — [Issue #2](https://github.com/Wotusay/walletpilot-backend-learning/issues/2) ← **you are here**
3. Background Jobs & Redis Caching — [Issue #3](https://github.com/Wotusay/walletpilot-backend-learning/issues/3)
4. AI Service Integration — [Issue #4](https://github.com/Wotusay/walletpilot-backend-learning/issues/4)
5. Testing & Documentation — [Issue #5](https://github.com/Wotusay/walletpilot-backend-learning/issues/5)

## Current step: Topic 2 — Auth & JWT (Wallet Sign-In)

### What's already here

- Topic 1's modules, all wired: `WalletService.getBalance()` is implemented, `PortfolioModule` imports `WalletModule`, and `PortfolioService` injects `WalletService` to build a real summary.
- `AuthModule`, `AuthController`, `AuthService` exist but are still a `ping` stub — nothing wallet- or token-related exists yet. That's this topic.

Try it once it's running:
```bash
curl http://localhost:3000/auth/ping
curl http://localhost:3000/portfolio/abc123/summary
```

### How wallet sign-in works (read this first)

Traditional login is username + password: the server checks a hash in a database. WalletPilot has no passwords — the wallet's **private key is the identity**. Proving you own a wallet means proving you can produce a valid signature with that private key, without the private key ever leaving the wallet or touching your server.

That's a **challenge-response** flow, in five steps:

1. **Client asks for a challenge.** `POST /auth/nonce { publicKey }` → the server generates a random, single-use nonce, remembers it against that public key, and returns a message that embeds it (e.g. `"Sign this message to log in to WalletPilot: <nonce>"`).
2. **The wallet signs the challenge.** Phantom signs that *exact* message with the user's private key. This produces a signature — it proves control of the key without ever exposing it.
3. **Client sends proof.** `POST /auth/verify { publicKey, signature }` → the server looks up the nonce it issued for that public key and reconstructs the identical message string.
4. **The server trusts math, not the client.** Signature verification (`nacl.sign.detached.verify(message, signature, publicKey)`) is a pure function: it returns `true` only if that exact keypair produced that exact signature for that exact message. There's nothing to fake here — either the math checks out or it doesn't.
5. **The server issues a JWT.** From here it's ordinary token auth: the JWT is proof "the server already checked this identity once," so protected routes just verify the *token's* signature (signed with the server's own secret) instead of re-checking a wallet signature on every request.

**Why the nonce matters:** without it, a signature is just a fixed blob — if it ever leaked (logs, a proxy, a malicious frontend), anyone could replay it forever to "log in" as that wallet. A fresh, server-generated, single-use nonce means every login needs a signature the server has never seen before, tied to that one attempt.

**Why Ed25519 specifically:** Solana keypairs use Ed25519 (not the ECDSA/secp256k1 curve Ethereum and Bitcoin use) — that's why verification goes through `tweetnacl` (`nacl.sign.detached.verify`) rather than an Ethereum-style `verifyMessage` helper.

### Assignments

Do these in order. Don't move to Topic 3 until you can explain the "Done when" for each.

**1. Install what you need.**
```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt tweetnacl bs58
npm install -D @types/passport-jwt
```
Done when: `npm run start:dev` still boots cleanly with these installed but unused.

**2. Build the nonce endpoint.**
In `src/auth/`, add a `POST /auth/nonce` route (body: `{ publicKey: string }`). In `AuthService`, generate a nonce (`crypto.randomUUID()` is fine), store it against that `publicKey` in a plain in-memory `Map` — a real app would put this in Redis, but that's Topic 3, don't reach for it yet — and return the message string to sign.
Done when: calling it twice for the same `publicKey` returns two different messages (proves it's actually generating a fresh nonce, not a static string).

**3. Build the verify endpoint — the core exercise.**
Add `POST /auth/verify` (body: `{ publicKey: string, signature: string }`, signature as base58 — that's the format Phantom's `signMessage` returns). In `AuthService`:
- Look up the stored nonce/message for that `publicKey`. Missing or expired → throw `UnauthorizedException`.
- Rebuild the exact message bytes with `new TextEncoder().encode(message)`.
- Decode `publicKey` and `signature` from base58 with `bs58.decode(...)`.
- Verify with `nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)`.
- On success: delete the nonce (single-use!) and return a JWT via `jwtService.sign({ sub: publicKey })`. On failure: `UnauthorizedException`.

You don't need a real Phantom wallet to test this — generate a keypair with `nacl.sign.keyPair()` in a scratch script, sign your message with `nacl.sign.detached()`, and call your own endpoint with the result. This is exactly how you'll unit-test `AuthService` in Topic 5.
Done when: a signature from the *correct* keypair returns a JWT, and a tampered signature (flip one character) returns 401.

**4. Protect a route with a JWT guard.**
- Register `JwtModule` in `AuthModule` — `JwtModule.register({ secret: ..., signOptions: { expiresIn: '1h' } })`. Put the secret in an env var, not a hardcoded string.
- Add a `JwtStrategy` (extends `PassportStrategy(Strategy)` from `passport-jwt`) that extracts and validates the Bearer token.
- Add a `JwtAuthGuard` (extends `AuthGuard('jwt')`) and apply it with `@UseGuards(JwtAuthGuard)` to a new `GET /auth/me` route that returns `req.user`.
Done when: `GET /auth/me` without a token returns 401; with a valid token from step 3, it returns the public key back.

**5. Explain it in your own words.**
Add your notes below and answer: what actually stops someone from replaying an *old* signature against `/auth/verify`? (Hint: it isn't the signature itself.)
Done when: you've written that paragraph without looking it up.

## Notes

_(fill this in once you've done the assignments — same as Topic 1)_

### Documentation

- [NestJS — Authentication](https://docs.nestjs.com/security/authentication)
- [NestJS — Passport recipe](https://docs.nestjs.com/recipes/passport)
- [Phantom — Sign In With Solana](https://phantom.com/learn/developers/sign-in-with-solana)
- [Phantom — Signing a Message](https://docs.phantom.com/solana/signing-a-message)
- [Solana Cookbook — Sign & Verify a Message](https://solana.com/developers/cookbook/wallets/sign-message)
- [QuickNode — Authenticate users with a Solana wallet](https://www.quicknode.com/guides/solana-development/dapps/how-to-authenticate-users-with-a-solana-wallet)
- [RareSkills — Ed25519 Signature Verification in Solana](https://rareskills.io/post/solana-signature-verification)
- [jwt.io — JSON Web Token Introduction](https://www.jwt.io/introduction)

### Video resources (watch in this order)

1. [What Is JWT and Why Should You Use JWT](https://www.youtube.com/watch?v=7Q17ubqLfaM) — watch first, before touching code: what a JWT actually is and why stateless auth uses it.
2. [NestJS JWT Authentication Tutorial](https://www.youtube.com/watch?v=EFDUvzJT_wI) — practical Nest + Passport + guards implementation, closest to Assignment 4.

There isn't a solid dedicated video for the Solana signature-verification half of this topic — it's a narrower niche than general JWT auth. Use the QuickNode guide and Solana Cookbook link above for that part instead; they walk through the exact `nacl`/`bs58` calls Assignment 3 needs.

### Next

Once all five assignments are done, move this section into "Completed topics" below (like Topic 1), and update "Current step" to Topic 3.

## Completed topics

### Topic 1 — NestJS Architecture & Modules ✅

[Issue #1](https://github.com/Wotusay/walletpilot-backend-learning/issues/1) · modules, controllers/services, and dependency injection between `WalletModule` and `PortfolioModule`.

**Notes:**

When creating new api calls from in nestjs. It feels allot like creating new modules in like it is in angular. You create a new controller and service and then you wire them together in the module. The controller is responsible for handling the request and the service is responsible for the business logic. The service can be injected into the controller using dependency injection. This allows for better separation of concerns and makes it easier to test the code.

So i already had a basic understanding of how to creating new api calls. The new things are the properties of the decorators. The @Get decorator is used to define a route for a GET request. The @Param decorator is used to extract parameters from the route. But the @Injectable decorator also exists in the angular framework. So thats not new to me.

The youtube videos are very helpful in understanding the concepts of nestjs. The first video is a crash course that gives a quick orientation to the CLI and project structure. The second video is a comprehensive step-by-step tutorial that covers modules, controllers, and services together. The third video is about dependency injection and is very helpful in understanding how to use it in nestjs.

Documentation and videos used: [NestJS — First Steps](https://docs.nestjs.com/first-steps), [Controllers](https://docs.nestjs.com/controllers), [Providers](https://docs.nestjs.com/providers), [Modules](https://docs.nestjs.com/modules), [Dependency Injection](https://docs.nestjs.com/fundamentals/custom-providers); [Nest.js Crash Course #1](https://www.youtube.com/watch?v=pcX97ZrTE6M), [Nest.js Crash Course — Comprehensive Tutorial](https://www.youtube.com/watch?v=Hv70fn8xTL4), [NestJS Full Course #4 — Dependency Injection](https://www.youtube.com/watch?v=JLHnJoWLjXI).
