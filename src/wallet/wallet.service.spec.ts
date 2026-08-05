import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import bs58 from "bs58";

import { WalletService } from "./wallet.service";

// A signature is 64 raw bytes, base58-encoded. Building it from bytes keeps
// the fixture obviously valid instead of a copy-pasted magic string.
const SIG = bs58.encode(Buffer.alloc(64, 7));

// The shape getParsedTransaction returns: one parsed system transfer that moved
// 0.5 SOL from account A to account B, plus a 0.000005 SOL fee paid by A.
const RAW_TX = {
  slot: 42,
  blockTime: 1_700_000_000,
  meta: {
    err: null,
    fee: 5000,
    preBalances: [2_000_000_000, 0],
    postBalances: [1_499_995_000, 500_000_000],
    preTokenBalances: [],
    postTokenBalances: [],
  },
  transaction: {
    message: {
      accountKeys: [{ pubkey: "AAA" }, { pubkey: "BBB" }],
      instructions: [
        {
          programId: "11111111111111111111111111111111",
          program: "system",
          parsed: { type: "transfer", info: { lamports: 500_000_000 } },
        },
      ],
    },
  },
};

describe("WalletService.getParsedTransaction", () => {
  let service: WalletService;
  const cache = {
    get: jest.fn<(...args: any[]) => Promise<any>>(),
    set: jest.fn<(...args: any[]) => Promise<any>>(),
  };
  // `connection` is a private field initializer rather than an injected
  // provider, so this is the only seam available. Making Connection a DI
  // provider would be the cleaner long-term fix.
  const connection = {
    getParsedTransaction: jest.fn<(...args: any[]) => Promise<any>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [WalletService, { provide: CACHE_MANAGER, useValue: cache }],
    }).compile();
    service = moduleRef.get(WalletService);
    (service as any).connection = connection;
  });

  it("rejects a malformed signature without touching the RPC", async () => {
    await expect(service.getParsedTransaction("not-a-signature")).rejects.toThrow(
      BadRequestException,
    );
    expect(connection.getParsedTransaction).not.toHaveBeenCalled();
  });

  it("rejects a well-formed base58 string that isn't 64 bytes", async () => {
    // Valid base58, wrong length — this is the case a naive charset regex misses.
    await expect(
      service.getParsedTransaction(bs58.encode(Buffer.alloc(32, 7))),
    ).rejects.toThrow(BadRequestException);
    expect(connection.getParsedTransaction).not.toHaveBeenCalled();
  });

  it("returns the cached summary without calling the RPC", async () => {
    const cached = { signature: SIG, slot: 1 };
    cache.get.mockResolvedValue(cached);

    await expect(service.getParsedTransaction(SIG)).resolves.toBe(cached);
    expect(connection.getParsedTransaction).not.toHaveBeenCalled();
  });

  it("fetches, trims and caches on a cache miss", async () => {
    cache.get.mockResolvedValue(undefined);
    connection.getParsedTransaction.mockResolvedValue(RAW_TX);

    const result = await service.getParsedTransaction(SIG);

    // Without maxSupportedTransactionVersion the RPC throws on any v0
    // transaction instead of returning it.
    expect(connection.getParsedTransaction).toHaveBeenCalledWith(SIG, {
      maxSupportedTransactionVersion: 0,
    });
    expect(result).toEqual({
      signature: SIG,
      slot: 42,
      blockTime: 1_700_000_000,
      success: true,
      err: null,
      feeSol: 0.000005,
      instructions: [
        {
          programId: "11111111111111111111111111111111",
          program: "system",
          type: "transfer",
          info: { lamports: 500_000_000 },
        },
      ],
      // Sender is down 0.5 SOL plus the fee; receiver is up 0.5 SOL.
      solBalanceChanges: [
        { account: "AAA", changeSol: -0.500005 },
        { account: "BBB", changeSol: 0.5 },
      ],
      tokenBalanceChanges: [],
    });
    expect(cache.set).toHaveBeenCalledWith(`tx:${SIG}`, result, 600000);
  });

  it("keeps unparsed instructions as a bare programId", async () => {
    cache.get.mockResolvedValue(undefined);
    connection.getParsedTransaction.mockResolvedValue({
      ...RAW_TX,
      transaction: {
        message: {
          ...RAW_TX.transaction.message,
          // No `program`/`parsed` — the RPC couldn't decode this one. The
          // opaque `data` blob must not survive the trim.
          instructions: [{ programId: "SomeUnknownProgram", data: "3Bxs4h" }],
        },
      },
    });

    const result = await service.getParsedTransaction(SIG);

    expect(result.instructions).toEqual([
      {
        programId: "SomeUnknownProgram",
        program: null,
        type: null,
        info: null,
      },
    ]);
  });

  it("reports token balance deltas in UI units", async () => {
    cache.get.mockResolvedValue(undefined);
    connection.getParsedTransaction.mockResolvedValue({
      ...RAW_TX,
      meta: {
        ...RAW_TX.meta,
        preBalances: [0, 0],
        postBalances: [0, 0],
        preTokenBalances: [
          {
            accountIndex: 1,
            mint: "MINT",
            owner: "BBB",
            uiTokenAmount: { uiAmount: 10 },
          },
        ],
        postTokenBalances: [
          {
            accountIndex: 1,
            mint: "MINT",
            owner: "BBB",
            uiTokenAmount: { uiAmount: 25 },
          },
        ],
      },
    });

    const result = await service.getParsedTransaction(SIG);

    expect(result.tokenBalanceChanges).toEqual([
      { account: "BBB", mint: "MINT", owner: "BBB", change: 15 },
    ]);
  });

  it("throws NotFound when the RPC has never seen the signature", async () => {
    cache.get.mockResolvedValue(undefined);
    connection.getParsedTransaction.mockResolvedValue(null);

    await expect(service.getParsedTransaction(SIG)).rejects.toThrow(
      NotFoundException,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("marks a failed transaction as unsuccessful and keeps the error", async () => {
    cache.get.mockResolvedValue(undefined);
    connection.getParsedTransaction.mockResolvedValue({
      ...RAW_TX,
      meta: { ...RAW_TX.meta, err: { InstructionError: [0, "Custom"] } },
    });

    const result = await service.getParsedTransaction(SIG);

    expect(result.success).toBe(false);
    expect(result.err).toEqual({ InstructionError: [0, "Custom"] });
  });
});
