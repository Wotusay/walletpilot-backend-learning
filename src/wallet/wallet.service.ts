import { Injectable } from "@nestjs/common";

@Injectable()
export class WalletService {
  // ASSIGNMENT (see README, Assignment 3): implement getBalance(address)
  // yourself — return a hardcoded { address, balance } object. A real
  // version would hit the DB / a chain RPC, but that's not the point here.
  ping(): string {
    return "WalletService is alive";
  }

  public getBalance(address: string): { address: string; balance: number } {
    return { address, balance: Math.floor(Math.random() * 1000) }; // Hardcoded balance for demonstration
  }
}
