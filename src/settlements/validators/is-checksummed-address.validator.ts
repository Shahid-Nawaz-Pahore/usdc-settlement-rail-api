import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { getAddress } from 'ethers';

/**
 * Accepts only a correctly EIP-55 checksummed address. All-lowercase or
 * mis-cased addresses are rejected so the caller cannot accidentally fat-finger
 * a recipient — payouts are irreversible.
 */
export function IsChecksummedAddress(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isChecksummedAddress',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          try {
            return getAddress(value) === value;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a checksummed EVM address`;
        },
      },
    });
  };
}
