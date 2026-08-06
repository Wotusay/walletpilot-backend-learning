import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { JwtGuard } from 'src/auth/guards/jwt.guard';

@Controller('portfolio')
@UseGuards(JwtGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get(':address/summary')
  getSummary(@Param('address') address: string) {
    return this.portfolioService.getSummary(address);
  }

  // ?range=day|week|month — defaults to the last 24h.
  @Get(':address/history')
  getHistory(
    @Param('address') address: string,
    @Query('range') range = 'day',
  ) {
    return this.portfolioService.getHistory(address, range);
  }
}
