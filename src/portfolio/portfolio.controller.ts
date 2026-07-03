import { Controller, Get, Param } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get(':address/summary')
  getSummary(@Param('address') address: string) {
    return this.portfolioService.getSummary(address);
  }
}
