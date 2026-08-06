import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WalletService } from "src/wallet/wallet.service";
import { PortfolioSnapshot } from "./portfolio.entity";

// How far back each named range looks. A month is 30 days on purpose — the
// snapshots are a plain time series, so a fixed window keeps the % change
// comparable between calls instead of drifting with the calendar.
const RANGE_MS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
} as const;

export type HistoryRange = keyof typeof RANGE_MS;

@Injectable()
export class PortfolioService {
  constructor(
    private readonly walletService: WalletService,
    @InjectRepository(PortfolioSnapshot)
    private readonly snapshotRepository: Repository<PortfolioSnapshot>,
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
}
