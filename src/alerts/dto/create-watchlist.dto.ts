import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { WatchlistRule } from "../watchlist.entity";

export class CreateWatchlistDto {
  @ApiPropertyOptional({
    description:
      "The wallet to watch. Defaults to the caller's own wallet (the JWT `sub`).",
    example: "5HZ8AEgxmnBwwmMKH4LZXxU5h6kGgq7XoWfgNHuGVpyU",
  })
  address?: string;

  @ApiProperty({
    description: "Which threshold to check on each refresh.",
    enum: WatchlistRule,
    example: WatchlistRule.SolBalanceBelow,
  })
  rule!: WatchlistRule;

  @ApiProperty({
    description:
      "The threshold value — SOL for the balance rules, USD for the total-value rules.",
    example: 1.5,
  })
  threshold!: number;
}
