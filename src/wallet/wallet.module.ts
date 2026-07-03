import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController],
  providers: [WalletService],
  // Exported so other modules (e.g. Portfolio) can inject WalletService.
  // See the assignment in the README before you need this.
  exports: [WalletService],
})
export class WalletModule {}
