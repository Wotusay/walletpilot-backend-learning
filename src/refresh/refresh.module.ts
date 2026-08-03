import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RefreshService } from "./refresh.service";
import { RefreshController } from "./refresh.controller";
import { PortfolioGateway } from "./portfolio.gateway";
import { WalletModule } from "src/wallet/wallet.module";
import { MarketDataModule } from "src/market-data/market-data.module";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";
import { Watchlist } from "src/alerts/watchlist.entity";

// Watchlist is registered here (not just in AlertsModule) so the cron can ask
// which addresses anyone is watching. It's the entity, not AlertsModule, so
// there's no import cycle with AlertsModule.
@Module({
  controllers: [RefreshController],
  providers: [RefreshService, PortfolioGateway],
  imports: [
    WalletModule,
    MarketDataModule,
    TypeOrmModule.forFeature([PortfolioSnapshot, Watchlist]),
  ],
  exports: [RefreshService], // AlertsService subscribes to the snapshot bus
})
export class RefreshModule {}
