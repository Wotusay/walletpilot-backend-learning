import { z } from "zod";

export const AnalysisSchema = z.object({
  executiveSummary: z.string(),
  portfolioHealthScore: z.number().min(0).max(100), // 0-100
  riskLevel: z.enum(["Low", "Medium", "High"]),
  diversificationAnalysis: z.string(),
  observations: z.array(z.string()),
  potentialRisks: z.array(z.string()),
  tradingBehavior: z.string(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
