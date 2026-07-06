import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { base64 } from "src/helpers/base64";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { JwtGuard } from "./guards/jwt.guard";
import { Request } from "express";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("nonce")
  postNonce(@Body() body: { publicKey: string }): string {
    return this.authService.generateNonce(body.publicKey);
  }

  // testing endpoint to verify signature
  @Post("test-verify")
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
  postVerify(@Body() body: { publicKey: string; signature: base64 }) {
    return this.authService.verifySignature(body.publicKey, body.signature);
  }

  @Get("me")
  @UseGuards(JwtGuard)
  getMe(@Req() req: Request) {
    return req.user;
  }
}
