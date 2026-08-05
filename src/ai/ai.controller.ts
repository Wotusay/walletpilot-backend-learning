import { Controller, Post, Param } from "@nestjs/common";
import { AiService } from "./ai.service";
import { NormalizationService } from "../normalization/normalization.service";
import { WalletService } from "../wallet/wallet.service";

@Controller("ai")
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly normalizationService: NormalizationService,
    private readonly walletService: WalletService,
  ) {}

  @Post("analyze/:address")
  async analyze(@Param("address") address: string) {
    const assets = await this.normalizationService.normalize(address);
    const metrics = this.normalizationService.computeMetrics(assets);
    return this.aiService.analyze(assets, metrics);
  }

  @Post("explain-tx/:signature")
  async explainTransaction(@Param("signature") signature: string) {
    // WalletService does the RPC call and the trimming; AiService only talks
    // to Claude — same split as analyze() above.
    const tx = await this.walletService.getParsedTransaction(signature);
    return this.aiService.explainTransaction(tx);
  }
}
