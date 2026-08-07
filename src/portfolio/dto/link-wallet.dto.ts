import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LinkWalletDto {
  @ApiProperty({
    description:
      "The extra wallet to track under the caller's identity. Must be a valid " +
      "Solana address, and must not be the caller's own wallet — that one is " +
      "always included.",
    example: "5HZ8AEgxmnBwwmMKH4LZXxU5h6kGgq7XoWfgNHuGVpyU",
  })
  address!: string;

  @ApiPropertyOptional({
    description: "Optional human-readable name for this wallet.",
    example: "cold storage",
  })
  label?: string;
}
