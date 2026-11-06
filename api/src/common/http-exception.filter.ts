import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Error as MongooseError } from 'mongoose';
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
    // A document Mongoose refuses is the caller's fault, never a server error.
    if (exception instanceof MongooseError.ValidationError) {
      const fields: Record<string, string[]> = {};
      for (const [path, detail] of Object.entries(exception.errors)) fields[path] = [detail.message];
      res.status(400).json({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', fields });
      return;
    }
    if (exception instanceof MongooseError.CastError) {
      res
        .status(400)
        .json({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', fields: { [exception.path]: [`${exception.path} is not valid`] } });
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
