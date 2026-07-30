import { Controller, Get, UseFilters } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from "@nestjs/terminus";
import { HealthCheckFilter } from "./filters/health-check.filter";
import { RedisHealthIndicator } from "./redis.health";

@ApiTags("health")
@Controller("health")
@UseFilters(HealthCheckFilter)
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  // No JwtGuard: a health endpoint has to be reachable by anything that has to
  // decide whether this process is alive — a load balancer, a container
  // orchestrator, an uptime probe. None of them carry a wallet JWT.
  @Get()
  @HealthCheck() // also contributes the response schema to the OpenAPI doc
  @ApiOperation({
    summary: "Liveness/readiness check for the API and its dependencies",
    description:
      "Pings Postgres (SELECT 1 via TypeORM) and does a write/read round-trip through the Redis cache. 200 when both are up, 503 as soon as one is down.",
  })
  @ApiResponse({
    status: 200,
    description: 'Everything is up: { status: "ok", info, error: {}, details }.',
  })
  @ApiResponse({
    status: 503,
    description:
      'At least one dependency is down: { status: "error", info, error, details } — `error` names the failing indicator.',
  })
  check() {
    // HealthCheckService runs every indicator, aggregates the results, and
    // throws ServiceUnavailableException if any of them reports down.
    return this.health.check([
      () => this.db.pingCheck("database"),
      () => this.redis.isHealthy("redis"),
    ]);
  }
}
