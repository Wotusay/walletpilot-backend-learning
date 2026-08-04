import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AddressInfo } from "net";
import { io, Socket as ClientSocket } from "socket.io-client";
import { MarketDataService } from "src/market-data/market-data.service";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";
import { PortfolioGateway } from "src/refresh/portfolio.gateway";
import { RefreshService } from "src/refresh/refresh.service";
import { WalletService } from "src/wallet/wallet.service";
import { Alert } from "./alert.entity";
import { AlertsGateway } from "./alerts.gateway";
import { AlertsService } from "./alerts.service";
import { Watchlist, WatchlistRule } from "./watchlist.entity";

// End-to-end version of the README's "done when": a refresh crosses a threshold
// and the alert lands in the browser, live, with no polling.
//
// Real Nest app, real socket.io server, real socket.io clients over a real TCP
// port. Only the outside edges are faked (no Postgres, no Solana RPC, no
// CoinGecko). PortfolioGateway is included on purpose: both gateways share the
// default namespace, so this also proves their message names don't collide.

const OWNER = "5HZ8AEgxmnBwwmMKH4LZXxU5h6kGgq7XoWfgNHuGVpyU";
const STRANGER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

// The wallet holds 2 SOL at $21 → 2 SOL / $42 total.
const BALANCE = 2;
const PRICE = 21;

function nextEvent<T>(client: ClientSocket, event: string, ms = 2000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      ms,
    );
    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function connect(port: number, owner: string): Promise<ClientSocket> {
  const client = io(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  await new Promise<void>((resolve, reject) => {
    client.once("connect_error", reject);
    client.once("connect", () => resolve());
  });
  // The gateway echoes "alertsSubscribed" once the room join is done, so the
  // test never triggers a refresh before the client is actually listening.
  const confirmed = nextEvent<string>(client, "alertsSubscribed");
  client.emit("subscribeAlerts", owner);
  expect(await confirmed).toBe(owner);
  return client;
}

describe("AlertsGateway (integration)", () => {
  let app: INestApplication;
  let refreshService: RefreshService;
  let port: number;
  let watcher: ClientSocket;
  let stranger: ClientSocket;

  // One rule, armed below the wallet's real balance so the first refresh fires.
  const rule: Watchlist = {
    id: "wl-1",
    owner: OWNER,
    address: OWNER,
    rule: WatchlistRule.SolBalanceBelow,
    threshold: 5,
    active: true,
    breached: false,
    createdAt: new Date(),
  };

  let snapshotId = 0;
  let alertId = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RefreshService,
        PortfolioGateway,
        AlertsService,
        AlertsGateway,
        {
          provide: WalletService,
          useValue: {
            getBalance: jest.fn(async (address: string) => ({
              address,
              balance: BALANCE,
            })),
          },
        },
        {
          provide: MarketDataService,
          useValue: {
            getPrice: jest.fn(async (symbol: string) => ({
              symbol,
              price: PRICE,
            })),
          },
        },
        { provide: ConfigService, useValue: { get: () => OWNER } },
        {
          provide: getRepositoryToken(PortfolioSnapshot),
          useValue: {
            save: jest.fn(async (entity: Partial<PortfolioSnapshot>) => ({
              ...entity,
              id: `snap-${++snapshotId}`,
              createdAt: new Date(),
            })),
          },
        },
        {
          provide: getRepositoryToken(Watchlist),
          useValue: {
            find: jest.fn(async ({ where }: any) =>
              where?.address && where.address !== rule.address ? [] : [rule],
            ),
            save: jest.fn(async (entity: Watchlist) => entity),
          },
        },
        {
          provide: getRepositoryToken(Alert),
          useValue: {
            save: jest.fn(async (entity: Partial<Alert>) => ({
              ...entity,
              id: `alert-${++alertId}`,
              createdAt: new Date(),
            })),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    refreshService = app.get(RefreshService);
    await app.listen(0); // random free port
    port = (app.getHttpServer().address() as AddressInfo).port;

    [watcher, stranger] = await Promise.all([
      connect(port, OWNER),
      connect(port, STRANGER),
    ]);
  }, 30000);

  afterAll(async () => {
    [watcher, stranger].forEach((c) => c?.disconnect());
    await app?.close();
  });

  it("pushes an alert to the rule's owner when a refresh crosses the threshold", async () => {
    const seenByStranger: Alert[] = [];
    stranger.on("alert", (a: Alert) => seenByStranger.push(a));

    const delivered = nextEvent<Alert>(watcher, "alert");
    await refreshService.refreshWallet(OWNER);
    const alert = await delivered;

    expect(alert).toMatchObject({
      owner: OWNER,
      address: OWNER,
      watchlistId: "wl-1",
      rule: WatchlistRule.SolBalanceBelow,
      threshold: 5,
      observedValue: BALANCE,
    });
    // Alerts are per-owner, not broadcast — a client in another room sees none.
    expect(seenByStranger).toEqual([]);
  });

  // The rule latched on the first refresh, so further ticks must stay quiet.
  it("does not re-alert on the next refresh while still breached", async () => {
    const seen: Alert[] = [];
    watcher.on("alert", (a: Alert) => seen.push(a));

    // Join the portfolio room too, and wait for the ack — emitting and
    // refreshing in the same breath would race the server-side room join.
    const joined = nextEvent<string>(watcher, "subscribed");
    watcher.emit("subscribe", OWNER);
    await joined;

    // A snapshot still arriving is how we know the tick really ran, rather than
    // the assertion passing because nothing happened at all.
    const snapshot = nextEvent<PortfolioSnapshot>(watcher, "snapshot");
    await refreshService.refreshWallet(OWNER);
    await snapshot;

    expect(seen).toEqual([]);
  });
});
