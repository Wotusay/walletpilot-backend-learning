import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import {
  NormalizationService,
  PortfolioAsset,
} from "src/normalization/normalization.service";
import { AssetType } from "src/normalization/types/asset-type";
import { WalletService } from "src/wallet/wallet.service";
import { PortfolioSnapshot } from "./portfolio.entity";
import { PortfolioService } from "./portfolio.service";
import { WatchedWallet } from "./watched-wallet.entity";

// Three real base58 Solana addresses — linkWallet runs them through PublicKey,
// so placeholder strings would be rejected before reaching the logic under test.
const OWNER = "5HZ8AEgxmnBwwmMKH4LZXxU5h6kGgq7XoWfgNHuGVpyU";
const LINKED = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const OTHER = "3n1sJTgHkzQXKzqQF7DdBpVWNCMFFTLGyBdxPBmvzZbz";

// computeMetrics is pure and is exactly half of what's under test here — the
// merge only matters because of what the metrics do with it. Stubbing it would
// leave the interesting behaviour untested, so the real one is used, bound to a
// real instance (the constructor only assigns deps computeMetrics never reads).
const realNormalization = new NormalizationService(null as never, null as never);
const realMetrics = realNormalization.computeMetrics.bind(realNormalization);

function asset(
  symbol: string,
  amount: number,
  usdValue: number,
  type = AssetType.Crypto,
): PortfolioAsset {
  return { symbol, type, amount, usdValue };
}

function watched(address: string, label?: string): WatchedWallet {
  return {
    id: `link-${address.slice(0, 4)}`,
    owner: OWNER,
    address,
    label,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  } as WatchedWallet;
}

