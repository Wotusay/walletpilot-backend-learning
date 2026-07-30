import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { RedisHealthIndicator } from "./redis.health";

/**
 * TerminusModule provides HealthCheckService and the built-in indicators
 * (TypeOrmHealthIndicator resolves the app's default DataSource lazily through
 * ModuleRef, so no TypeOrmModule import is needed here).
 *
 * CacheModule is already registered globally in AppModule, so CACHE_MANAGER is
 * injectable in RedisHealthIndicator without importing anything either.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
