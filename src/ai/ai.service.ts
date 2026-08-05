import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import {
  PortfolioAsset,
  PortfolioMetrics,
} from "src/normalization/normalization.service";

import { ParsedTransactionSummary } from "src/wallet/wallet.service";

import { AnalysisSchema } from "./schemas/analysis.schema";
import {
  TransactionExplanation,
  TransactionExplanationSchema,
} from "./schemas/transaction-explanation.schema";
import { ANTHROPIC_CLIENT } from "./anthropic.client";
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic,
  ) {}

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

  /**
   * Explain a single transaction in plain English. Same shape as analyze():
   * a forced strict tool call, then a Zod gate on the way out.
   */
  async explainTransaction(
    tx: ParsedTransactionSummary,
  ): Promise<TransactionExplanation> {
    const tool: Anthropic.Tool = {
      name: "report_transaction_explanation",
      description: "Return the structured explanation of one transaction.",
      strict: true, // API enforces the schema so fields can't come back malformed
      input_schema: {
        type: "object",
        additionalProperties: false, // required when strict: true
        properties: {
          summary: {
            type: "string",
            description:
              "1-2 sentences in plain English describing what this transaction did. No jargon beyond the token/program names in the input. (Length enforced by Zod after parsing — strict tool schemas can't declare min/max.)",
          },
          transactionType: {
            type: "string",
            enum: [
              "Transfer",
              "Token transfer",
              "Swap",
              "Token approval",
              "Account creation",
              "Stake",
              "Program interaction",
              "Unknown",
            ],
            description:
              "The single best-fitting category for the transaction as a whole. Use 'Program interaction' when instructions ran but their meaning is not parseable, and 'Unknown' only when even that is unclear.",
          },
          amounts: {
            type: "array",
            items: { type: "string" },
            description:
              "Value movements, one per line, each quoting a number that appears literally in the input (e.g. '0.5 SOL from <account> to <account>'). If no balance changed, return an empty array. Never compute, convert, or estimate a value that is not in the input — there is no price data here, so never state a USD value.",
          },
          programsInvolved: {
            type: "array",
            items: { type: "string" },
            description:
              "The programs this transaction touched. Use the 'program' name when the input has one, otherwise the raw programId. Do not name a program the input does not contain.",
          },
          confidence: {
            type: "string",
            enum: ["High", "Medium", "Low"],
            description:
              "High when every instruction is parsed and the intent is unambiguous. Low when one or more instructions have a null program/type, since their effect cannot be read from this data.",
          },
          caveats: {
            type: "array",
            items: { type: "string" },
            description:
              "What cannot be determined from this data — unparsed instructions, missing token metadata, intent that isn't visible on-chain. Empty array if there are none.",
          },
        },
        required: [
          "summary",
          "transactionType",
          "amounts",
          "programsInvolved",
          "confidence",
          "caveats",
        ],
      },
    };

    const system = [
      "You are a Solana transaction analyst.",
      "Explain ONLY what the provided parsed instruction data shows.",
      "Do not invent amounts, token names, USD values, prices, counterparties, or intent that are not in the input.",
      "Many programs cannot be parsed by the RPC: when an instruction's program or type is null, say the transaction interacted with that program ID and lower your confidence rather than guessing what it did.",
      "Token mints are raw addresses unless the input names them — do not guess which token a mint is.",
      "Keep the summary to 1-2 sentences. Be concise and factual. Do not give financial advice.",
    ].join(" ");

    const msg = await this.client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: [
            "Explain the following Solana transaction and return your explanation via the report_transaction_explanation tool.",
            "",
            "Parsed transaction:",
            JSON.stringify(tx, null, 2),
            "",
            "Notes:",
            "- This is a single transaction. There is NO price data and NO other transaction in this input.",
            "- solBalanceChanges are in SOL and tokenBalanceChanges are already decimal-adjusted; both list only accounts whose balance actually changed.",
            "- feeSol is the network fee, which is separate from any transfer amount.",
            "- If success is false the transaction failed: say so, and describe what it attempted rather than what it moved.",
          ].join("\n"),
        },
      ],
    });

    const block = msg.content.find((content) => content.type === "tool_use");

    if (!block || block.type !== "tool_use")
      throw new InternalServerErrorException(
        "Claude did not return a tool output",
      );

    const parsed = TransactionExplanationSchema.safeParse(block.input);

    if (!parsed.success) {
      this.logger.error(
        `Failed to parse transaction explanation: ${JSON.stringify(block.input)}`,
      );
      throw new InternalServerErrorException(
        "Failed to parse transaction explanation",
      );
    }

    return parsed.data;
  }
}
