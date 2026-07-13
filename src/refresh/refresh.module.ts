import { Module } from "@nestjs/common";
import { RefreshService } from "./refresh.service";
import { WalletModule } from "src/wallet/wallet.module";
import { MarketDataModule } from "src/market-data/market-data.module";

@Module({
  providers: [RefreshService],
  imports: [WalletModule, MarketDataModule], // Import WalletModule here so RefreshService can inject WalletService
})
export class RefreshModule {}
