import {
  BadRequestException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
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
import bs58 from "bs58";

/** One instruction, flattened to just what an explanation needs. */
export interface ParsedInstructionSummary {
  programId: string;
  program: string | null; // only set when the RPC could parse the program
  type: string | null; // e.g. "transfer", "createAccount"
  info: Record<string, unknown> | null; // parsed args; null for unparsed programs
}

export interface BalanceChange {
  account: string;
  changeSol: number;
}

export interface TokenBalanceChange {
  account: string;
  mint: string;
  owner: string | null;
  change: number; // in UI units (already decimal-adjusted)
}

/**
 * A trimmed view of getParsedTransaction. The raw RPC response carries
 * logMessages, innerInstructions, loadedAddresses and every account key —
 * hundreds of lines that cost tokens and give the model more to hallucinate
 * around. This keeps only what "what happened here" actually needs.
 */
export interface ParsedTransactionSummary {
  signature: string;
  slot: number;
  blockTime: number | null;
  success: boolean;
  err: unknown;
  feeSol: number;
  instructions: ParsedInstructionSummary[];
  solBalanceChanges: BalanceChange[];
  tokenBalanceChanges: TokenBalanceChange[];
}

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
  // A confirmed transaction is immutable, so there is nothing to go stale —
  // it can be cached far longer than a balance.
  private readonly TX_CACHE_TTL = 600000; // 10 minutes

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

  /**
   * Fetch one transaction and flatten it to the bits that describe what it did.
   * getSignaturesForAddress only gives us signatures — this is the call that
   * actually says what happened inside them.
   */
  public async getParsedTransaction(
    signature: string,
  ): Promise<ParsedTransactionSummary> {
    // Fail fast on garbage input so we don't spend an RPC round-trip on it.
    // A Solana signature is 64 raw bytes, base58-encoded.
    let decoded: Uint8Array;
    try {
      decoded = bs58.decode(signature);
    } catch {
      throw new BadRequestException(
        `Invalid transaction signature: ${signature}`,
      );
    }
    if (decoded.length !== 64)
      throw new BadRequestException(
        `Invalid transaction signature: ${signature}`,
      );

    const cacheKey = `tx:${signature}`;

    // Step 1: Try to get from cache
    const cached =
      await this.cache.get<ParsedTransactionSummary>(cacheKey);
    if (cached !== undefined) {
      this.logger.log(`cache HIT for key: ${cacheKey}`);
      return cached;
    }

    this.logger.log(`cache MISS for key: ${cacheKey}`);

    // Step 2: Call the expensive operation.
    // maxSupportedTransactionVersion: 0 — without it the RPC throws on any
    // versioned (v0) transaction instead of returning it.
    const tx = await this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    // null means the RPC has never seen it: wrong cluster, or older than the
    // node's history window.
    if (!tx)
      throw new NotFoundException(
        `Transaction not found on devnet: ${signature}`,
      );

    const summary = this.summarizeTransaction(signature, tx);

    // Step 3: Store in cache
    await this.cache.set(cacheKey, summary, this.TX_CACHE_TTL);

    return summary;
  }

  /** Map the raw RPC response down to ParsedTransactionSummary. */
  private summarizeTransaction(
    signature: string,
    tx: any,
  ): ParsedTransactionSummary {
    const accountKeys: string[] = (
      tx.transaction?.message?.accountKeys ?? []
    ).map((key: any) => String(key.pubkey ?? key));

    const instructions: ParsedInstructionSummary[] = (
      tx.transaction?.message?.instructions ?? []
    ).map((ix: any) => ({
      programId: String(ix.programId),
      // `program` and `parsed` only exist when the RPC recognised the program.
      // For everything else we deliberately keep just the programId and drop
      // the opaque `data` blob — it tells the model nothing it can use.
      program: ix.program ?? null,
      type: ix.parsed?.type ?? null,
      info: ix.parsed?.info ?? null,
    }));

    const pre: number[] = tx.meta?.preBalances ?? [];
    const post: number[] = tx.meta?.postBalances ?? [];
    const solBalanceChanges: BalanceChange[] = accountKeys
      .map((account, i) => ({
        account,
        changeSol: ((post[i] ?? 0) - (pre[i] ?? 0)) / LAMPORTS_PER_SOL,
      }))
      .filter((change) => change.changeSol !== 0);

    // Token balances are keyed by accountIndex + mint, and an account can
    // appear in only one of the two lists (a token account created or closed
    // by this transaction), so index both sides and walk the union.
    const keyOf = (b: any) => `${b.accountIndex}:${b.mint}`;
    const preTokens = new Map<string, any>(
      (tx.meta?.preTokenBalances ?? []).map((b: any) => [keyOf(b), b]),
    );
    const postTokens = new Map<string, any>(
      (tx.meta?.postTokenBalances ?? []).map((b: any) => [keyOf(b), b]),
    );

    const tokenBalanceChanges: TokenBalanceChange[] = [
      ...new Set([...preTokens.keys(), ...postTokens.keys()]),
    ]
      .map((key) => {
        const before = preTokens.get(key);
        const after = postTokens.get(key);
        const ref = after ?? before;
        return {
          account: accountKeys[ref.accountIndex] ?? String(ref.accountIndex),
          mint: ref.mint,
          owner: ref.owner ?? null,
          change:
            (after?.uiTokenAmount?.uiAmount ?? 0) -
            (before?.uiTokenAmount?.uiAmount ?? 0),
        };
      })
      .filter((change) => change.change !== 0);

    return {
      signature,
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
      success: tx.meta?.err == null,
      err: tx.meta?.err ?? null,
      feeSol: (tx.meta?.fee ?? 0) / LAMPORTS_PER_SOL,
      instructions,
      solBalanceChanges,
      tokenBalanceChanges,
    };
  }
}
