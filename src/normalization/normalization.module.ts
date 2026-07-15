import { Module } from "@nestjs/common";
import { WalletModule } from "src/wallet/wallet.module";
import { MarketDataModule } from "src/market-data/market-data.module";
import { NormalizationService } from "./normalization.service";

@Module({
  providers: [NormalizationService],
  imports: [WalletModule, MarketDataModule],
  exports: [NormalizationService], // Exported so other modules (e.g. Portfolio) can inject NormalizationService.
})
export class NormalizationModule {}
