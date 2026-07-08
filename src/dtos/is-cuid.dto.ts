import { IsCuid } from "../validatos/is-cuid.decorator";
export class BookIDParamDto {
	@IsCuid()
	id: string;
}
