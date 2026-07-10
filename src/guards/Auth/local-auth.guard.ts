import {
	BadRequestException,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";

import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class LocalAuthGuard extends AuthGuard("local") {
	handleRequest(err: any, user: any, info: any) {
		console.log("Guard error:", err);
		console.log("User:", user);
		console.log("Info:", info);

		if (err) {
			throw err;
		}

		if (!user) {
			if (info?.message === "Missing credentials") {
				throw new BadRequestException("Username and password are required");
			}

			throw new UnauthorizedException(info?.message ?? "Unauthorized");
		}

		return user;
	}
}
