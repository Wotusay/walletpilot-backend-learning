import { Controller, Get, Param, Post, Query, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";
import { RefreshService } from "./refresh.service";

@Controller("refresh")
export class RefreshController {
  constructor(private readonly refreshService: RefreshService) {}

  // Trigger an immediate snapshot for a wallet (also broadcast to the stream).
  @Post(":address")
  trigger(@Param("address") address: string): Promise<PortfolioSnapshot> {
    return this.refreshService.refreshWallet(address);
  }

  // Past snapshots, oldest → newest, to seed the chart.
  @Get(":address/history")
  history(
    @Param("address") address: string,
    @Query("limit") limit?: string,
  ): Promise<PortfolioSnapshot[]> {
    return this.refreshService.getHistory(address, limit ? +limit : 60);
  }

  // Server-Sent Events: pushes each new snapshot for this wallet as it's saved.
  // Note: EventSource can't send an Authorization header, but this route isn't
  // guarded, so it works as-is.
  @Sse(":address/stream")
  stream(
    @Param("address") address: string,
  ): Observable<{ data: PortfolioSnapshot }> {
    return this.refreshService.stream(address);
  }
}
