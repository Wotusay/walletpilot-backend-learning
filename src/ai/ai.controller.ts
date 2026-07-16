import { Controller, Post, Param } from "@nestjs/common";
import { AiService } from "./ai.service";
import { NormalizationService } from "../normalization/normalization.service";

@Controller("ai")
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly normalizationService: NormalizationService,
  ) {}

  @Post("analyze/:address")
  async analyze(@Param("address") address: string) {
    const assets = await this.normalizationService.normalize(address);
    const metrics = this.normalizationService.computeMetrics(assets);
    return this.aiService.analyze(assets, metrics);
  }
}
