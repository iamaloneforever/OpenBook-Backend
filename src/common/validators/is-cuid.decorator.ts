import {
  registerDecorator,
  ValidatorOptions,
  ValidationArguments,
} from 'class-validator';

export function IsCuid(validatorOption?: ValidatorOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsCuid',
      target: object.constructor,
      propertyName,
      options: validatorOption,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') {
            return false;
          }

          return /^c[a-z0-9]{24}$/i.test(value);
        },

        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid CUID`;
        },
      },
    });
  };
}
