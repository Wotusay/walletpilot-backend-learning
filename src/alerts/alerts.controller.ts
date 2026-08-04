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
import { AlertsService } from "./alerts.service";
import { CreateWatchlistDto } from "./dto/create-watchlist.dto";

@ApiTags("alerts")
@Controller("alerts")
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  // The owner always comes from the JWT, never the body — a caller can only
  // ever create and read rules under their own wallet.
  @Post("watchlists")
  @ApiOperation({
    summary: "Arm a watchlist rule",
    description:
      "Registers a threshold rule for a wallet. Checked on every RefreshService tick.",
  })
  create(@CurrentUser() owner: string, @Body() body: CreateWatchlistDto) {
    return this.alertsService.createWatchlist(owner, body);
  }

  @Get("watchlists")
  @ApiOperation({ summary: "List the caller's watchlist rules" })
  list(@CurrentUser() owner: string) {
    return this.alertsService.listWatchlists(owner);
  }

  @Delete("watchlists/:id")
  @ApiOperation({ summary: "Delete one of the caller's watchlist rules" })
  remove(@CurrentUser() owner: string, @Param("id") id: string) {
    return this.alertsService.removeWatchlist(owner, id);
  }

  @Get()
  @ApiOperation({
    summary: "Recent alerts for the caller",
    description: "Newest first. Alerts survive deletion of the rule that fired them.",
  })
  recent(@CurrentUser() owner: string, @Query("limit") limit?: string) {
    return this.alertsService.listAlerts(owner, limit ? +limit : 50);
  }
}
