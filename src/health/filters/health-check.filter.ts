import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Response } from "express";

/**
 * Terminus reports "unhealthy" by throwing ServiceUnavailableException whose
 * body is the full report: { status, info, error, details }. Our global
 * AllExceptionsFilter would flatten that to { statusCode, message } and we'd
 * lose *which* indicator went down — the only interesting part of a 503 here.
 *
 * Nest resolves filters most-specific-first (method → controller → global), so
 * binding this one on HealthController with @UseFilters() means it wins for
 * /health while every other route keeps the global shape.
 */
@Catch(ServiceUnavailableException)
export class HealthCheckFilter implements ExceptionFilter {
  catch(exception: ServiceUnavailableException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    response
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json(exception.getResponse());
  }
}
