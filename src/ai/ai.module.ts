import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { NormalizationModule } from 'src/normalization/normalization.module';

@Module({
  controllers: [AiController],
  providers: [AiService],
  imports: [NormalizationModule], // Import NormalizationModule here so AiService can inject NormalizationService
})
export class AiModule {}
