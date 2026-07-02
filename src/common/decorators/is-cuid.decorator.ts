import {
	registerDecorator,
	ValidationOptions,
	ValidatorConstraint,
	ValidatorConstraintInterface,
} from "class-validator";
@ValidatorConstraint({ name: "isCuid", async: false })
export class IsCuidConstraint implements ValidatorConstraintInterface {
	validate(text: string): Promise<boolean> | boolean {
		const cuidRegex = /^c[a-z0-9]{24}$/;
		return cuidRegex.test(text);
	}
	defaultMessage() {
		return "ID must be a valid CUID format";
	}
}
export function IsCuid(validationOptions?: ValidationOptions) {
	return function (object: Object, propertyName: string) {
		registerDecorator({
			target: object.constructor,
			propertyName: propertyName,
			options: validationOptions,
			constraints: [],
			validator: IsCuidConstraint,
		});
	};
}
