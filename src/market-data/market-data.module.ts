import { Module } from '@nestjs/common';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

@Module({
  controllers: [MarketDataController],
  providers: [MarketDataService],
  exports: [MarketDataService], // Export MarketDataService so other modules can inject it
})
export class MarketDataModule {}
