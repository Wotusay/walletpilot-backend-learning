import { Injectable, UnauthorizedException } from "@nestjs/common";
import { base64 } from "src/helpers/base64";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthService {
  private nonceMap: Map<string, string> = new Map();
  // Stub for now — this module isn't the focus of Topic 1.
  // It exists so the app wiring (AppModule) is realistic.

  constructor(private jwtService: JwtService) {}

  // To generate a nonce, we have to store the public key in a plain in-memory map,
  // and then generate a random nonce using crypto.randomUUID().
  // The nonce is then stored in the map, associated with the public key.
  // When the client sends back the signed nonce, we can look up the public key in the map and verify the signature.

  public generateNonce(publicKey: string): string {
    const nonce = crypto.randomUUID();
    this.nonceMap.set(publicKey, nonce);
    return nonce;
  }

  public verifySignature(publicKey: string, signature: base64): any {
    const nonce = this.nonceMap.get(publicKey);
    const { signatureDecoded, publicKeyDecoded, messageDecoded } =
      this.decodeBody(publicKey, signature, nonce);

    const isValid = nacl.sign.detached.verify(
      messageDecoded,
      signatureDecoded,
      publicKeyDecoded,
    );

    if (!isValid) {
      throw new UnauthorizedException("Invalid signature");
    }

    // If the signature is valid, we can remove the nonce from the map
    this.nonceMap.delete(publicKey);
    return this.jwtService.sign({ sub: publicKey });
  }

  private checkStoredNonce(publicKey: string, nonce?: string) {
    const storedNonce = this.nonceMap.get(publicKey);
    if (!storedNonce) {
      throw new UnauthorizedException(
        "No nonce found for the given public key",
      );
    }
  }

  private rebuildMessage(nonce?: string) {
    return new TextEncoder().encode(nonce);
  }

  private decodeBody(publicKey: string, signature: base64, nonce?: string) {
    this.checkStoredNonce(publicKey, nonce);
    const signatureDecoded = bs58.decode(signature);
    const publicKeyDecoded = bs58.decode(publicKey);
    const messageDecoded = this.rebuildMessage(nonce);
    return { signatureDecoded, publicKeyDecoded, messageDecoded };
  }
}
