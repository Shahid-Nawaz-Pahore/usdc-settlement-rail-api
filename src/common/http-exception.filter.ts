import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
}

/**
 * Normalises every error into the consistent shape { statusCode, error, message }.
 *
 * Two safety properties:
 *  - Client errors (4xx, our HttpExceptions) pass their message through —
 *    validation details, "insufficient balance", etc. are safe to return.
 *  - Server errors (5xx, unexpected throws) are NEVER echoed to the client: the
 *    real message/stack (which may carry SQL, env values, or internals) is logged
 *    server-side, and the response carries only a generic message. This prevents
 *    leaking internals through error bodies.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        error = exception.name.replace(/Exception$/, '');
      } else {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error =
          (body.error as string) ?? exception.name.replace(/Exception$/, '');
      }
    }

    if (status >= 500) {
      // Log the true cause server-side; return a sanitized body to the client.
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      error = 'Internal Server Error';
      message = 'Internal server error';
    }

    const payload: ErrorBody = { statusCode: status, error, message };
    response.status(status).json(payload);
  }
}
