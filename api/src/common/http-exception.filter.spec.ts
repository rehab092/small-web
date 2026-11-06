import { ArgumentsHost } from '@nestjs/common';
import { Error as MongooseError } from 'mongoose';
import { JsonErrorFilter } from './http-exception.filter';

function run(error: unknown) {
  const out: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: unknown) {
      out.body = body;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new JsonErrorFilter().catch(error, host);
  return out as { status: number; body: Record<string, unknown> };
}

describe('JsonErrorFilter', () => {
  it('maps a Mongoose ValidationError to 400 with a per-field map, never 500', () => {
    const err = new MongooseError.ValidationError();
    err.addError('html', new MongooseError.ValidatorError({ path: 'html', message: 'Path `html` is required.', type: 'required' }));
    err.addError('text', new MongooseError.ValidatorError({ path: 'text', message: 'Path `text` is required.', type: 'required' }));
    const { status, body } = run(err);
    expect(status).toBe(400);
    expect(body).toMatchObject({ statusCode: 400, error: 'Bad Request', message: 'Validation failed' });
    expect(body.fields).toEqual({ html: ['Path `html` is required.'], text: ['Path `text` is required.'] });
  });

  it('maps a Mongoose CastError to 400', () => {
    const err = new MongooseError.CastError('ObjectId', 'nope', 'cursor');
    const { status, body } = run(err);
    expect(status).toBe(400);
    expect(body.fields).toHaveProperty('cursor');
  });

  it.each(['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError', 'MongoNotConnectedError'])(
    'answers 503, not 500, when the database goes away (%s)',
    (name) => {
      const { status, body } = run(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:27018'), { name }));
      expect(status).toBe(503);
      expect(body).toEqual({ statusCode: 503, error: 'Service Unavailable', message: 'database unavailable' });
    },
  );

  it('still hides unexpected errors behind a generic 500', () => {
    const { status, body } = run(new Error('db password leaked in message'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('password');
  });
});
