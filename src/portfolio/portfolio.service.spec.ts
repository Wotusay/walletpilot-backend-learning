import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NormalizationService } from "src/normalization/normalization.service";
import { WalletService } from "src/wallet/wallet.service";
import { PortfolioSnapshot } from "./portfolio.entity";
import { PortfolioService } from "./portfolio.service";
import { WatchedWallet } from "./watched-wallet.entity";

const ADDRESS = "5HZ8AEgxmnBwwmMKH4LZXxU5h6kGgq7XoWfgNHuGVpyU";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// Chainable stand-in for TypeORM's SelectQueryBuilder. It records every bound
// parameter, so the "which window did we ask for" assertions test the real
// query instead of just the return value.
function fakeQueryBuilder(rows: PortfolioSnapshot[]) {
  const params: Record<string, any> = {};
  const builder: any = {
    params,
    where: jest.fn((_sql: string, p: any) => (Object.assign(params, p), builder)),
    andWhere: jest.fn((_sql: string, p: any) => (Object.assign(params, p), builder)),
    orderBy: jest.fn(() => builder),
    getMany: jest.fn(async () => rows),
  };
  return builder;
}

// Mirrors what RefreshService.refreshWallet() actually saves. `minutesAgo`
// keeps the fixtures inside the day window without hardcoding dates.
function snapshot(totalValue: number, minutesAgo: number): PortfolioSnapshot {
  return {
    id: `snap-${minutesAgo}`,
    address: ADDRESS,
    totalValue,
    holdings: { SOL: { balance: 2, price: totalValue / 2 } },
    createdAt: new Date(Date.now() - minutesAgo * MINUTE),
  } as PortfolioSnapshot;
}

describe("PortfolioService.getHistory", () => {
  let service: PortfolioService;
  let builder: ReturnType<typeof fakeQueryBuilder>;

  // Rebuilds the service around a fixed set of rows, so each test states the
  // series it cares about right where the expectation lives.
  async function withRows(rows: PortfolioSnapshot[]) {
    builder = fakeQueryBuilder(rows);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PortfolioService,
        // getHistory touches neither the wallet, the normalizer nor the linked
        // wallets — but the constructor needs all of them. See
        // portfolio.multi-wallet.spec.ts for the tests that do exercise them.
        { provide: WalletService, useValue: { getBalance: jest.fn() } },
        {
          provide: NormalizationService,
          useValue: { normalize: jest.fn(), computeMetrics: jest.fn() },
        },
        {
          provide: getRepositoryToken(PortfolioSnapshot),
          useValue: { createQueryBuilder: jest.fn(() => builder) },
        },
        {
          provide: getRepositoryToken(WatchedWallet),
          useValue: { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), delete: jest.fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(PortfolioService);
    return service;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the series oldest → newest as { timestamp, totalValue }", async () => {
    const rows = [snapshot(100, 30), snapshot(110, 20), snapshot(125, 10)];
    await withRows(rows);

    const result = await service.getHistory(ADDRESS, "day");

    expect(result.count).toBe(3);
    expect(result.points).toEqual([
      { timestamp: rows[0].createdAt.toISOString(), totalValue: 100 },
      { timestamp: rows[1].createdAt.toISOString(), totalValue: 110 },
      { timestamp: rows[2].createdAt.toISOString(), totalValue: 125 },
    ]);
    expect(result.address).toBe(ADDRESS);
    expect(result.range).toBe("day");
  });

  // The headline number: first → last across the window, nothing in between.
  it("computes the change between the first and last snapshot", async () => {
    await withRows([snapshot(100, 30), snapshot(400, 20), snapshot(125, 10)]);

    const result = await service.getHistory(ADDRESS, "day");

    expect(result.first).toBe(100);
    expect(result.last).toBe(125);
    expect(result.changeAbsolute).toBe(25);
    expect(result.changePercent).toBe(25);
  });

  it("reports a loss as a negative change", async () => {
    await withRows([snapshot(125, 30), snapshot(100, 10)]);

    const result = await service.getHistory(ADDRESS, "day");

    expect(result.changeAbsolute).toBe(-25);
    expect(result.changePercent).toBe(-20);
  });

  // A wallet nobody has snapshotted yet is an empty answer, not a 404.
  it("returns an empty series with null changes when there are no snapshots", async () => {
    await withRows([]);

    const result = await service.getHistory(ADDRESS, "day");

    expect(result.count).toBe(0);
    expect(result.points).toEqual([]);
    expect(result.first).toBeNull();
    expect(result.last).toBeNull();
    expect(result.changeAbsolute).toBeNull();
    expect(result.changePercent).toBeNull();
  });

  // One snapshot is a flat line, not "unknown" — first and last are the same row.
  it("reports zero change for a single snapshot", async () => {
    await withRows([snapshot(100, 10)]);

    const result = await service.getHistory(ADDRESS, "day");

    expect(result.first).toBe(100);
    expect(result.last).toBe(100);
    expect(result.changeAbsolute).toBe(0);
    expect(result.changePercent).toBe(0);
  });

  // Starting from an empty wallet: the absolute gain is real, the percentage
  // would be Infinity, so it must be null instead.
  it("returns a null percentage when the window starts at zero", async () => {
    await withRows([snapshot(0, 30), snapshot(50, 10)]);

    const result = await service.getHistory(ADDRESS, "day");

    expect(result.changeAbsolute).toBe(50);
    expect(result.changePercent).toBeNull();
  });

  it("queries a 7-day window for range=week, scoped to the address", async () => {
    await withRows([]);

    const result = await service.getHistory(ADDRESS, "week");

    expect(builder.params.address).toBe(ADDRESS);
    const span = builder.params.to.getTime() - builder.params.from.getTime();
    expect(span).toBe(7 * DAY);
    // The reported window must be the one actually queried.
    expect(result.from).toBe(builder.params.from.toISOString());
    expect(result.to).toBe(builder.params.to.toISOString());
  });

  it("queries a 30-day window for range=month", async () => {
    await withRows([]);

    await service.getHistory(ADDRESS, "month");

    const span = builder.params.to.getTime() - builder.params.from.getTime();
    expect(span).toBe(30 * DAY);
  });

  it("defaults to a 24-hour window", async () => {
    await withRows([]);

    const result = await service.getHistory(ADDRESS);

    expect(result.range).toBe("day");
    expect(builder.params.to.getTime() - builder.params.from.getTime()).toBe(DAY);
  });

  // No ValidationPipe in this app — the service is the only thing standing
  // between a query string and the database.
  it("rejects an unsupported range", async () => {
    await withRows([]);

    await expect(service.getHistory(ADDRESS, "year")).rejects.toThrow(
      BadRequestException,
    );
    expect(builder.getMany).not.toHaveBeenCalled();
  });
});
