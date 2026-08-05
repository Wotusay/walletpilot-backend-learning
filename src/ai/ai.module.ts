import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { NormalizationModule } from 'src/normalization/normalization.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { anthropicClientProvider } from './anthropic.client';

@Module({
  controllers: [AiController],
  providers: [AiService, anthropicClientProvider],
  // NormalizationModule and WalletModule export the services AiController injects.
  imports: [NormalizationModule, WalletModule],
})
export class AiModule {}
