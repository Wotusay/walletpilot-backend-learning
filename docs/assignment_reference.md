# Assignment Reference — WalletPilot: AI Investment Copilot

Original brief this learning project is based on. Not all of it is being built — see [backend_learning_plan.md](./backend_learning_plan.md) for the subset of topics actually in scope.

## Objective

Build a NestJS backend for an AI-powered investment dashboard. Users authenticate with their Phantom wallet (no passwords or private keys), and the backend retrieves and analyzes their portfolio. The focus is on backend engineering, not the frontend.

## Wallet Authentication

Implement Sign-In with Phantom using a signed nonce. Verify the signature, issue a JWT, and protect authenticated endpoints.

## Portfolio Retrieval

Retrieve SOL balance, SPL token balances, token metadata, recent transaction history, and tokenized stocks (if present).

## Asset Normalization

Classify assets as Crypto, Stablecoin, Tokenized Equity, or NFT (optional). Normalize all assets into a unified portfolio model.

## Market Data Integration

Enrich holdings with live prices, USD values, asset allocation, total portfolio value, and basic portfolio metrics.

## AI Portfolio Analysis

Create an AIService (Claude, OpenAI, or similar) that receives structured portfolio data and returns structured JSON containing an executive summary, portfolio health score (0–100), risk level, diversification analysis, observations, potential risks, and trading behavior. The AI must not query blockchain APIs directly.

## Background Processing

Implement scheduled jobs to refresh wallet balances, market prices, and portfolio snapshots. Use caching to minimize unnecessary API and blockchain calls.

## Technical Requirements

NestJS, PostgreSQL (preferred), Redis, Docker Compose, JWT authentication, Swagger/OpenAPI, structured logging, proper error handling, and unit tests.

## Architecture Expectations

Use clear modules (Auth, Wallet, Portfolio, Market Data, AI, Alerts). Keep controllers thin, business logic in services, and external integrations isolated behind providers.

## Bonus Features

WebSocket updates, wallet watchlists and alerts, AI transaction explanations, portfolio performance over time, multi-wallet support, multi-chain support, scam token detection.

## Evaluation Criteria

Architecture, data modeling, API design, external integrations, background processing, caching, AI integration, testing, documentation, and maintainability. Goal: build a production-style backend powering a modern Web3 investment dashboard.
