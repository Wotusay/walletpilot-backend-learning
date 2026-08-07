import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "src/auth/decorators/current-user.decorator";
import { JwtGuard } from "src/auth/guards/jwt.guard";
import { LinkWalletDto } from "./dto/link-wallet.dto";
import { PortfolioService } from "./portfolio.service";

@ApiTags("portfolio")
@Controller("portfolio")
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  // Every static path below must stay ahead of the ":address" routes — Express
  // matches in declaration order, so "me/summary" would otherwise be served by
  // ":address/summary" with address="me". Same reason as
  // NormalizationController's @Get("me").

  @Get("me/summary")
  @ApiOperation({
    summary: "Combined portfolio across every wallet in this identity",
    description:
      "Normalizes the signed-in wallet plus each linked wallet, merges holdings " +
      "by symbol, and computes one set of metrics over the merged result. A " +
      "wallet that can't be read is reported in `wallets[].error` and excluded " +
      "from the total rather than failing the whole call.",
  })
  getAggregateSummary(@CurrentUser() owner: string) {
    return this.portfolioService.getAggregateSummary(owner);
  }

  @Get("wallets")
  @ApiOperation({
    summary: "List the wallets in this identity",
    description:
      "The signed-in wallet comes first with `primary: true` and a null id — " +
      "it is implicit, not a stored row, so it can't be unlinked.",
  })
  listWallets(@CurrentUser() owner: string) {
    return this.portfolioService.listWallets(owner);
  }

  // The owner comes from the JWT, never the body.
  @Post("wallets")
  @ApiOperation({
    summary: "Link an additional wallet to this identity",
    description:
      "The linked wallet is watch-only — no signature required, since it only " +
      "ever gets read.",
  })
  linkWallet(@CurrentUser() owner: string, @Body() body: LinkWalletDto) {
    return this.portfolioService.linkWallet(owner, body);
  }

  @Delete("wallets/:id")
  @ApiOperation({ summary: "Unlink one of the caller's linked wallets" })
  unlinkWallet(@CurrentUser() owner: string, @Param("id") id: string) {
    return this.portfolioService.unlinkWallet(owner, id);
  }

  @Get(":address/summary")
  @ApiOperation({ summary: "Summary for a single wallet" })
  getSummary(@Param("address") address: string) {
    return this.portfolioService.getSummary(address);
  }

  // ?range=day|week|month — defaults to the last 24h.
  @Get(":address/history")
  @ApiOperation({ summary: "Snapshot value series for a single wallet" })
  getHistory(@Param("address") address: string, @Query("range") range = "day") {
    return this.portfolioService.getHistory(address, range);
  }
}
