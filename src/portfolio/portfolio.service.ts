import { Injectable } from "@nestjs/common";
import { WalletService } from "src/wallet/wallet.service";

@Injectable()
export class PortfolioService {
  // ASSIGNMENT (see README, Assignment 3):
  // 1. Implement WalletService.getBalance(address) in wallet.service.ts
  //    (it's currently just a ping stub).
  // 2. Import WalletModule into PortfolioModule (portfolio.module.ts).
  // 3. Inject WalletService here via the constructor, e.g.:
  //      constructor(private readonly walletService: WalletService) {}
  // 4. Use it in getSummary() below to include the wallet balance
  //    in the portfolio summary.

  constructor(private readonly walletService: WalletService) {}

  getSummary(address: string) {
    return {
      address,
      // TODO: replace this hardcoded value by calling walletService.getBalance(address)
      walletBalance: this.walletService.getBalance(address).balance,
      holdings: [],
    };
  }
}
