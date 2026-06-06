import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { Prisma } from '@prisma/client';

/**
 * Validates a positive decimal STRING with at most `maxDecimals` places. Amounts
 * are strings end-to-end so we never round-trip through a float.
 */
export function IsPositiveDecimal(
  maxDecimals: number,
  options?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isPositiveDecimal',
      target: object.constructor,
      propertyName,
      constraints: [maxDecimals],
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          const pattern = new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`);
          if (!pattern.test(value)) return false;
          try {
            return new Prisma.Decimal(value).gt(0);
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a positive number with at most ${maxDecimals} decimal places`;
        },
      },
    });
  };
}
