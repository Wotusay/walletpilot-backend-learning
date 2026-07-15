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
      input_schema: {
        type: "object",
        properties: {
          executiveSummary: { type: "string" },
          portfolioHealthScore: { type: "number" }, // 0-100
          riskLevel: { type: "string", enum: ["Low", "Medium", "High"] },
          diversificationAnalysis: { type: "string" },
          observations: { type: "array", items: { type: "string" } },
          potentialRisks: { type: "array", items: { type: "string" } },
          tradingBehavior: { type: "string" },
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

    const msg = await this.client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content:
            `Analyze this portfolio. Assets: ${JSON.stringify(portfolio)}. ` +
            `Metrics: ${JSON.stringify(metrics)}.`,
        },
      ],
    });

    const block = msg.content.find((content) => content.type === "tool_use");

    const parseSchema = AnalysisSchema.safeParse(block?.input);

    if (!parseSchema.success) {
      this.logger.error(
        `Failed to parse analysis output: ${JSON.stringify(block?.input)}`,
      );
      throw new InternalServerErrorException("Failed to parse analysis output");
    }
    if (!block || block.type !== "tool_use")
      throw new InternalServerErrorException(
        "Claude did not return a tool output",
      );

    return block.input;
  }
}
