import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { NormalizationService } from "./normalization.service";
import { JwtGuard } from "src/auth/guards/jwt.guard";
import { CurrentUser } from "src/auth/decorators/current-user.decorator";

@Controller("normalization")
@UseGuards(JwtGuard)
export class NormalizationController {
  constructor(private readonly normalizationService: NormalizationService) {}

  // Authoritative "my portfolio": the wallet comes from the JWT, not the URL,
  // so a caller can only ever normalize the wallet they signed in with.
  // Must be declared before ":address" or Express matches "me" as an address.
  @Get("me")
  async getMine(@CurrentUser() address: string) {
    return this.get(address);
  }

  @Get(":address")
  async get(@Param("address") address: string) {
    const assets = await this.normalizationService.normalize(address);
    const metrics = this.normalizationService.computeMetrics(assets);
    return { assets, metrics };
  }
}
