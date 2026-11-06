import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';

/** Every error leaves the API as JSON: { statusCode, error, message, ...extras }. */
@Catch()
export class JsonErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res
        .status(status)
        .json(typeof body === 'string' ? { statusCode: status, error: STATUS_CODES[status], message: body } : body);
      return;
    }
    const err = exception as { statusCode?: number; status?: number; message?: string };
    const status = err?.statusCode ?? err?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      // body-parser errors: 413 payload too large, malformed JSON, ...
      res.status(status).json({ statusCode: status, error: STATUS_CODES[status], message: err.message ?? STATUS_CODES[status] });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ statusCode: 500, error: 'Internal Server Error', message: 'Something went wrong' });
  }
}
