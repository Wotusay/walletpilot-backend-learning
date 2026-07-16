import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { WalletService } from "./wallet.service";
import { JwtGuard } from "src/auth/guards/jwt.guard";

@Controller("wallet")
@UseGuards(JwtGuard)
export class WalletController {
  // Notice: the controller just delegates to the service. It doesn't
  // know *how* the balance is fetched — that's the service's job.
  // ASSIGNMENT (see README, Assignment 3): add a GET :address/balance
  // route here once WalletService.getBalance() exists.
  constructor(private readonly walletService: WalletService) {}

  @Get(":address/balance")
  getBalance(@Param("address") address: string) {
    return this.walletService.getBalance(address);
  }

  @Get(":address/tokens")
  getTokens(@Param("address") address: string) {
    return this.walletService.getTokenBalances(address);
  }

  @Get(":address/transactions")
  getTransactions(@Param("address") address: string) {
    return this.walletService.getTransactionsHistory(address);
  }
}
