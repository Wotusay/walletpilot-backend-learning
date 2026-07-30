import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import { Cache } from "cache-manager";
import { randomUUID } from "crypto";

/**
 * Terminus ships indicators for TypeORM, Mongo, HTTP, ... but not for
 * cache-manager, and this app has no raw Redis client — Redis is only ever
 * reached through CACHE_MANAGER (cache-manager + @keyv/redis). So we build a
 * custom indicator on top of HealthIndicatorService, which is just a helper
 * that formats { [key]: { status: 'up' | 'down', ...data } } for us.
 *
 * The check is a real write/read round-trip through the exact code path
 * MarketDataService and WalletService use, so a green result means "the cache
 * this app actually depends on works", not "some socket somewhere is open".
 */
@Injectable()
export class RedisHealthIndicator {
  private static readonly PING_KEY = "health:ping";
  private static readonly PING_TTL = 5_000; // ms
  private static readonly TIMEOUT = 1_500; // ms

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async isHealthy(key: string) {
    const check = this.healthIndicatorService.check(key);

    try {
      const token = randomUUID();
      const echo = await this.withTimeout(this.roundTrip(token));

      // Not just a `catch` guard: when Redis is unreachable Keyv can swallow
      // the connection error and quietly resolve `undefined` instead of
      // rejecting, so a mismatching value is a failure mode of its own.
      return echo === token
        ? check.up()
        : check.down("cache round-trip returned an unexpected value");
    } catch (error) {
      return check.down(
        error instanceof Error ? error.message : "unknown cache error",
      );
    }
  }

  private async roundTrip(token: string): Promise<unknown> {
    await this.cache.set(
      RedisHealthIndicator.PING_KEY,
      token,
      RedisHealthIndicator.PING_TTL,
    );
    return this.cache.get(RedisHealthIndicator.PING_KEY);
  }

  /**
   * With Redis down the underlying client keeps retrying internally, so the
   * promise can hang instead of rejecting — which would hang /health with it.
   * TypeOrmHealthIndicator.pingCheck has the same guard built in.
   */
  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`cache did not respond within ${RedisHealthIndicator.TIMEOUT}ms`),
          ),
        RedisHealthIndicator.TIMEOUT,
      );
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}
