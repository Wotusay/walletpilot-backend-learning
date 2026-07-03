import { Injectable } from '@nestjs/common';

@Injectable()
export class WalletService {
  // ASSIGNMENT (see README, Assignment 3): implement getBalance(address)
  // yourself — return a hardcoded { address, balance } object. A real
  // version would hit the DB / a chain RPC, but that's not the point here.
  ping(): string {
    return 'WalletService is alive';
  }
}
