import { CACHE_MANAGER } from "@nestjs/cache-manager";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Cache } from "cache-manager";

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly coinGeckoApiUrl = "https://api.coingecko.com/api/v3/simple";
  private readonly PRICE_CACHE_TTL = 45000; // 45 seconds in milliseconds

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  private symbolToIdMap: { [symbol: string]: string } = {
    SOL: "solana",
    BTC: "bitcoin",
    ETH: "ethereum",
    USDT: "tether",
    USDC: "usd-coin",
  };

  private toSymbolMap(symbol: string) {
    const symbolMapped = this.symbolToIdMap[symbol.toUpperCase()];
    if (!symbolMapped) {
      throw new BadRequestException(`Unsupported symbol: ${symbol}`);
    }
    return symbolMapped;
  }

  public async getPrice(
    symbol: string,
  ): Promise<{ symbol: string; price: number }> {
    const cacheKey = `price:${symbol.toUpperCase()}`;

    // Step 1: Check cache
    const cachedPrice = await this.cache.get<number>(cacheKey);
    if (cachedPrice !== undefined) {
      this.logger.log(`cache HIT for ${cacheKey}`);
      return {
        symbol: symbol.toUpperCase(),
        price: cachedPrice,
      };
    }

    this.logger.log(`cache MISS for ${cacheKey}`);

    // Step 2: Fetch from external API
    const id = this.toSymbolMap(symbol);
    const response = await fetch(
      `${this.coinGeckoApiUrl}/price?ids=${id}&vs_currencies=usd`,
    );

    const json = await response.json();
    const price = json[id].usd;

    // Step 3: Store in cache
    await this.cache.set(cacheKey, price, this.PRICE_CACHE_TTL);

    return {
      symbol: symbol.toUpperCase(),
      price,
    };
  }
}
