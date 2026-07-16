import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { ConfigService } from "@nestjs/config";
import {
  PortfolioAsset,
  PortfolioMetrics,
} from "src/normalization/normalization.service";

import { AnalysisSchema } from "./schemas/analysis.schema";
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic = new Anthropic({
    apiKey: this.config.get<string>("anthropicApiKey"),
  });

  constructor(private readonly config: ConfigService) {}

  async analyze(portfolio: PortfolioAsset[], metrics: PortfolioMetrics) {
    const tool: Anthropic.Tool = {
      name: "report_portfolio_analysis",
      description: "Return the structured portfolio analysis.",
      strict: true, // API enforces the schema so fields can't come back malformed
      input_schema: {
        type: "object",
        additionalProperties: false, // required when strict: true
        properties: {
          executiveSummary: {
            type: "string",
            description:
              "2-3 sentence plain-language overview of the portfolio's composition and standout characteristics.",
          },
          portfolioHealthScore: {
            type: "number",
            description:
              "Overall health 0-100 per the rubric: diversification good, heavy concentration bad. (Range enforced by Zod after parsing — strict tool schemas can't declare min/max.)",
          },
          riskLevel: {
            type: "string",
            enum: ["Low", "Medium", "High"],
            description:
              "Overall risk from concentration and asset mix. High = dominated by one asset or a highly volatile mix.",
          },
          diversificationAnalysis: {
            type: "string",
            description:
              "How spread the portfolio is across assets and asset types; call out any single asset over 40%.",
          },
          observations: {
            type: "array",
            items: { type: "string" },
            description:
              "3-6 factual, data-grounded observations. Each references specific symbols or allocation percentages.",
          },
          potentialRisks: {
            type: "array",
            items: { type: "string" },
            description:
              "Concrete risks visible in the snapshot (e.g. concentration, stablecoin depeg exposure). No speculation about future prices.",
          },
          tradingBehavior: {
            type: "string",
            description:
              "If no trade history is present in the input, state that trading behavior cannot be assessed from a holdings snapshot.",
          },
        },
        required: [
          "executiveSummary",
          "portfolioHealthScore",
          "riskLevel",
          "diversificationAnalysis",
          "observations",
          "potentialRisks",
          "tradingBehavior",
        ],
      },
    };

    const system = [
      "You are a crypto portfolio analyst.",
      "Analyze ONLY the holdings snapshot and allocation metrics provided.",
      "Do not invent numbers, prices, historical performance, or transactions that are not in the input.",
      "If the data is insufficient for a field, say so explicitly rather than guessing.",
      "Be concise and factual. Do not give financial advice or buy/sell recommendations.",
      "Health score rubric (0-100): reward diversification across assets and types,",
      "penalize heavy concentration in a single asset and large stablecoin-only or single-asset portfolios.",
    ].join(" ");

    const msg = await this.client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: [
            "Analyze the following portfolio snapshot and return your analysis via the report_portfolio_analysis tool.",
            "",
            "Holdings (symbol, type, amount, USD value):",
            JSON.stringify(portfolio, null, 2),
            "",
            "Allocation metrics (total value, allocation by asset %, allocation by type %):",
            JSON.stringify(metrics, null, 2),
            "",
            "Notes:",
            "- This is a point-in-time snapshot. There is NO transaction or trade history in this data.",
            "- For tradingBehavior: since no trade history is provided, state that trading behavior cannot be assessed from this snapshot.",
            "- Base observations and risks only on concentration, diversification, and asset mix visible above.",
          ].join("\n"),
        },
      ],
    });

    const block = msg.content.find((content) => content.type === "tool_use");

    if (!block || block.type !== "tool_use")
      throw new InternalServerErrorException(
        "Claude did not return a tool output",
      );

    const parseSchema = AnalysisSchema.safeParse(block.input);

    if (!parseSchema.success) {
      this.logger.error(
        `Failed to parse analysis output: ${JSON.stringify(block.input)}`,
      );
      throw new InternalServerErrorException("Failed to parse analysis output");
    }

    return block.input;
  }
}
