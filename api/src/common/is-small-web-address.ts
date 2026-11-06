import { registerDecorator, ValidationOptions } from 'class-validator';
import { ADDRESS_HINT, normalizeAddress } from './address';

/** class-validator decorator: the value must normalize to a valid small-web address. */
export function IsSmallWebAddress(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isSmallWebAddress',
      target: target.constructor,
      propertyName,
      options: { message: ADDRESS_HINT, ...options },
      validator: { validate: (value: unknown) => normalizeAddress(value).valid },
    });
}
