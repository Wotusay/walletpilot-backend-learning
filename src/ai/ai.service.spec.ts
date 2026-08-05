import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { InternalServerErrorException } from "@nestjs/common";
import { AiService } from "./ai.service";
import { ANTHROPIC_CLIENT } from "./anthropic.client";
import { Analysis } from "./schemas/analysis.schema";
import { TransactionExplanation } from "./schemas/transaction-explanation.schema";

// A response body that satisfies AnalysisSchema (all 7 fields, score in 0-100,
// riskLevel one of the enum values).
const VALID_ANALYSIS: Analysis = {
  executiveSummary: "A concentrated two-asset portfolio dominated by SOL.",
  portfolioHealthScore: 62,
  riskLevel: "Medium",
  diversificationAnalysis: "SOL makes up over 40% of holdings.",
  observations: ["SOL is the largest position.", "USDC provides stability."],
  potentialRisks: ["High single-asset concentration in SOL."],
  tradingBehavior: "Trading behavior cannot be assessed from a holdings snapshot.",
};

// Client is mocked, so the actual portfolio/metrics values are never used.
const portfolio: any = [];
const metrics: any = {};

describe("AiService.analyze", () => {
  let service: AiService;
  const client = {
    messages: {
      create: jest.fn<(...args: any[]) => Promise<any>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AiService, { provide: ANTHROPIC_CLIENT, useValue: client }],
    }).compile();
    service = moduleRef.get(AiService);
  });

  it("returns the tool_use input when the response satisfies the schema", async () => {
    client.messages.create.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "report_portfolio_analysis",
          input: VALID_ANALYSIS,
        },
      ],
    });

    const result = await service.analyze(portfolio, metrics);

    expect(result).toEqual(VALID_ANALYSIS);
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  it("throws when the tool_use input fails schema validation", async () => {
    client.messages.create.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "report_portfolio_analysis",
          // portfolioHealthScore out of range → AnalysisSchema rejects it.
          input: { ...VALID_ANALYSIS, portfolioHealthScore: 150 },
        },
      ],
    });

    await expect(service.analyze(portfolio, metrics)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it("throws when the response contains no tool_use block", async () => {
    client.messages.create.mockResolvedValue({
      content: [{ type: "text", text: "here is my analysis" }],
    });

    await expect(service.analyze(portfolio, metrics)).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});

// A response body that satisfies TransactionExplanationSchema.
const VALID_EXPLANATION: TransactionExplanation = {
  summary: "Transferred 0.5 SOL from one account to another.",
  transactionType: "Transfer",
  amounts: ["0.5 SOL from 4Nd1m... to 9xQe..."],
  programsInvolved: ["system"],
  confidence: "High",
  caveats: [],
};

// A trimmed transaction, as WalletService.getParsedTransaction would return it.
const tx: any = {
  signature: "5j7s...",
  slot: 123,
  blockTime: 1_700_000_000,
  success: true,
  err: null,
  feeSol: 0.000005,
  instructions: [
    { programId: "111...", program: "system", type: "transfer", info: {} },
  ],
  solBalanceChanges: [],
  tokenBalanceChanges: [],
};

describe("AiService.explainTransaction", () => {
  let service: AiService;
  const client = {
    messages: {
      create: jest.fn<(...args: any[]) => Promise<any>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AiService, { provide: ANTHROPIC_CLIENT, useValue: client }],
    }).compile();
    service = moduleRef.get(AiService);
  });

  it("returns the parsed explanation when the response satisfies the schema", async () => {
    client.messages.create.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "report_transaction_explanation",
          input: VALID_EXPLANATION,
        },
      ],
    });

    const result = await service.explainTransaction(tx);

    expect(result).toEqual(VALID_EXPLANATION);
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  it("sends the parsed transaction data to the model", async () => {
    client.messages.create.mockResolvedValue({
      content: [{ type: "tool_use", input: VALID_EXPLANATION }],
    });

    await service.explainTransaction(tx);

    // The whole point of the feature is that the model sees real instruction
    // data — a prompt that forgot to interpolate it would still "work".
    const request = client.messages.create.mock.calls[0][0] as any;
    expect(request.messages[0].content).toContain('"type": "transfer"');
    expect(request.tool_choice).toEqual({
      type: "tool",
      name: "report_transaction_explanation",
    });
  });

  it("throws when the tool_use input fails schema validation", async () => {
    client.messages.create.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "report_transaction_explanation",
          // "1-2 sentences" is a Zod-only bound (strict tool schemas can't
          // declare max length), so this is the case the API won't catch.
          input: { ...VALID_EXPLANATION, summary: "a".repeat(700) },
        },
      ],
    });

    await expect(service.explainTransaction(tx)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it("throws when the response contains no tool_use block", async () => {
    client.messages.create.mockResolvedValue({
      content: [{ type: "text", text: "this transaction transferred SOL" }],
    });

    await expect(service.explainTransaction(tx)).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
