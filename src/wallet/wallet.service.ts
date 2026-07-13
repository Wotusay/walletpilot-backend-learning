import {
  BadRequestException,
  Injectable,
  Inject,
  Logger,
} from "@nestjs/common";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";

@Injectable()
export class WalletService {
  // ASSIGNMENT (see README, Assignment 3): implement getBalance(address)
  // yourself — return a hardcoded { address, balance } object. A real
  // version would hit the DB / a chain RPC, but that's not the point here.

  private readonly connection = new Connection(
    clusterApiUrl("devnet"),
    "confirmed",
  );

  private publickey: PublicKey | null = null;
  private readonly logger = new Logger(WalletService.name);
  private readonly CACHE_TTL = 45000; // 45 seconds in milliseconds

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  public async getBalance(
    address: string,
  ): Promise<{ address: string; balance: number }> {
    const cacheKey = `balance:${address}`;

    // Step 1: Try to get from cache
    const cachedBalance = await this.cache.get<number>(cacheKey);
    if (cachedBalance !== undefined) {
      this.logger.log(`cache HIT for key: ${cacheKey}`);
      return { address, balance: cachedBalance };
    }

    this.logger.log(`cache MISS for key: ${cacheKey}`);

    // Step 2: Call the expensive operation
    try {
      this.publickey = new PublicKey(address);
    } catch (error) {
      throw new BadRequestException(`Invalid Solana address: ${address}`);
    }

    const lamports = await this.connection.getBalance(this.publickey);
    const balance = lamports / LAMPORTS_PER_SOL; // Convert lamports to SOL

    // Step 3: Store in cache
    await this.cache.set(cacheKey, balance, this.CACHE_TTL);

    return { address, balance };
  }

  public async getTokenBalances(address: string) {
    const cacheKey = `tokenBalances:${address}`;

    // Step 1: Try to get from cache
    const cachedTokenBalances = await this.cache.get(cacheKey);
    if (cachedTokenBalances !== undefined) {
      this.logger.log(`cache HIT for key: ${cacheKey}`);
      return cachedTokenBalances;
    }

    this.logger.log(`cache MISS for key: ${cacheKey}`);

    // Step 2: Call the expensive operation
    const owner = new PublicKey(address);

    const response = await this.connection.getParsedTokenAccountsByOwner(
      owner,
      {
        programId: TOKEN_PROGRAM_ID,
      },
    );

    const tokenBalances = response.value.map((tokenAccount) => {
      const info = tokenAccount.account.data.parsed.info;

      return {
        mint: info.mint,
        tokenAmount: info.tokenAmount.uiAmount,
        decimals: info.tokenAmount.decimals,
      };
    });

    // Step 3: Store in cache
    await this.cache.set(cacheKey, tokenBalances, this.CACHE_TTL);

    return tokenBalances;
  }

  public async getTransactionsHistory(address: string) {
    const cacheKey = `transactions:${address}`;

    // Step 1: Try to get from cache
    const cachedTransactions = await this.cache.get(cacheKey);
    if (cachedTransactions !== undefined) {
      this.logger.log(`cache HIT for key: ${cacheKey}`);
      return cachedTransactions;
    }

    this.logger.log(`cache MISS for key: ${cacheKey}`);

    // Step 2: Call the expensive operation
    const publicKey = new PublicKey(address);
    const signatures = await this.connection.getSignaturesForAddress(
      publicKey,
      { limit: 10 },
    );

    // Step 3: Store in cache
    await this.cache.set(cacheKey, signatures, this.CACHE_TTL);

    return signatures;
  }
}
