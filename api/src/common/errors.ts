import { BadRequestException, NotFoundException } from '@nestjs/common';

/** 400 with a per-field map, the shape documented in docs/api.md. */
export function fieldErrors(fields: Record<string, string[]>): BadRequestException {
  return new BadRequestException({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', fields });
}

/** 404 "nowhere": an address that leads nowhere (never existed, or not a valid address). */
export function nowhere(address: string): NotFoundException {
  return new NotFoundException({ statusCode: 404, error: 'Not Found', message: 'nowhere', address });
}
