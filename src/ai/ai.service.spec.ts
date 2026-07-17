import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { InternalServerErrorException } from "@nestjs/common";
import { AiService } from "./ai.service";
import { ANTHROPIC_CLIENT } from "./anthropic.client";
import { Analysis } from "./schemas/analysis.schema";

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
