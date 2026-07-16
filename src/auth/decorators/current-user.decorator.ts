import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Extracts the authenticated wallet address from the JWT payload.
 * JwtStrategy.validate returns `{ sub: publicKey }`, so `req.user.sub` is the
 * wallet the caller proved ownership of via the Phantom sign-in flow.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest().user.sub,
);
