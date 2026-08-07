import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NormalizationModule } from "src/normalization/normalization.module";
import { WalletModule } from "src/wallet/wallet.module";
import { PortfolioController } from "./portfolio.controller";
import { PortfolioSnapshot } from "./portfolio.entity";
import { PortfolioService } from "./portfolio.service";
import { WatchedWallet } from "./watched-wallet.entity";

@Module({
  controllers: [PortfolioController],
  providers: [PortfolioService],
  imports: [
    WalletModule, // WalletService, for the single-wallet summary
    // NormalizationService + computeMetrics, for the combined view. No cycle:
    // NormalizationModule only imports WalletModule and MarketDataModule.
    NormalizationModule,
    TypeOrmModule.forFeature([PortfolioSnapshot, WatchedWallet]),
  ],
})
export class PortfolioModule {}
