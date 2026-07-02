import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { IsCuid } from "../decorators/is-cuid.decorator";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

class CuidParams {
	@IsCuid()
	id: string;
}

@Injectable()
export class CuidValitationPipe implements PipeTransform {
	async transform(value: any) {
		const params = plainToInstance(CuidParams, { id: value });
		const errors = await validate(params);
		if (errors.length > 0) {
			throw new BadRequestException("Invalid CUID format");
		}
		return value;
	}
}
