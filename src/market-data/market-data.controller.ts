import { Controller, Get } from '@nestjs/common';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketdataService: MarketDataService) {}

  @Get('ping')
  ping() {
    return this.marketdataService.ping();
  }
}
