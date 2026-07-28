import { ApiProperty } from "@nestjs/swagger";

export class NonceDto {
  @ApiProperty({
    description: "The wallet's public key (base58-encoded Solana address).",
    example: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  })
  publicKey!: string;
}
