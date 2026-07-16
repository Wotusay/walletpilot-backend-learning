import { Module } from "@nestjs/common";
import { NormalizationModule } from "./normalization/normalization.module";
import { AuthModule } from "./auth/auth.module";
import { WalletModule } from "./wallet/wallet.module";
import { PortfolioModule } from "./portfolio/portfolio.module";
import { MarketDataModule } from "./market-data/market-data.module";
import { AiModule } from "./ai/ai.module";
import { AlertsModule } from "./alerts/alerts.module";
import { ScheduleModule } from "@nestjs/schedule";
import { RefreshModule } from "./refresh/refresh.module";
import { CacheModule } from "@nestjs/cache-manager";
import { ConfigService } from "@nestjs/config";
import KeyvRedis from "@keyv/redis";
import { TypeOrmModule } from "@nestjs/typeorm";

@Module({
  imports: [
    AuthModule,
    WalletModule,
    PortfolioModule,
    MarketDataModule,
    NormalizationModule,
    AiModule,
    AlertsModule,
    RefreshModule,
    ScheduleModule.forRoot(),
    CacheModule.registerAsync({
      isGlobal: true, // Make the cache module global so it can be used in any module without importing it
      inject: [ConfigService], // Inject ConfigService to access environment variables
      useFactory: async (configService: ConfigService) => ({
        stores: [new KeyvRedis(configService.get<string>("redisUrl"))],
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        type: "postgres",
        url: configService.get<string>("databaseUrl"),
        autoLoadEntities: true, // register every forFeature() entity on the connection
        synchronize: true, // Set to false in production
      }),
    }),
  ],
})
export class AppModule {}
