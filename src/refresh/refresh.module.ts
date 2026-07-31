import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RefreshService } from "./refresh.service";
import { RefreshController } from "./refresh.controller";
import { PortfolioGateway } from "./portfolio.gateway";
import { WalletModule } from "src/wallet/wallet.module";
import { MarketDataModule } from "src/market-data/market-data.module";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";

@Module({
  controllers: [RefreshController],
  providers: [RefreshService, PortfolioGateway],
  imports: [
    WalletModule,
    MarketDataModule,
    TypeOrmModule.forFeature([PortfolioSnapshot]),
  ],
})
export class RefreshModule {}
