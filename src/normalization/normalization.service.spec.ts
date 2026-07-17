import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { NormalizationService } from "./normalization.service";
import { WalletService } from "../wallet/wallet.service";
import { MarketDataService } from "../market-data/market-data.service";
import { AssetType } from "./types/asset-type";

// A real devnet USDC mint from the service's assetTypeMapping.
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const UNKNOWN_MINT = "SomeRandomMint1111111111111111111111111111";

describe("NormalizationService.normalize", () => {
  let service: NormalizationService;
  const wallet = {
    getBalance: jest.fn<(address: string) => Promise<any>>(),
    getTokenBalances: jest.fn<(address: string) => Promise<any>>(),
  };
  const market = {
    getPrice: jest.fn<(symbol: string) => Promise<any>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NormalizationService,
        { provide: WalletService, useValue: wallet },
        { provide: MarketDataService, useValue: market },
      ],
    }).compile();
    service = moduleRef.get(NormalizationService);
  });

  it("returns SOL plus every SPL token, including unknown mints", async () => {
    wallet.getBalance.mockResolvedValue({ address: "addr", balance: 2 });
    wallet.getTokenBalances.mockResolvedValue([
      { mint: USDC_MINT, tokenAmount: 50, decimals: 6 },
      { mint: UNKNOWN_MINT, tokenAmount: 10, decimals: 9 },
    ]);
    market.getPrice.mockImplementation(async (symbol: string) => ({
      symbol,
      price: symbol === "SOL" ? 100 : symbol === "USDC" ? 1 : 0,
    }));

    const assets = await service.normalize("addr");

    // Regression guard for the old `forEach(async …)` bug that dropped tokens:
    // SOL + 2 SPL tokens = 3 assets, none silently lost.
    expect(assets).toHaveLength(3);

    const sol = assets.find((a) => a.symbol === "SOL");
    expect(sol).toMatchObject({ amount: 2, usdValue: 200, type: AssetType.Crypto });

    const usdc = assets.find((a) => a.symbol === "USDC");
    expect(usdc).toMatchObject({ amount: 50, usdValue: 50 });

    // Unknown mint is INCLUDED (not skipped): symbol falls back to the mint,
    // usdValue stays 0 because there is no price feed for it.
    const unknown = assets.find((a) => a.symbol === UNKNOWN_MINT);
    expect(unknown).toBeDefined();
    expect(unknown?.usdValue).toBe(0);
  });
});
