import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AddressInfo } from "net";
import { io, Socket as ClientSocket } from "socket.io-client";
import { MarketDataService } from "src/market-data/market-data.service";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";
import { WalletService } from "src/wallet/wallet.service";
import { PortfolioGateway } from "./portfolio.gateway";
import { RefreshService } from "./refresh.service";

// End-to-end version of the README's "done when": two clients watching the same
// wallet both get the snapshot the moment RefreshService saves it, and a client
// watching another wallet gets nothing.
//
// Real Nest app, real socket.io server, real socket.io clients over a real TCP
// port. Only the outside edges are faked (no Postgres, no Solana RPC, no
// CoinGecko), and the module is assembled by hand instead of importing
// RefreshModule so nothing pulls in the global Cache/Config/TypeORM setup.

const ADDRESS = "5HZ8AEgxmnBwwmMKH4LZXxU5h6kGgq7XoWfgNHuGVpyU";
const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

// Waits for one event, or rejects so a broken broadcast fails fast instead of
// hanging until the jest timeout.
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

// Returning `{ event, data }` from a @SubscribeMessage handler makes Nest emit
// that event back to the sender, so "subscribed" is the confirmation that the
// room join has happened server-side before the test triggers a refresh.
async function subscribe(client: ClientSocket, address: string) {
  const confirmed = nextEvent<string>(client, "subscribed");
  client.emit("subscribe", address);
  expect(await confirmed).toBe(address);
}

async function connect(port: number, address: string): Promise<ClientSocket> {
  const client = io(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  await new Promise<void>((resolve, reject) => {
    client.once("connect_error", reject);
    client.once("connect", () => resolve());
  });
  await subscribe(client, address);
  return client;
}

describe("PortfolioGateway (integration)", () => {
  let app: INestApplication;
  let refreshService: RefreshService;
  let port: number;
  let watcherA: ClientSocket;
  let watcherB: ClientSocket;
  let bystander: ClientSocket;

  let snapshotId = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RefreshService,
        PortfolioGateway,
        {
          provide: WalletService,
          useValue: {
            getBalance: jest.fn(async (address: string) => ({
              address,
              balance: 2,
            })),
          },
        },
        {
          provide: MarketDataService,
          useValue: {
            getPrice: jest.fn(async (symbol: string) => ({
              symbol,
              price: 21,
            })),
          },
        },
        { provide: ConfigService, useValue: { get: () => ADDRESS } },
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
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    refreshService = app.get(RefreshService);
    await app.listen(0); // random free port
    port = (app.getHttpServer().address() as AddressInfo).port;

    [watcherA, watcherB, bystander] = await Promise.all([
      connect(port, ADDRESS),
      connect(port, ADDRESS),
      connect(port, OTHER),
    ]);
  }, 30000); // booting Nest + three real sockets can outrun jest's 5s default

  afterAll(async () => {
    [watcherA, watcherB, bystander].forEach((c) => c?.disconnect());
    await app?.close();
  });

  it("pushes a saved snapshot to every client watching that address", async () => {
    const received = Promise.all([
      nextEvent<PortfolioSnapshot>(watcherA, "snapshot"),
      nextEvent<PortfolioSnapshot>(watcherB, "snapshot"),
    ]);

    const saved = await refreshService.refreshWallet(ADDRESS);
    const [fromA, fromB] = await received;

    expect(fromA.id).toBe(saved.id);
    expect(fromB.id).toBe(saved.id);
    expect(fromA.address).toBe(ADDRESS);
    expect(fromA.totalValue).toBe(2 * 21);
  });

  // Scoping is the requirement — a broadcast to everyone would pass the test
  // above but fail this one.
  it("does not push a snapshot to clients watching another address", async () => {
    const seenByBystander: PortfolioSnapshot[] = [];
    bystander.on("snapshot", (s: PortfolioSnapshot) => seenByBystander.push(s));

    const delivered = nextEvent<PortfolioSnapshot>(watcherA, "snapshot");
    await refreshService.refreshWallet(ADDRESS);
    await delivered; // once A has it, any wrong-room copy would already be in flight

    expect(seenByBystander).toEqual([]);
  });

  it("moves a client to the new room when it re-subscribes", async () => {
    await subscribe(watcherB, OTHER);

    const delivered = nextEvent<PortfolioSnapshot>(watcherB, "snapshot");
    const saved = await refreshService.refreshWallet(OTHER);

    expect((await delivered).id).toBe(saved.id);
  });
});
