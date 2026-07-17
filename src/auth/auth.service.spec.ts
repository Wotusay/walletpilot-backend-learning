import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { AuthService } from "./auth.service";
import { base64 } from "src/helpers/base64";

// Sign `nonce` with the keypair's secret key and bs58-encode the signature,
// matching what verifySignature expects (it bs58-decodes the signature arg).
function signNonce(nonce: string, secretKey: Uint8Array): base64 {
  const message = new TextEncoder().encode(nonce);
  return bs58.encode(nacl.sign.detached(message, secretKey)) as unknown as base64;
}

describe("AuthService", () => {
  let service: AuthService;
  const jwt = { sign: jest.fn<(payload: any) => string>() };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwt.sign.mockReturnValue("fake.jwt.token");
    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, { provide: JwtService, useValue: jwt }],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe("generateNonce", () => {
    it("returns a different nonce on each call for the same key", () => {
      const key = "somePublicKey";
      const first = service.generateNonce(key);
      const second = service.generateNonce(key);
      expect(first).not.toBe(second);
    });
  });

  describe("verifySignature", () => {
    it("returns a JWT for a valid signature", () => {
      const kp = nacl.sign.keyPair();
      const publicKey = bs58.encode(kp.publicKey);
      const nonce = service.generateNonce(publicKey);
      const signature = signNonce(nonce, kp.secretKey);

      const token = service.verifySignature(publicKey, signature);

      expect(token).toBe("fake.jwt.token");
      expect(jwt.sign).toHaveBeenCalledWith({ sub: publicKey });
    });

    it("throws UnauthorizedException for an invalid signature", () => {
      const kp = nacl.sign.keyPair();
      const publicKey = bs58.encode(kp.publicKey);
      const nonce = service.generateNonce(publicKey);
      // Sign a different message than the stored nonce → verification fails.
      const badSignature = signNonce(nonce + "tampered", kp.secretKey);

      expect(() => service.verifySignature(publicKey, badSignature)).toThrow(
        UnauthorizedException,
      );
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it("throws UnauthorizedException when the nonce is re-used", () => {
      const kp = nacl.sign.keyPair();
      const publicKey = bs58.encode(kp.publicKey);
      const nonce = service.generateNonce(publicKey);
      const signature = signNonce(nonce, kp.secretKey);

      // First call succeeds and deletes the stored nonce.
      service.verifySignature(publicKey, signature);

      // Second call with the same key/signature has no stored nonce → throws.
      expect(() => service.verifySignature(publicKey, signature)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
