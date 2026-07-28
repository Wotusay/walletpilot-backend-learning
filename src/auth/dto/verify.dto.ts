import { ApiProperty } from "@nestjs/swagger";

export class VerifyDto {
  @ApiProperty({
    description: "The wallet's public key (base58-encoded Solana address).",
    example: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  })
  publicKey!: string;

  @ApiProperty({
    description:
      "The nonce signed by the wallet, base58-encoded (Ed25519 detached signature).",
    example: "5VfydnLu...S1gnatureBytes...9zK",
  })
  signature!: string;
}
