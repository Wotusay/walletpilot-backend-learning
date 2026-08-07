import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { PublicKey } from "@solana/web3.js";
import { Repository } from "typeorm";
import {
  NormalizationService,
  PortfolioAsset,
} from "src/normalization/normalization.service";
import { WalletService } from "src/wallet/wallet.service";
import { LinkWalletDto } from "./dto/link-wallet.dto";
import { PortfolioSnapshot } from "./portfolio.entity";
import { WatchedWallet } from "./watched-wallet.entity";

// How far back each named range looks. A month is 30 days on purpose — the
// snapshots are a plain time series, so a fixed window keeps the % change
// comparable between calls instead of drifting with the calendar.
const RANGE_MS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
} as const;

export type HistoryRange = keyof typeof RANGE_MS;

// One row of the per-wallet breakdown that rides along with the combined view,
// so a caller can see which wallet contributed what without a second round of
// calls. `error` is non-null when that wallet couldn't be read at all.
export interface WalletBreakdown {
  address: string;
  primary: boolean;
  label: string | null;
  totalUsdValue: number | null;
  assetCount: number | null;
  error: string | null;
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly walletService: WalletService,
    private readonly normalizationService: NormalizationService,
    @InjectRepository(PortfolioSnapshot)
    private readonly snapshotRepository: Repository<PortfolioSnapshot>,
    @InjectRepository(WatchedWallet)
    private readonly watchedWallets: Repository<WatchedWallet>,
  ) {}

  async getSummary(address: string) {
    const wallet = await this.walletService.getBalance(address);
    return {
      address,
      walletBalance: wallet.balance,
      holdings: [],
    };
  }

  // Value over time for one wallet, from the snapshots the RefreshService cron
  // has been writing every minute, plus the % change across the window.
  async getHistory(address: string, range = "day") {
    if (!(range in RANGE_MS)) {
      throw new BadRequestException(
        `Unsupported range "${range}". Supported: ${Object.keys(RANGE_MS).join(", ")}`,
      );
    }

    const to = new Date();
    const from = new Date(to.getTime() - RANGE_MS[range as HistoryRange]);

    // Oldest → newest so the chart can plot the array left-to-right directly,
    // same ordering choice as RefreshService.getHistory().
    const rows = await this.snapshotRepository
      .createQueryBuilder("snapshot")
      .where("snapshot.address = :address", { address })
      .andWhere("snapshot.createdAt BETWEEN :from AND :to", { from, to })
      .orderBy("snapshot.createdAt", "ASC")
      .getMany();

    const points = rows.map((row) => ({
      timestamp: new Date(row.createdAt).toISOString(),
      totalValue: Number(row.totalValue),
    }));

    // No snapshots in the window is a valid, empty answer — a wallet that was
    // only just added simply has no history yet.
    const first = points.length ? points[0].totalValue : null;
    const last = points.length ? points[points.length - 1].totalValue : null;
    const changeAbsolute = first === null ? null : last! - first;
    // A wallet that started the window empty has no meaningful percentage —
    // report null rather than Infinity/NaN.
    const changePercent =
      first === null || first === 0 ? null : (changeAbsolute! / first) * 100;

    return {
      address,
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      count: points.length,
      first,
      last,
      changeAbsolute,
      changePercent,
      points,
    };
  }

  // ===================== MULTI-WALLET =====================

  // The owner always comes from the JWT, never the body — the same rule as
  // AlertsService.createWatchlist. A caller can only ever link wallets under
  // their own identity.
  async linkWallet(owner: string, dto: LinkWalletDto): Promise<WatchedWallet> {
    const address = dto.address?.trim();
    if (!address) {
      throw new BadRequestException("address is required");
    }

    // Validated locally rather than via WalletService.getBalance(), which also
    // validates but spends a devnet RPC round-trip to do it. Linking a wallet
    // shouldn't depend on the chain being reachable.
    try {
      new PublicKey(address);
    } catch {
      throw new BadRequestException(`Invalid Solana address: ${address}`);
    }

    if (address === owner) {
      throw new BadRequestException(
        "Your own wallet is always included in the combined portfolio — no need to link it",
      );
    }

    // Caught here so the unique constraint never surfaces as a 500.
    const existing = await this.watchedWallets.findOne({
      where: { owner, address },
    });
    if (existing) {
      throw new ConflictException(`${address} is already linked`);
    }

    return this.watchedWallets.save({
      owner,
      address,
      label: dto.label?.trim() || undefined,
    });
  }

  // The signed-in wallet leads the list and is flagged `primary`. It has no row
  // in the table, hence `id: null` — which is also what tells the UI not to
  // draw an unlink button for it.
  async listWallets(owner: string) {
    const linked = await this.watchedWallets.find({
      where: { owner },
      order: { createdAt: "ASC" },
    });

    return [
      {
        id: null,
        address: owner,
        label: "signed in",
        primary: true,
        createdAt: null,
      },
      ...linked.map((wallet) => ({
        id: wallet.id,
        address: wallet.address,
        label: wallet.label ?? null,
        primary: false,
        createdAt: wallet.createdAt,
      })),
    ];
  }

  // Scoped by owner, so one identity can never unlink another's wallet — an
  // id-only delete would leak deletion across accounts.
  async unlinkWallet(owner: string, id: string): Promise<void> {
    const result = await this.watchedWallets.delete({ id, owner });
    if (!result.affected) {
      throw new NotFoundException(`No linked wallet ${id} for this identity`);
    }
  }

  // One portfolio across every wallet under this identity.
  async getAggregateSummary(owner: string) {
    const linked = await this.watchedWallets.find({
      where: { owner },
      order: { createdAt: "ASC" },
    });
    const labels = new Map(linked.map((w) => [w.address, w.label ?? null]));
    // The Set is the real double-counting guard — linkWallet's self-link
    // rejection is only a friendlier error message in front of it.
    const addresses = [...new Set([owner, ...linked.map((w) => w.address)])];

    // allSettled, not all: one dead address or one CoinGecko hiccup must not
    // take down the whole combined view. Failed wallets are reported by name
    // and left out of the merge, so the total stays honest about its coverage.
    const results = await Promise.allSettled(
      addresses.map((address) => this.normalizationService.normalize(address)),
    );

    const wallets: WalletBreakdown[] = [];
    const perWallet: PortfolioAsset[][] = [];

    results.forEach((result, index) => {
      const address = addresses[index];
      const base = {
        address,
        primary: address === owner,
        label: address === owner ? "signed in" : (labels.get(address) ?? null),
      };

      if (result.status === "rejected") {
        const reason = result.reason as Error;
        wallets.push({
          ...base,
          totalUsdValue: null,
          assetCount: null,
          error: reason?.message ?? String(reason),
        });
        return;
      }

      perWallet.push(result.value);
      wallets.push({
        ...base,
        totalUsdValue: result.value.reduce((sum, a) => sum + a.usdValue, 0),
        assetCount: result.value.length,
        error: null,
      });
    });

    // Merge first, *then* compute metrics once. Computing per wallet and adding
    // the totals would give the right sum but nonsense allocations.
    const assets = this.mergeAssets(perWallet);

    return {
      owner,
      addresses,
      wallets,
      assets,
      metrics: this.normalizationService.computeMetrics(assets),
    };
  }

  // The heart of "combined, not concatenated": the same symbol held by two
  // wallets becomes one asset with the amounts and USD values summed. Keyed by
  // symbol because that is exactly what computeMetrics groups on — feed it the
  // raw concatenation instead and you get two SOL rows at ~50% each.
  private mergeAssets(perWallet: PortfolioAsset[][]): PortfolioAsset[] {
    const bySymbol = new Map<string, PortfolioAsset>();

    for (const asset of perWallet.flat()) {
      const existing = bySymbol.get(asset.symbol);
      if (!existing) {
        // Copied, not referenced: the accumulator is mutated below, and doing
        // that to an object normalize() handed us would rewrite one wallet's
        // holdings to the combined figure.
        bySymbol.set(asset.symbol, { ...asset });
        continue;
      }
      existing.amount += asset.amount;
      existing.usdValue += asset.usdValue;
    }

    return [...bySymbol.values()];
  }
}
