import { Controller, Get, Param } from "@nestjs/common";
import { WalletService } from "./wallet.service";

@Controller("wallet")
export class WalletController {
  // Notice: the controller just delegates to the service. It doesn't
  // know *how* the balance is fetched — that's the service's job.
  // ASSIGNMENT (see README, Assignment 3): add a GET :address/balance
  // route here once WalletService.getBalance() exists.
  constructor(private readonly walletService: WalletService) {}

  @Get("ping")
  ping() {
    return this.walletService.ping();
  }

  @Get(":address/balance")
  getBalance(@Param("address") address: string) {
    return this.walletService.getBalance(address);
  }
}
