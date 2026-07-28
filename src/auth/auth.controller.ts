import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { base64 } from "src/helpers/base64";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { JwtGuard } from "./guards/jwt.guard";
import { Request } from "express";
import { NonceDto } from "./dto/nonce.dto";
import { VerifyDto } from "./dto/verify.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("nonce")
  @ApiOperation({
    summary: "Request a nonce for a public key",
    description:
      "Returns a fresh nonce that the wallet must sign to prove ownership of the key.",
  })
  @ApiResponse({
    status: 201,
    description: "The generated nonce (a UUID string).",
  })
  postNonce(@Body() body: NonceDto): string {
    return this.authService.generateNonce(body.publicKey);
  }

  // testing endpoint to verify signature
  @Post("test-verify")
  @ApiOperation({
    summary: "End-to-end signature test (dev helper)",
    description:
      "Generates a throwaway keypair, signs its own nonce, and runs the real verify path. Returns the intermediate values plus the resulting JWT.",
  })
  postTestVerify() {
    // generate a keypair with tweetnacl (Ed25519, like a Solana wallet)
    const keypair = nacl.sign.keyPair();
    const publicKey = bs58.encode(keypair.publicKey);
    // ask the service for a nonce, exactly like a real client would
    const nonce = this.authService.generateNonce(publicKey);
    // sign the nonce bytes with the secret key
    const message = new TextEncoder().encode(nonce);
    const signature = bs58.encode(
      nacl.sign.detached(message, keypair.secretKey),
    ) as base64;
    // run the real verify path (bs58 decode + nacl.sign.detached.verify)
    const result = this.authService.verifySignature(publicKey, signature);
    return { publicKey, signature, nonce, result };
  }

  @Post("verify")
  @ApiOperation({
    summary: "Verify a signed nonce and issue a JWT",
    description:
      "Verifies the base58 signature against the stored nonce. On success returns a signed JWT (raw string); on failure throws 401.",
  })
  @ApiResponse({
    status: 201,
    description: "A signed JWT (raw string) for the authenticated wallet.",
  })
  @ApiResponse({ status: 401, description: "Invalid signature or missing nonce." })
  postVerify(@Body() body: VerifyDto) {
    return this.authService.verifySignature(
      body.publicKey,
      body.signature as base64,
    );
  }

  @Get("me")
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Return the authenticated wallet",
    description: "Returns the decoded JWT payload, e.g. { sub: <publicKey> }.",
  })
  @ApiResponse({ status: 200, description: "The JWT payload { sub }." })
  @ApiResponse({ status: 401, description: "Missing or invalid bearer token." })
  getMe(@Req() req: Request) {
    return req.user;
  }
}