describe("PortfolioService — multi-wallet", () => {
  let service: PortfolioService;
  let watchedWallets: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let normalize: jest.Mock;

  beforeEach(async () => {
    watchedWallets = {
      find: jest.fn(async () => [] as WatchedWallet[]),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (row: any) => ({ id: "new-id", ...row })),
      delete: jest.fn(async () => ({ affected: 1 })),
    } as any;

    normalize = jest.fn(async () => [] as PortfolioAsset[]) as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PortfolioService,
        // Only getSummary uses the wallet; the multi-wallet path never does.
        { provide: WalletService, useValue: { getBalance: jest.fn() } },
        {
          provide: NormalizationService,
          useValue: { normalize, computeMetrics: realMetrics },
        },
        {
          provide: getRepositoryToken(PortfolioSnapshot),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(WatchedWallet),
          useValue: watchedWallets,
        },
      ],
    }).compile();

    service = moduleRef.get(PortfolioService);
  });

  // Route the fake normalizer per address, so a test can state "this wallet
  // holds X, that one holds Y" and nothing else.
  function holdings(byAddress: Record<string, PortfolioAsset[] | Error>) {
    normalize.mockImplementation((async (address: string) => {
      const entry = byAddress[address];
      if (entry instanceof Error) throw entry;
      return entry ?? [];
    }) as any);
  }

  describe("linkWallet", () => {
    // The owner is identity, not user input — a body claiming otherwise must
    // not be able to file a link under someone else's wallet.
    it("stores the owner from the JWT, not the body", async () => {
      await service.linkWallet(OWNER, {
        address: LINKED,
        ...({ owner: "attacker" } as any),
      });

      expect(watchedWallets.save).toHaveBeenCalledWith(
        expect.objectContaining({ owner: OWNER, address: LINKED }),
      );
    });

    it("keeps an optional label", async () => {
      await service.linkWallet(OWNER, { address: LINKED, label: "  cold  " });

      expect(watchedWallets.save).toHaveBeenCalledWith(
        expect.objectContaining({ label: "cold" }),
      );
    });

    // Garbage in the address column would break every later aggregate, so it
    // is rejected before it ever reaches the repository.
    it("rejects an address that isn't valid base58", async () => {
      await expect(
        service.linkWallet(OWNER, { address: "not-an-address" }),
      ).rejects.toThrow(BadRequestException);
      expect(watchedWallets.save).not.toHaveBeenCalled();
    });

    it("rejects an empty address", async () => {
      await expect(service.linkWallet(OWNER, { address: "   " })).rejects.toThrow(
        BadRequestException,
      );
    });

    // The signed-in wallet is implicit in every aggregate. Storing it too would
    // be the one way to double-count it.
    it("rejects linking your own wallet", async () => {
      await expect(
        service.linkWallet(OWNER, { address: OWNER }),
      ).rejects.toThrow(BadRequestException);
      expect(watchedWallets.save).not.toHaveBeenCalled();
    });

    // Caught in the service so the unique constraint never surfaces as a 500.
    it("rejects a duplicate link with a conflict", async () => {
      watchedWallets.findOne.mockResolvedValue(watched(LINKED) as never);

      await expect(
        service.linkWallet(OWNER, { address: LINKED }),
      ).rejects.toThrow(ConflictException);
      expect(watchedWallets.save).not.toHaveBeenCalled();
    });
  });

  describe("unlinkWallet", () => {
    // Scoped by owner — an id-only delete would let one identity unlink
    // another's wallet.
    it("deletes scoped to the owner", async () => {
      await service.unlinkWallet(OWNER, "link-1");

      expect(watchedWallets.delete).toHaveBeenCalledWith({
        id: "link-1",
        owner: OWNER,
      });
    });

    it("404s when nothing matched", async () => {
      watchedWallets.delete.mockResolvedValue({ affected: 0 } as never);

      await expect(service.unlinkWallet(OWNER, "link-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("listWallets", () => {
    // The primary has no row of its own, so it carries a null id — which is
    // also what tells the UI there is nothing to unlink.
    it("leads with the signed-in wallet, flagged primary with a null id", async () => {
      watchedWallets.find.mockResolvedValue([watched(LINKED, "cold")] as never);

      const wallets = await service.listWallets(OWNER);

      expect(wallets).toHaveLength(2);
      expect(wallets[0]).toMatchObject({
        address: OWNER,
        primary: true,
        id: null,
      });
      expect(wallets[1]).toMatchObject({
        address: LINKED,
        primary: false,
        label: "cold",
      });
    });
  });

  describe("getAggregateSummary", () => {
    // The headline behaviour: two wallets holding SOL are one SOL position,
    // not two. Concatenating would give assets.length === 2.
    it("merges the same symbol across wallets into a single asset", async () => {
      watchedWallets.find.mockResolvedValue([watched(LINKED)] as never);
      holdings({
        [OWNER]: [asset("SOL", 2, 200)],
        [LINKED]: [asset("SOL", 3, 300)],
      });

      const result = await service.getAggregateSummary(OWNER);

      expect(result.assets).toHaveLength(1);
      expect(result.assets[0]).toMatchObject({
        symbol: "SOL",
        amount: 5,
        usdValue: 500,
      });
    });

    // The proof that the merge happens *before* computeMetrics: one allocation
    // entry at 100%. Concatenated input yields two SOL entries at 40/60.
    it("computes one set of allocations over the merged holdings", async () => {
      watchedWallets.find.mockResolvedValue([watched(LINKED)] as never);
      holdings({
        [OWNER]: [asset("SOL", 2, 200)],
        [LINKED]: [asset("SOL", 3, 300)],
      });

      const { metrics } = await service.getAggregateSummary(OWNER);

      expect(metrics.totalUsdValue).toBe(500);
      expect(metrics.allocationByAsset).toEqual([{ symbol: "SOL", pct: 100 }]);
    });

    it("keeps distinct symbols distinct, with percentages summing to 100", async () => {
      watchedWallets.find.mockResolvedValue([watched(LINKED)] as never);
      holdings({
        [OWNER]: [asset("SOL", 2, 150)],
        [LINKED]: [
          asset("SOL", 1, 50),
          asset("USDC", 300, 300, AssetType.Stablecoin),
        ],
      });

      const { assets, metrics } = await service.getAggregateSummary(OWNER);

      expect(assets.map((a) => a.symbol)).toEqual(["SOL", "USDC"]);
      expect(metrics.totalUsdValue).toBe(500);
      expect(metrics.allocationByAsset).toEqual([
        { symbol: "SOL", pct: 40 },
        { symbol: "USDC", pct: 60 },
      ]);
      const sum = metrics.allocationByAsset.reduce((s, a) => s + a.pct, 0);
      expect(sum).toBeCloseTo(100);
    });

    // The per-wallet breakdown is what the UI shows next to the combined total:
    // "you're up $500, $300 of it in cold storage".
    it("reports each wallet's own total alongside the combined one", async () => {
      watchedWallets.find.mockResolvedValue([watched(LINKED)] as never);
      holdings({
        [OWNER]: [asset("SOL", 2, 200)],
        [LINKED]: [asset("SOL", 3, 300)],
      });

      const { wallets } = await service.getAggregateSummary(OWNER);

      expect(wallets).toEqual([
        expect.objectContaining({
          address: OWNER,
          primary: true,
          totalUsdValue: 200,
          assetCount: 1,
          error: null,
        }),
        expect.objectContaining({
          address: LINKED,
          primary: false,
          totalUsdValue: 300,
          assetCount: 1,
          error: null,
        }),
      ]);
    });

    // The merge accumulates into a copy, never into the objects normalize()
    // handed back. Without the copy the first wallet's SOL row would silently
    // become the combined 500 — harmless today, but a landmine the moment
    // anything upstream caches or reuses a PortfolioAsset.
    it("does not mutate the assets it was given", async () => {
      const ownerAssets = [asset("SOL", 2, 200)];
      watchedWallets.find.mockResolvedValue([watched(LINKED)] as never);
      holdings({ [OWNER]: ownerAssets, [LINKED]: [asset("SOL", 3, 300)] });

      await service.getAggregateSummary(OWNER);

      expect(ownerAssets[0]).toEqual(asset("SOL", 2, 200));
    });

    // An identity with nothing linked is still a valid identity — it just
    // aggregates over one wallet.
    it("covers the signed-in wallet alone when nothing is linked", async () => {
      holdings({ [OWNER]: [asset("SOL", 2, 200)] });

      const result = await service.getAggregateSummary(OWNER);

      expect(result.addresses).toEqual([OWNER]);
      expect(normalize).toHaveBeenCalledTimes(1);
      expect(result.metrics.totalUsdValue).toBe(200);
    });

    // Belt-and-braces against double-counting: even if a self-link somehow got
    // into the table, the aggregate must still visit the wallet once.
    it("never visits an address twice, even if the owner is somehow linked", async () => {
      watchedWallets.find.mockResolvedValue([
        watched(OWNER),
        watched(LINKED),
      ] as never);
      holdings({
        [OWNER]: [asset("SOL", 2, 200)],
        [LINKED]: [asset("SOL", 3, 300)],
      });

      const result = await service.getAggregateSummary(OWNER);

      expect(result.addresses).toEqual([OWNER, LINKED]);
      expect(result.metrics.totalUsdValue).toBe(500);
    });

    // One unreachable wallet must not take down the whole view — the caller
    // gets the wallets that did resolve, plus a named reason for the one that
    // didn't, rather than a 500 and nothing.
    it("reports a failing wallet without failing the call", async () => {
      watchedWallets.find.mockResolvedValue([
        watched(LINKED),
        watched(OTHER),
      ] as never);
      holdings({
        [OWNER]: [asset("SOL", 2, 200)],
        [LINKED]: new Error("RPC unavailable"),
        [OTHER]: [asset("SOL", 1, 100)],
      });

      const result = await service.getAggregateSummary(OWNER);

      expect(result.metrics.totalUsdValue).toBe(300); // 200 + 100, LINKED excluded
      expect(result.wallets[1]).toMatchObject({
        address: LINKED,
        totalUsdValue: null,
        assetCount: null,
        error: "RPC unavailable",
      });
      expect(result.wallets[2]).toMatchObject({
        address: OTHER,
        totalUsdValue: 100,
        error: null,
      });
    });

    // computeMetrics guards its own divide-by-zero; this confirms an identity
    // whose wallets are all empty comes back as a clean zero, not NaN.
    it("returns a zero total for empty wallets", async () => {
      holdings({ [OWNER]: [] });

      const result = await service.getAggregateSummary(OWNER);

      expect(result.assets).toEqual([]);
      expect(result.metrics.totalUsdValue).toBe(0);
      expect(result.metrics.allocationByAsset).toEqual([]);
    });
  });
});
