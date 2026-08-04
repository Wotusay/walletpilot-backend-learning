import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Observable, Subject, Subscription } from "rxjs";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";
import { RefreshService } from "src/refresh/refresh.service";
import { Repository } from "typeorm";
import { Alert } from "./alert.entity";
import { CreateWatchlistDto } from "./dto/create-watchlist.dto";
import { Watchlist, WatchlistRule } from "./watchlist.entity";

@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsService.name);

  // Fired alerts, for transports that want them live (AlertsGateway). Same
  // read-only-getter discipline as RefreshService.snapshots: only evaluate()
  // may push onto the bus.
  private readonly alerts$ = new Subject<Alert>();

  private busSubscription?: Subscription;

  constructor(
    private readonly refreshService: RefreshService,
    @InjectRepository(Watchlist)
    private readonly watchlists: Repository<Watchlist>,
    @InjectRepository(Alert)
    private readonly alerts: Repository<Alert>,
  ) {}

  // Hang off the snapshot bus rather than adding a second scheduler: every
  // snapshot RefreshService saves (cron tick or on-demand POST) is checked
  // against the rules armed for that address.
  onModuleInit(): void {
    this.busSubscription = this.refreshService.snapshots.subscribe(
      (snapshot: PortfolioSnapshot) => {
        // A rejected evaluate() must not tear down the subscription — one bad
        // tick would otherwise silently kill alerting for the whole process.
        void this.evaluate(snapshot).catch((err) =>
          this.logger.error(
            `Alert evaluation failed for ${snapshot.address}`,
            err as Error,
          ),
        );
      },
    );
  }

  onModuleDestroy(): void {
    this.busSubscription?.unsubscribe();
  }

  public get stream(): Observable<Alert> {
    return this.alerts$.asObservable();
  }

  // Check every armed rule for this snapshot's address and persist the ones
  // that just crossed. Returns what it fired so tests can assert on it directly.
  public async evaluate(snapshot: PortfolioSnapshot): Promise<Alert[]> {
    const rules = await this.watchlists.find({
      where: { address: snapshot.address, active: true },
    });

    const fired: Alert[] = [];

    for (const rule of rules) {
      const observed = this.observedValue(rule.rule, snapshot);
      if (observed === undefined) continue; // snapshot has no data for this rule

      const breached = this.isBreached(rule, observed);

      // Edge-triggered: only the armed → breached transition fires. Staying
      // breached is silent, and recovering re-arms the rule without an alert.
      if (breached === rule.breached) continue;

      rule.breached = breached;
      await this.watchlists.save(rule);
      if (!breached) continue;

      const alert = await this.alerts.save({
        owner: rule.owner,
        address: rule.address,
        watchlistId: rule.id,
        rule: rule.rule,
        threshold: rule.threshold,
        observedValue: observed,
        message: this.describe(rule, observed),
      });

      this.logger.warn(`Alert fired: ${alert.message}`);
      this.alerts$.next(alert);
      fired.push(alert);
    }

    return fired;
  }

  public async createWatchlist(
    owner: string,
    dto: CreateWatchlistDto,
  ): Promise<Watchlist> {
    if (!Object.values(WatchlistRule).includes(dto.rule)) {
      throw new BadRequestException(
        `rule must be one of: ${Object.values(WatchlistRule).join(", ")}`,
      );
    }
    const threshold = Number(dto.threshold);
    if (!Number.isFinite(threshold)) {
      throw new BadRequestException("threshold must be a finite number");
    }

    return this.watchlists.save({
      owner,
      address: dto.address?.trim() || owner,
      rule: dto.rule,
      threshold,
      active: true,
      // Deliberately starts armed even if the wallet is already past the
      // threshold: the first refresh then fires immediately, which is what
      // makes a freshly created rule testable without waiting for a crossing.
      breached: false,
    });
  }

  public listWatchlists(owner: string): Promise<Watchlist[]> {
    return this.watchlists.find({
      where: { owner },
      order: { createdAt: "DESC" },
    });
  }

  // Scoped by owner, so one wallet can never delete another's rule — an id-only
  // lookup would leak deletion across accounts.
  public async removeWatchlist(owner: string, id: string): Promise<void> {
    const result = await this.watchlists.delete({ id, owner });
    if (!result.affected) {
      throw new NotFoundException(`No watchlist ${id} for this wallet`);
    }
  }

  public listAlerts(owner: string, limit = 50): Promise<Alert[]> {
    return this.alerts.find({
      where: { owner },
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  // The balance rules read the SOL holding, the value rules read the USD total.
  // `undefined` means the snapshot can't answer this rule (e.g. no SOL entry),
  // which is different from "0" and must not be treated as a crossing.
  private observedValue(
    rule: WatchlistRule,
    snapshot: PortfolioSnapshot,
  ): number | undefined {
    switch (rule) {
      case WatchlistRule.SolBalanceBelow:
      case WatchlistRule.SolBalanceAbove: {
        const balance = snapshot.holdings?.SOL?.balance;
        return typeof balance === "number" ? balance : undefined;
      }
      case WatchlistRule.TotalValueBelow:
      case WatchlistRule.TotalValueAbove:
        return typeof snapshot.totalValue === "number"
          ? snapshot.totalValue
          : undefined;
    }
  }

  private isBreached(rule: Watchlist, observed: number): boolean {
    switch (rule.rule) {
      case WatchlistRule.SolBalanceBelow:
      case WatchlistRule.TotalValueBelow:
        return observed < rule.threshold;
      case WatchlistRule.SolBalanceAbove:
      case WatchlistRule.TotalValueAbove:
        return observed > rule.threshold;
    }
  }

  private describe(rule: Watchlist, observed: number): string {
    const unit = rule.rule.startsWith("SOL_BALANCE") ? "SOL" : "USD";
    const direction = rule.rule.endsWith("BELOW") ? "dropped below" : "rose above";
    const subject = unit === "SOL" ? "SOL balance" : "total value";
    return `${rule.address}: ${subject} ${direction} ${rule.threshold} ${unit} (now ${observed} ${unit})`;
  }
}
