import { Controller, Get, Param } from "@nestjs/common";
import { MarketDataService } from "./market-data.service";

@Controller("market-data")
export class MarketDataController {
  constructor(private readonly marketdataService: MarketDataService) {}

  @Get("price/:symbol")
  getPrice(@Param("symbol") symbol: string) {
    return this.marketdataService.getPrice(symbol);
  }
}
