import { Controller, Get, Param, UseGuards } from '@nestjs/common';
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
}
