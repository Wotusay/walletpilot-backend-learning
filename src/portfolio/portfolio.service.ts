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

  async getSummary(address: string) {
    const wallet = await this.walletService.getBalance(address);
    return {
      address,
      walletBalance: wallet.balance,
      holdings: [],
    };
  }
}
