import { Injectable } from "@nestjs/common";

@Injectable()
export class MarketDataService {
  // Stub for now — this module isn't the focus of Topic 1.
  // It exists so the app wiring (AppModule) is realistic.
  public ping(): string {
    return "MarketDataService is alive";
  }

  public getPrice(symbol: string): { symbol: string; price: number } {
    return { symbol, price: 100 };
  }
}
