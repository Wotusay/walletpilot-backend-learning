import { Injectable, Logger } from "@nestjs/common";
import { AssetType, classifyAsset } from "./types/asset-type";
import { WalletService } from "src/wallet/wallet.service";
import { MarketDataService } from "src/market-data/market-data.service";

export interface PortfolioAsset {
  symbol: string;
  type: AssetType;
  amount: number;
  usdValue: number;
}

export interface AllocationByAsset {
  symbol: string;
  pct: number;
}

export interface AllocationByType {
  type: AssetType;
  pct: number;
}

export interface PortfolioMetrics {
  totalUsdValue: number;
  allocationByAsset: AllocationByAsset[];
  allocationByType: AllocationByType[];
}

@Injectable()
export class NormalizationService {
  private readonly logger = new Logger(NormalizationService.name);

  private readonly assetTypeMapping: { [mint: string]: string } = {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": "USDC",
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  };

  constructor(
    private readonly walletService: WalletService,
    private readonly marketDataService: MarketDataService,
  ) {}

  private mintToSymbol(mint: string): string | undefined {
    return this.assetTypeMapping[mint];
  }

  async normalize(address: string): Promise<PortfolioAsset[]> {
    const assets: PortfolioAsset[] = [];

    // SOL
    const sol = await this.walletService.getBalance(address);
    const solPrice = await this.marketDataService.getPrice("SOL");
    assets.push({
      symbol: "SOL",
      type: AssetType.Crypto,
      amount: sol.balance,
      usdValue: sol.balance * solPrice.price,
    });

    // SPL Tokens

    const tokens = (await this.walletService.getTokenBalances(address)) as {
      mint: string;
      tokenAmount: number | null;
      decimals: number;
    }[];

    const splAssets = await Promise.all(
      tokens.map(async (token) => {
        const amount = token.tokenAmount ?? 0;
        // Unknown mints still count toward "all balances" — fall back to the
        // mint address as the symbol and leave usdValue at 0 (no price feed).
        const symbol = this.mintToSymbol(token.mint) ?? token.mint;

        let usdValue = 0;

        if (this.mintToSymbol(token.mint)) {
          try {
            const { price } = await this.marketDataService.getPrice(symbol);
            usdValue = amount * price;
          } catch (error) {
            this.logger.warn(
              `No price data for symbol ${symbol}; setting USD value to 0`,
            );
          }
        }

        return {
          symbol,
          type: classifyAsset(token.mint),
          amount,
          usdValue,
        };
      }),
    );

    assets.push(...splAssets);

    return assets;
  }

  computeMetrics(assets: PortfolioAsset[]): PortfolioMetrics {
    const total = assets.reduce((sum, asset) => sum + asset.usdValue, 0);
    const pct = (v: number) => (total === 0 ? 0 : (v / total) * 100);

    const byType = new Map<AssetType, number>();
    assets.forEach((asset) =>
      byType.set(asset.type, (byType.get(asset.type) ?? 0) + asset.usdValue),
    );

    return {
      totalUsdValue: total,
      allocationByAsset: assets.map((asset) => ({
        symbol: asset.symbol,
        pct: pct(asset.usdValue),
      })),
      allocationByType: Array.from(byType.entries()).map(([type, value]) => ({
        type,
        pct: pct(value),
      })),
    };
  }
}
