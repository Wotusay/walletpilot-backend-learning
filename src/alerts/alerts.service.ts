import { Injectable } from '@nestjs/common';

@Injectable()
export class AlertsService {
  // Stub for now — this module isn't the focus of Topic 1.
  // It exists so the app wiring (AppModule) is realistic.
  ping(): string {
    return 'AlertsService is alive';
  }
}
