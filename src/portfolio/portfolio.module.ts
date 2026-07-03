import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

// TODO (assignment): import WalletModule here so PortfolioService can
// inject WalletService. Example:
//   import { WalletModule } from '../wallet/wallet.module';
//   @Module({ imports: [WalletModule], ... })

@Module({
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
