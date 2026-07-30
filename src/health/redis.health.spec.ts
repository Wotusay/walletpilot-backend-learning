import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { HealthIndicatorService } from "@nestjs/terminus";
import { RedisHealthIndicator } from "./redis.health";

describe("RedisHealthIndicator.isHealthy", () => {
  let indicator: RedisHealthIndicator;

  // Only the two methods the indicator touches. HealthIndicatorService is used
  // for real — it is a pure result formatter with no dependencies of its own.
  const cache = {
    set: jest.fn<(...args: any[]) => Promise<any>>(),
    get: jest.fn<(...args: any[]) => Promise<any>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RedisHealthIndicator,
        HealthIndicatorService,
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();
    indicator = moduleRef.get(RedisHealthIndicator);
  });

  it("reports up when the value written comes back unchanged", async () => {
    // Echo whatever was just written, like a working Redis would.
    cache.set.mockImplementation(async (_key, value) => {
      cache.get.mockResolvedValue(value);
    });

    const result = await indicator.isHealthy("redis");

    expect(result).toEqual({ redis: { status: "up" } });
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.get).toHaveBeenCalledWith("health:ping");
  });

  it("reports down when the read returns something else", async () => {
    // Keyv can swallow a connection error and resolve undefined instead of
    // rejecting — the write "succeeds" but nothing was actually stored.
    cache.set.mockResolvedValue(undefined);
    cache.get.mockResolvedValue(undefined);

    const result = await indicator.isHealthy("redis");

    expect(result.redis.status).toBe("down");
  });

  it("reports down when the cache throws", async () => {
    cache.set.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await indicator.isHealthy("redis");

    expect(result).toEqual({
      redis: { status: "down", message: "ECONNREFUSED" },
    });
  });
});
