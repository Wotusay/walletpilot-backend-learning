import { z } from "zod";

export const TransactionExplanationSchema = z.object({
  // The length bound is Zod-only: strict tool schemas can't declare min/max,
  // so this is what actually keeps "1-2 sentences" honest.
  summary: z.string().min(1).max(600),
  transactionType: z.enum([
    "Transfer",
    "Token transfer",
    "Swap",
    "Token approval",
    "Account creation",
    "Stake",
    "Program interaction",
    "Unknown",
  ]),
  amounts: z.array(z.string()),
  programsInvolved: z.array(z.string()),
  confidence: z.enum(["High", "Medium", "Low"]),
  caveats: z.array(z.string()),
});

export type TransactionExplanation = z.infer<
  typeof TransactionExplanationSchema
>;
