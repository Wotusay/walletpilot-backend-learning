import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Subject } from "rxjs";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";
import { RefreshService } from "src/refresh/refresh.service";
import { Alert } from "./alert.entity";
import { AlertsService } from "./alerts.service";
import { Watchlist, WatchlistRule } from "./watchlist.entity";

const OWNER = "5HZ8AEgxmnBwwmMKH4LZXxU5h6kGgq7XoWfgNHuGVpyU";
const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

// Array-backed stand-in for a TypeORM repository. save() really mutates the
// stored row, so the edge-trigger tests (which depend on `breached` surviving
// from one snapshot to the next) are actually meaningful.
function fakeRepo<T extends { id?: string }>(rows: T[] = []) {
  let seq = 0;
  return {
    rows,
    find: jest.fn(async ({ where }: any = {}) =>
      rows.filter((row) =>
        Object.entries(where ?? {}).every(
          ([key, value]) => (row as any)[key] === value,
        ),
      ),
    ),
    save: jest.fn(async (entity: any) => {
      const existing = entity.id && rows.find((r) => r.id === entity.id);
      if (existing) {
        Object.assign(existing, entity);
        return existing;
      }
      const created = { id: `row-${++seq}`, createdAt: new Date(), ...entity };
      rows.push(created);
      return created;
    }),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
}

function watchlist(overrides: Partial<Watchlist> = {}): Watchlist {
  return {
    id: `wl-${Math.random().toString(36).slice(2, 8)}`,
    owner: OWNER,
    address: OWNER,
    rule: WatchlistRule.SolBalanceBelow,
    threshold: 1,
    active: true,
    breached: false,
    createdAt: new Date(),
    ...overrides,
  };
}

// Mirrors what RefreshService.refreshWallet() actually saves.
function snapshot(
  address: string,
  balance: number,
  price = 100,
): PortfolioSnapshot {
  return {
    id: `snap-${Math.random().toString(36).slice(2, 8)}`,
    address,
    totalValue: balance * price,
    holdings: { SOL: { balance, price } },
    createdAt: new Date(),
  } as PortfolioSnapshot;
}

describe("AlertsService", () => {
  let service: AlertsService;
  let bus: Subject<PortfolioSnapshot>;
  let watchlists: ReturnType<typeof fakeRepo<Watchlist>>;
  let alerts: ReturnType<typeof fakeRepo<Alert>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    bus = new Subject<PortfolioSnapshot>();
    watchlists = fakeRepo<Watchlist>([]);
    alerts = fakeRepo<Alert>([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: RefreshService, useValue: { snapshots: bus.asObservable() } },
        { provide: getRepositoryToken(Watchlist), useValue: watchlists },
        { provide: getRepositoryToken(Alert), useValue: alerts },
      ],
    }).compile();

    service = moduleRef.get(AlertsService);
    service.onModuleInit();
  });

  it("fires when the SOL balance drops below the threshold", async () => {
    const rule = watchlist({ threshold: 1.5 });
    watchlists.rows.push(rule);

    const fired = await service.evaluate(snapshot(OWNER, 0.5));

    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({
      owner: OWNER,
      address: OWNER,
      watchlistId: rule.id,
      rule: WatchlistRule.SolBalanceBelow,
      threshold: 1.5,
      observedValue: 0.5,
    });
    // The rule is now latched, which is what stops the next tick re-firing.
    expect(rule.breached).toBe(true);
  });

  // The core guarantee: a wallet parked below its threshold must not produce an
  // alert every single minute.
  it("does not fire again while the rule is still breached", async () => {
    watchlists.rows.push(watchlist({ threshold: 1.5 }));

    await service.evaluate(snapshot(OWNER, 0.5));
    const second = await service.evaluate(snapshot(OWNER, 0.4));
    const third = await service.evaluate(snapshot(OWNER, 0.3));

    expect(second).toEqual([]);
    expect(third).toEqual([]);
    expect(alerts.rows).toHaveLength(1);
  });

  it("re-arms after recovering and fires again on the next crossing", async () => {
    const rule = watchlist({ threshold: 1.5 });
    watchlists.rows.push(rule);

    await service.evaluate(snapshot(OWNER, 0.5)); // fires
    const recovery = await service.evaluate(snapshot(OWNER, 2)); // silent re-arm
    expect(recovery).toEqual([]);
    expect(rule.breached).toBe(false);

    const again = await service.evaluate(snapshot(OWNER, 0.9));

    expect(again).toHaveLength(1);
    expect(alerts.rows).toHaveLength(2);
  });

  // TOTAL_VALUE_* reads USD, not the SOL amount — 2 SOL at $100 is $200, which
  // is above a 150 threshold even though the balance itself is below it.
  it("evaluates TOTAL_VALUE_ABOVE against the USD total, not the balance", async () => {
    watchlists.rows.push(
      watchlist({ rule: WatchlistRule.TotalValueAbove, threshold: 150 }),
    );

    const fired = await service.evaluate(snapshot(OWNER, 2, 100));

    expect(fired).toHaveLength(1);
    expect(fired[0].observedValue).toBe(200);
  });

  it("ignores inactive rules", async () => {
    watchlists.rows.push(watchlist({ threshold: 1.5, active: false }));

    expect(await service.evaluate(snapshot(OWNER, 0.5))).toEqual([]);
  });

  it("only evaluates rules armed on the snapshot's own address", async () => {
    watchlists.rows.push(watchlist({ address: OTHER, threshold: 1.5 }));

    expect(await service.evaluate(snapshot(OWNER, 0.5))).toEqual([]);
    expect(await service.evaluate(snapshot(OTHER, 0.5))).toHaveLength(1);
  });

  it("does not fire when the value merely touches the threshold", async () => {
    watchlists.rows.push(watchlist({ threshold: 1 }));

    expect(await service.evaluate(snapshot(OWNER, 1))).toEqual([]);
  });

  // What AlertsGateway consumes — a fired alert has to reach the bus, or the
  // browser never sees it live.
  it("pushes each fired alert onto the stream", async () => {
    watchlists.rows.push(watchlist({ threshold: 1.5 }));
    const seen: Alert[] = [];
    service.stream.subscribe((alert) => seen.push(alert));

    const [fired] = await service.evaluate(snapshot(OWNER, 0.5));

    expect(seen).toEqual([fired]);
  });

  // The bus wiring itself: a snapshot saved by RefreshService triggers the check
  // without anyone calling evaluate() directly.
  it("evaluates snapshots arriving on the refresh bus", async () => {
    watchlists.rows.push(watchlist({ threshold: 1.5 }));
    const delivered = new Promise<Alert>((resolve) =>
      service.stream.subscribe(resolve),
    );

    bus.next(snapshot(OWNER, 0.5));

    expect((await delivered).observedValue).toBe(0.5);
  });

  // Without unsubscribing, the bus keeps a reference to a dead service.
  it("stops evaluating once the module is destroyed", async () => {
    watchlists.rows.push(watchlist({ threshold: 1.5 }));
    service.onModuleDestroy();

    bus.next(snapshot(OWNER, 0.5));
    await Promise.resolve();

    expect(alerts.rows).toEqual([]);
  });

  describe("createWatchlist", () => {
    it("defaults the watched address to the caller's own wallet", async () => {
      const created = await service.createWatchlist(OWNER, {
        rule: WatchlistRule.SolBalanceBelow,
        threshold: 1.5,
      });

      expect(created).toMatchObject({ owner: OWNER, address: OWNER, breached: false });
    });

    it("rejects an unknown rule", async () => {
      await expect(
        service.createWatchlist(OWNER, {
          rule: "NOT_A_RULE" as WatchlistRule,
          threshold: 1,
        }),
      ).rejects.toThrow(/rule must be one of/);
    });

    it("rejects a non-numeric threshold", async () => {
      await expect(
        service.createWatchlist(OWNER, {
          rule: WatchlistRule.SolBalanceBelow,
          threshold: "abc" as unknown as number,
        }),
      ).rejects.toThrow(/finite number/);
    });
  });
});
