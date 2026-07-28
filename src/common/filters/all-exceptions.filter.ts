import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

/**
 * Catches every uncaught error (@Catch() with no argument) and turns it into
 * a single, consistent JSON shape for the client plus one structured log line
 * for us — regardless of whether a service threw an HttpException, a raw
 * web3.js error, or a plain Error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = this.resolveMessage(exception, isHttp);

    const logContext = {
      statusCode: status,
      method: request.method,
      path: request.url,
      message,
      // Only leak stack traces outside production.
      stack:
        process.env.NODE_ENV !== "production" && exception instanceof Error
          ? exception.stack
          : undefined,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logContext);
    } else {
      this.logger.warn(logContext);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }

  private resolveMessage(exception: unknown, isHttp: boolean): string {
    if (isHttp) {
      const res = (exception as HttpException).getResponse();
      if (typeof res === "string") return res;
      if (res && typeof res === "object" && "message" in res) {
        const { message } = res as { message: string | string[] };
        return Array.isArray(message) ? message.join(", ") : message;
      }
      return (exception as HttpException).message;
    }
    // Non-HTTP errors: don't expose internals to the client.
    return "Internal server error";
  }
}
