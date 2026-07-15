export const config = () => ({
  port: 3000,
  jwtSecret: process.env.JWT_SECRET || "your_jwt_secret",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  databaseUrl: process.env.DATABASE_URL || "postgres://",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
});
