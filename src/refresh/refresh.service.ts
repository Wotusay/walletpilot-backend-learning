import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { MarketDataService } from "src/market-data/market-data.service";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";
import { WalletService } from "src/wallet/wallet.service";
import { Subject, Observable } from "rxjs";
import { filter, map } from "rxjs/operators";
import { Repository } from "typeorm";

@Injectable()
export class RefreshService {
  private readonly logger = new Logger(RefreshService.name);

  // In-process event bus: every saved snapshot is pushed here so SSE
  // subscribers (per address) get it live. A singleton service means the cron
  // and the on-demand POST share the same bus.
  private readonly snapshots$ = new Subject<PortfolioSnapshot>();

  constructor(
    private readonly walletService: WalletService,
    private readonly marketDataService: MarketDataService,
    private readonly config: ConfigService,
    @InjectRepository(PortfolioSnapshot)
    private readonly snapshotRepository: Repository<PortfolioSnapshot>,
  ) {}

  // Fetch balance + price for one wallet, persist a snapshot, and broadcast it.
  public async refreshWallet(address: string): Promise<PortfolioSnapshot> {
    const bal = await this.walletService.getBalance(address);
    const price = await this.marketDataService.getPrice("SOL");

    this.logger.log(
      `Refreshed ${address} — balance: ${bal.balance} price: ${price.price}`,
    );

    const snapshot = await this.snapshotRepository.save({
      address,
      totalValue: bal.balance * price.price,
      holdings: {
        SOL: {
          balance: bal.balance,
          price: price.price,
        },
      },
    });

    this.snapshots$.next(snapshot);
    return snapshot;
  }

  // Background job — refreshes the configured default wallet every minute.
  @Cron(CronExpression.EVERY_MINUTE)
  public async refresh() {
    await this.refreshWallet(this.config.get<string>("defaultWallet")!);
  }

  // Oldest → newest so the chart can plot left-to-right directly.
  public getHistory(address: string, limit = 60): Promise<PortfolioSnapshot[]> {
    return this.snapshotRepository.find({
      where: { address },
      order: { createdAt: "ASC" },
      take: limit,
    });
  }

  // Live stream of new snapshots for one address, shaped for @Sse().
  public stream(address: string): Observable<{ data: PortfolioSnapshot }> {
    return this.snapshots$.pipe(
      filter((snapshot) => snapshot.address === address),
      map((snapshot) => ({ data: snapshot })),
    );
  }
}
