import { Module } from "@nestjs/common";
import { PortfolioController } from "./portfolio.controller";
import { PortfolioService } from "./portfolio.service";
import { WalletModule } from "src/wallet/wallet.module";
import { PortfolioSnapshot } from "./portfolio.entity";
import { TypeOrmModule } from "@nestjs/typeorm";

// TODO (assignment): import WalletModule here so PortfolioService can
// inject WalletService. Example:
//   import { WalletModule } from '../wallet/wallet.module';
//   @Module({ imports: [WalletModule], ... })

@Module({
  controllers: [PortfolioController],
  providers: [PortfolioService],
  imports: [WalletModule, TypeOrmModule.forFeature([PortfolioSnapshot])], // Import WalletModule here so PortfolioService can inject WalletService
})
export class PortfolioModule {}
