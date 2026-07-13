import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MarketDataService } from "src/market-data/market-data.service";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";
import { WalletService } from "src/wallet/wallet.service";
import { Repository } from "typeorm";

@Injectable()
export class RefreshService {
  private readonly logger = new Logger(RefreshService.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly marketDataService: MarketDataService,
    private readonly snapshotRepository: Repository<PortfolioSnapshot>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  public async refresh() {
    const bal = await this.walletService.getBalance(
      '1',
    );

    const price = await this.marketDataService.getPrice("SOL");

    this.logger.log(`
        Balance: ${bal.balance}
        Price: ${price.price}
    `);

    await this.snapshotRepository.save({
        address: '1',
        totalValue: bal.balance * price.price,
        holdings: {
          SOL: {
            balance: bal.balance,
            price: price.price,
          },
        },
    })
  }
}
