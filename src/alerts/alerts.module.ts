import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RefreshModule } from "src/refresh/refresh.module";
import { Alert } from "./alert.entity";
import { AlertsController } from "./alerts.controller";
import { AlertsGateway } from "./alerts.gateway";
import { AlertsService } from "./alerts.service";
import { Watchlist } from "./watchlist.entity";

// Depends on RefreshModule one-way, for the snapshot bus. RefreshService reads
// the watched addresses from the Watchlist repository directly rather than from
// AlertsService, which is what keeps this from becoming a circular import.
@Module({
  controllers: [AlertsController],
  providers: [AlertsService, AlertsGateway],
  imports: [RefreshModule, TypeOrmModule.forFeature([Watchlist, Alert])],
})
export class AlertsModule {}
