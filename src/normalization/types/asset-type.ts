export enum AssetType {
  Crypto = "Crypto",
  Stablecoin = "Stablecoin",
  TokenizedEquity = "TokenizedEquity",
  NFT = "NFT",
}

const STABLECOIN_MINTS = new Set<string>([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // mainnet USDC
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // devnet USDC
]);

export function classifyAsset(mint: string): AssetType {
  if (STABLECOIN_MINTS.has(mint)) return AssetType.Stablecoin;
  return AssetType.Crypto; // TokenizedEquity / NFT left as stubs for now
}
