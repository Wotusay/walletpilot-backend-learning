import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { MarketDataModule } from './market-data/market-data.module';
import { AiModule } from './ai/ai.module';
import { AlertsModule } from './alerts/alerts.module';

@Module({
  imports: [
    AuthModule,
    WalletModule,
    PortfolioModule,
    MarketDataModule,
    AiModule,
    AlertsModule,
  ],
})
export class AppModule {}
