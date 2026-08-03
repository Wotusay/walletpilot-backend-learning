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
import { Watchlist } from "src/alerts/watchlist.entity";

@Injectable()
export class RefreshService {
  private readonly logger = new Logger(RefreshService.name);

  // In-process event bus: every saved snapshot is pushed here so live
  // subscribers (SSE per address, the WebSocket gateway) get it. A singleton
  // service means the cron and the on-demand POST share the same bus.
  private readonly snapshots$ = new Subject<PortfolioSnapshot>();

  constructor(
    private readonly walletService: WalletService,
    private readonly marketDataService: MarketDataService,
    private readonly config: ConfigService,
    @InjectRepository(PortfolioSnapshot)
    private readonly snapshotRepository: Repository<PortfolioSnapshot>,
    @InjectRepository(Watchlist)
    private readonly watchlistRepository: Repository<Watchlist>,
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

  // Background job — every minute, refresh the default wallet plus any wallet
  // someone has a watchlist rule on. Still the only scheduler in the app: the
  // alert checks ride on the snapshots this produces.
  @Cron(CronExpression.EVERY_MINUTE)
  public async refresh() {
    for (const address of await this.watchedAddresses()) {
      // Sequential, and one failure must not skip the rest of the tick: devnet
      // RPC is rate-limited, and WalletService caches for 45s anyway.
      try {
        await this.refreshWallet(address);
      } catch (err) {
        this.logger.error(`Refresh failed for ${address}`, err as Error);
      }
    }
  }

  // Distinct addresses this tick should cover.
  private async watchedAddresses(): Promise<string[]> {
    const rules = await this.watchlistRepository.find({
      where: { active: true },
      select: { address: true },
    });
    return [
      ...new Set([
        this.config.get<string>("defaultWallet")!,
        ...rules.map((rule) => rule.address),
      ]),
    ];
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

  // Unfiltered stream of every saved snapshot, for transports that fan out
  // themselves (PortfolioGateway routes each one to its per-address room).
  // Read-only on purpose: only refreshWallet() may push onto the bus.
  public get snapshots(): Observable<PortfolioSnapshot> {
    return this.snapshots$.asObservable();
  }
}
